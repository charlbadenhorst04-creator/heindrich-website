"""Payment confirmation: the return-page check and Stitch's webhook.

Neither is believed on its own. The customer's browser arrives back from
Stitch with a status on the URL, which Stitch's own docs warn can be
tampered with; a webhook body could be forged or replayed. Both only say
which order to go and look at - ``reconcile`` then asks Stitch, server to
server, and only that answer decides anything about money.
"""

import json
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from sqlalchemy import or_, select

from app.api.deps import DbSession
from app.core.config import settings
from app.models.order import Order
from app.schemas.order import PaymentConfirmation, PaymentConfirmRequest
from app.services.email import send_order_emails
from app.services.settlement import reconcile
from app.services.stitch import StitchError, verify_webhook_signature, webhook_candidates
from app.services.whatsapp import send_order_whatsapp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


def _notify(background_tasks: BackgroundTasks, order: Order | None) -> None:
    """Queued as background tasks so the response is not held up by a slow
    mail server. Only the caller that actually marked the order paid gets an
    order here, so a repeated confirmation never notifies anyone twice."""
    if order is not None:
        background_tasks.add_task(send_order_emails, order)
        background_tasks.add_task(send_order_whatsapp, order)


@router.post("/confirm", response_model=PaymentConfirmation)
async def confirm_payment(
    payload: PaymentConfirmRequest, db: DbSession, background_tasks: BackgroundTasks
) -> PaymentConfirmation:
    """Where the order-success page asks "did this actually get paid?"."""
    order = await db.get(Order, payload.order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    status = order.status
    if settings.stitch_configured:
        try:
            status, newly_paid = await reconcile(db, order)
            _notify(background_tasks, newly_paid)
        except StitchError as error:
            # Stitch unreachable for a moment: report what is known and let
            # the page ask again. The webhook settles it regardless.
            logger.error("Order %s: could not check with Stitch: %s", order.id, error)

    return PaymentConfirmation(order_id=order.id, status=status)


@router.post("/stitch/webhook")
async def stitch_webhook(
    request: Request, db: DbSession, background_tasks: BackgroundTasks
) -> Response:
    """Stitch's webhook: the confirmation that does not depend on the
    customer's browser making it back. Someone who pays and then closes the
    tab still paid - this is what catches them.

    Refused outright unless STITCH_WEBHOOK_SECRET is set and the signature
    checks out, so strangers cannot make this server call Stitch's API on
    their behalf.
    """
    # The signature covers the body byte for byte, so it is read raw.
    body = await request.body()

    secret = settings.STITCH_WEBHOOK_SECRET.strip()
    headers = request.headers
    if not secret or not verify_webhook_signature(
        msg_id=headers.get("svix-id") or headers.get("webhook-id"),
        timestamp=headers.get("svix-timestamp") or headers.get("webhook-timestamp"),
        signature=headers.get("svix-signature") or headers.get("webhook-signature"),
        body=body,
        secret=secret,
    ):
        return Response(status_code=401, content="invalid signature")

    try:
        payload = json.loads(body)
    except ValueError:
        return Response(status_code=400, content="expected JSON")

    ids, refs = webhook_candidates(payload)
    order_ids = []
    for ref in refs:
        try:
            order_ids.append(uuid.UUID(ref))
        except ValueError:
            continue
    if not order_ids and not ids:
        # Nothing that could name an order. Acknowledged so it is not retried.
        return Response(status_code=200, content="OK")

    # Only orders this shop created, found by our own id or by the Stitch
    # reference stored when the request was created.
    conditions = []
    if order_ids:
        conditions.append(Order.id.in_(order_ids))
    if ids:
        conditions.append((Order.provider_reference != "") & Order.provider_reference.in_(ids))
    orders = (await db.execute(select(Order).where(or_(*conditions)).limit(5))).scalars().all()

    try:
        for order in orders:
            _, newly_paid = await reconcile(db, order)
            _notify(background_tasks, newly_paid)
    except StitchError as error:
        # A 500 makes Stitch's webhook service retry later, which is wanted.
        logger.error("Stitch webhook: could not reconcile: %s", error)
        return Response(status_code=500, content="retry")

    return Response(status_code=200, content="OK")
