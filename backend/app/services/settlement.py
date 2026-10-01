"""What happens when Stitch says a payment completed - or did not.

Stitch confirms the same payment down two independent paths at once: the
customer's browser coming back from the payment page, and Stitch's own
webhook. Those routinely arrive within milliseconds of each other.

So "mark paid" is a single conditional UPDATE rather than a read followed by
a write. Postgres lets exactly one of any number of concurrent callers move
the row to paid, and only that caller goes on to draw down stock and send
the notifications. Neither path is believed on its own: both only prompt a
server-to-server question to Stitch (``reconcile``), and only Stitch's
answer decides anything. Mirrors frontend/netlify/functions/_shared/
settle.mts and reconcile.mts.
"""

import logging
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order, OrderStatus
from app.models.product import Product
from app.services.stitch import get_payment_request

logger = logging.getLogger(__name__)

# Only an order not yet paid can become paid. One the shop has since marked
# shipped or complete is past "paid", and a late webhook must not take its
# stock again or re-send its emails.
UNPAID = (OrderStatus.PENDING, OrderStatus.FAILED, OrderStatus.CANCELLED)


def _cents(amount) -> int:
    return round(float(amount) * 100)


async def settle_paid(db: AsyncSession, order_id: uuid.UUID) -> Order | None:
    """Mark an order paid and draw down its stock.

    Returns the order, with its items loaded, only to the caller that
    actually made the change - that caller sends the notifications. Every
    other caller, concurrent or later, gets None.
    """
    changed = await db.execute(
        update(Order)
        .where(Order.id == order_id, Order.status.in_(UNPAID))
        .values(status=OrderStatus.PAID)
        .returning(Order.id)
    )
    if changed.first() is None:
        await db.commit()
        return None

    order = (
        await db.execute(
            select(Order)
            .where(Order.id == order_id)
            .options(selectinload(Order.items))
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    for item in order.items:
        # Subtracted inside the database, never below zero, so two orders
        # for the same product confirmed at once both count.
        await db.execute(
            update(Product)
            .where(Product.id == item.product_id)
            .values(stock=func.greatest(Product.stock - item.quantity, 0))
        )
    await db.commit()
    return order


async def settle_failed(db: AsyncSession, order_id: uuid.UUID) -> None:
    """Only a pending order can fail: a paid one is never walked back by a
    late or out-of-order "cancelled"."""
    await db.execute(
        update(Order)
        .where(Order.id == order_id, Order.status == OrderStatus.PENDING)
        .values(status=OrderStatus.FAILED)
    )
    await db.commit()


async def reconcile(db: AsyncSession, order: Order) -> tuple[OrderStatus, Order | None]:
    """Bring an order in line with what Stitch says actually happened.

    Returns the resulting status and, if this call is the one that marked
    it paid, the order to send notifications for. Raises StitchError if
    Stitch cannot be reached, so the caller can ask again later.
    """
    if order.status not in UNPAID:
        return order.status, None
    if not order.provider_reference:
        return order.status, None

    request = await get_payment_request(order.provider_reference)
    if request is None:
        logger.warning("Order %s: Stitch does not know request %s", order.id, order.provider_reference)
        return order.status, None

    # The request was created for this order, so these can only disagree if
    # something has gone badly wrong. Refuse to settle rather than guess.
    if request.external_reference and request.external_reference != str(order.id):
        logger.error(
            "Order %s: Stitch request %s belongs to %s; not settling",
            order.id, request.id, request.external_reference,
        )
        return order.status, None

    if request.state == "completed":
        if request.amount_cents is not None and request.amount_cents != _cents(order.total_amount):
            logger.error(
                "Order %s: Stitch reports %s cents paid, order is %s; not settling",
                order.id, request.amount_cents, _cents(order.total_amount),
            )
            return order.status, None
        if request.amount_cents is None:
            # Created server-side with the order's own total and bound to it
            # by id, so a missing amount is a format surprise, not a short
            # payment. Logged so it gets noticed.
            logger.warning("Order %s: Stitch's answer carried no readable amount", order.id)
        settled = await settle_paid(db, order.id)
        return OrderStatus.PAID, settled

    if request.state in ("cancelled", "expired"):
        await settle_failed(db, order.id)
        return (OrderStatus.FAILED if order.status == OrderStatus.PENDING else order.status), None

    if request.state == "unknown":
        logger.warning("Order %s: unrecognised Stitch state %s; left pending", order.id, request.raw_state)
    return order.status, None
