import uuid
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, BackgroundTasks, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.services.email import send_order_emails
from app.services.payfast import signature_matches, verify_itn_with_payfast
from app.services.whatsapp import send_order_whatsapp
from app.core.config import settings

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/payfast/notify")
async def payfast_notify(
    request: Request, db: DbSession, background_tasks: BackgroundTasks
) -> Response:
    """Payfast's server-to-server ITN (Instant Transaction Notification).

    We must (1) verify the signature, (2) ask Payfast to confirm the
    payload is genuinely theirs, and (3) check the amount matches our
    order before marking anything as paid.

    Every field here arrives from the network, so nothing is trusted
    until it has been parsed and validated - a malformed order id or
    amount must produce a 400, never an unhandled 500.
    """
    form = await request.form()
    data = {key: str(value) for key, value in form.items()}

    if not signature_matches(data, settings.PAYFAST_PASSPHRASE):
        return Response(status_code=400, content="invalid signature")

    if not await verify_itn_with_payfast(data):
        return Response(status_code=400, content="not confirmed by payfast")

    raw_order_id = data.get("m_payment_id", "")
    if not raw_order_id:
        return Response(status_code=400, content="missing order id")
    try:
        order_id = uuid.UUID(raw_order_id)
    except ValueError:
        return Response(status_code=400, content="malformed order id")

    try:
        amount_gross = Decimal(data.get("amount_gross", ""))
    except (InvalidOperation, ValueError):
        return Response(status_code=400, content="malformed amount")

    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        return Response(status_code=404, content="order not found")

    # Compare in cents so no float rounding can let a short payment through.
    if _to_cents(amount_gross) != _to_cents(Decimal(order.total_amount)):
        return Response(status_code=400, content="amount mismatch")

    # Payfast retries an ITN until it gets a 200, so the same notification
    # can legitimately arrive more than once. Settle the stock exactly once
    # and never walk an already-paid order back to a failed state.
    already_paid = order.status == OrderStatus.PAID
    payment_complete = data.get("payment_status", "") == "COMPLETE"

    order.payfast_payment_id = data.get("pf_payment_id", "")

    newly_paid = False
    if payment_complete:
        if not already_paid:
            order.status = OrderStatus.PAID
            await _reduce_stock(db, order)
            newly_paid = True
    elif not already_paid:
        order.status = OrderStatus.FAILED

    await db.commit()

    if newly_paid:
        # Queued as a background task so the 200 below reaches Payfast
        # immediately - a slow mail server must not delay the callback.
        # Guarded by `newly_paid`, so a retried notification for an order
        # already marked paid does not email anyone a second time.
        await db.refresh(order, attribute_names=["items"])
        background_tasks.add_task(send_order_emails, order)
        background_tasks.add_task(send_order_whatsapp, order)

    return Response(status_code=200, content="OK")


def _to_cents(amount: Decimal) -> int:
    return int((amount * 100).to_integral_value())


async def _reduce_stock(db: DbSession, order: Order) -> None:
    """Draw down stock for a newly-paid order, never below zero.

    Done as a single UPDATE per item so the subtraction happens inside the
    database. Reading the stock into Python, subtracting and writing it
    back would lose one of two decrements if two orders for the same
    product were confirmed at the same moment.
    """
    for item in order.items:
        await db.execute(
            update(Product)
            .where(Product.id == item.product_id)
            .values(stock=func.greatest(Product.stock - item.quantity, 0))
        )
