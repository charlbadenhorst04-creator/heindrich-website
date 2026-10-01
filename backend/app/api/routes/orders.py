import logging
import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.models.cart import Cart, CartItem
from app.models.order import Order, OrderItem
from app.schemas.order import CheckoutRequest, CheckoutResponse, OrderRead
from app.services.stitch import StitchError, create_payment_request
from app.core.config import settings
from app.core.shipping import COURIER_NAME, compute_shipping_fee

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("/checkout", response_model=CheckoutResponse)
async def checkout(payload: CheckoutRequest, db: DbSession) -> CheckoutResponse:
    # Without a Stitch account nobody can pay, so no order is recorded that
    # would only sit there looking like a lost sale.
    if not settings.payments_open:
        raise HTTPException(status_code=503, detail=settings.PAYMENTS_CLOSED_MESSAGE)

    stmt = (
        select(Cart)
        .where(Cart.session_key == payload.session_key)
        .options(selectinload(Cart.items).selectinload(CartItem.product))
    )
    cart = (await db.execute(stmt)).scalar_one_or_none()
    if cart is None or not cart.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # Stock is checked when an item goes into the cart, but a cart can sit
    # for days - the last unit may have sold in the meantime. Re-check here,
    # at the point of sale, so we never take payment for goods we cannot
    # ship. Same for a product that has since been de-listed.
    for item in cart.items:
        product = item.product
        if not product.is_active:
            raise HTTPException(
                status_code=409,
                detail=f"{product.name} is no longer available. Please remove it from your cart.",
            )
        if product.stock == 0:
            raise HTTPException(
                status_code=409,
                detail=f"{product.name} is out of stock. Please remove it from your cart.",
            )
        if item.quantity > product.stock:
            raise HTTPException(
                status_code=409,
                detail=f"Only {product.stock} of {product.name} left in stock",
            )

    subtotal = float(sum(item.product.price * item.quantity for item in cart.items))
    shipping_fee = compute_shipping_fee(subtotal)
    total = subtotal + shipping_fee

    order = Order(
        customer_email=payload.customer_email,
        customer_name=payload.customer_name,
        shipping_address=payload.shipping_address,
        city=payload.city,
        postal_code=payload.postal_code,
        province=payload.province,
        phone=payload.phone,
        subtotal_amount=subtotal,
        shipping_fee=shipping_fee,
        total_amount=total,
        courier=COURIER_NAME,
    )
    order.items = [
        OrderItem(
            product_id=item.product_id,
            product_name=item.product.name,
            unit_price=item.product.price,
            quantity=item.quantity,
        )
        for item in cart.items
    ]
    db.add(order)
    await db.flush()

    try:
        payment = await create_payment_request(
            order_id=str(order.id), amount=total, return_url=settings.return_url
        )
    except StitchError as error:
        # Nothing is committed, so no unpayable order is left behind.
        await db.rollback()
        logger.error("Checkout: Stitch could not create a payment request: %s", error)
        raise HTTPException(
            status_code=502,
            detail="We couldn't open the secure payment page just now. Please try again in a moment.",
        ) from error

    order.provider_reference = payment.id
    await db.commit()

    return CheckoutResponse(order_id=order.id, redirect_url=payment.redirect_url)


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(order_id: uuid.UUID, db: DbSession) -> OrderRead:
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderRead.model_validate(order)
