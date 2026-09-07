import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.models.cart import Cart, CartItem
from app.models.order import Order, OrderItem
from app.schemas.order import CheckoutRequest, OrderRead, PayfastInitiateResponse
from app.services.payfast import build_checkout_fields
from app.core.config import settings
from app.core.shipping import COURIER_NAME, compute_shipping_fee

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("/checkout", response_model=PayfastInitiateResponse)
async def checkout(payload: CheckoutRequest, db: DbSession) -> PayfastInitiateResponse:
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

    fields = build_checkout_fields(
        order_id=order.id,
        amount=float(total),
        item_name=f"MERAVO order {order.id}",
        customer_email=payload.customer_email,
        customer_name=payload.customer_name,
    )

    await db.commit()

    return PayfastInitiateResponse(
        order_id=order.id,
        action_url=f"{settings.payfast_host}/eng/process",
        fields=fields,
    )


@router.get("/{order_id}", response_model=OrderRead)
async def get_order(order_id: uuid.UUID, db: DbSession) -> OrderRead:
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    order = (await db.execute(stmt)).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderRead.model_validate(order)
