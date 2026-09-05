from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.api.deps import DbSession
from app.models.order import Order, OrderStatus
from app.services.payfast import build_signature, verify_itn_with_payfast
from app.core.config import settings

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/payfast/notify")
async def payfast_notify(request: Request, db: DbSession) -> Response:
    """Payfast's server-to-server ITN (Instant Transaction Notification).

    We must (1) verify the signature, (2) ask Payfast to confirm the
    payload is genuinely theirs, and (3) check the amount matches our
    order before marking anything as paid.
    """
    form = await request.form()
    data = {key: str(value) for key, value in form.items()}

    signature = data.get("signature", "")
    expected_signature = build_signature(data, settings.PAYFAST_PASSPHRASE)
    if signature != expected_signature:
        return Response(status_code=400, content="invalid signature")

    if not await verify_itn_with_payfast(data):
        return Response(status_code=400, content="not confirmed by payfast")

    order_id = data.get("m_payment_id")
    payment_status = data.get("payment_status", "")
    amount_gross = data.get("amount_gross", "0")

    if not order_id:
        return Response(status_code=400, content="missing order id")

    order = await db.get(Order, order_id)
    if order is None:
        return Response(status_code=404, content="order not found")

    if float(amount_gross) != float(order.total_amount):
        return Response(status_code=400, content="amount mismatch")

    order.payfast_payment_id = data.get("pf_payment_id", "")
    order.status = OrderStatus.PAID if payment_status == "COMPLETE" else OrderStatus.FAILED
    await db.commit()

    return Response(status_code=200, content="OK")
