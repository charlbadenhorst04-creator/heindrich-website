import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession
from app.models.cart import Cart, CartItem
from app.models.product import Product
from app.schemas.cart import CartItemCreate, CartItemUpdate, CartRead

router = APIRouter(prefix="/cart", tags=["cart"])


async def _get_or_create_cart(db: DbSession, session_key: str) -> Cart:
    stmt = (
        select(Cart)
        .where(Cart.session_key == session_key)
        .options(selectinload(Cart.items).selectinload(CartItem.product).selectinload(Product.category))
    )
    cart = (await db.execute(stmt)).scalar_one_or_none()
    if cart is None:
        cart = Cart(session_key=session_key)
        db.add(cart)
        await db.commit()
        await db.refresh(cart, attribute_names=["items"])
    return cart


@router.get("/{session_key}", response_model=CartRead)
async def get_cart(session_key: str, db: DbSession) -> CartRead:
    cart = await _get_or_create_cart(db, session_key)
    return CartRead.model_validate(cart)


@router.post("/{session_key}/items", response_model=CartRead)
async def add_item(session_key: str, payload: CartItemCreate, db: DbSession) -> CartRead:
    cart = await _get_or_create_cart(db, session_key)

    product = await db.get(Product, payload.product_id)
    if product is None or not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found")

    existing_item = next((i for i in cart.items if i.product_id == payload.product_id), None)
    if existing_item is not None:
        existing_item.quantity += payload.quantity
    else:
        cart.items.append(CartItem(product_id=payload.product_id, quantity=payload.quantity))

    await db.commit()
    return await get_cart(session_key, db)


@router.patch("/{session_key}/items/{item_id}", response_model=CartRead)
async def update_item(
    session_key: str, item_id: uuid.UUID, payload: CartItemUpdate, db: DbSession
) -> CartRead:
    cart = await _get_or_create_cart(db, session_key)
    item = next((i for i in cart.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")

    item.quantity = payload.quantity
    await db.commit()
    return await get_cart(session_key, db)


@router.delete("/{session_key}/items/{item_id}", response_model=CartRead)
async def remove_item(session_key: str, item_id: uuid.UUID, db: DbSession) -> CartRead:
    cart = await _get_or_create_cart(db, session_key)
    item = next((i for i in cart.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Cart item not found")

    # Removing from the (already-loaded) collection - rather than calling
    # db.delete(item) directly - keeps the in-memory relationship and the
    # database in sync in one step: the "delete-orphan" cascade on
    # Cart.items issues the DELETE at flush time. Deleting the child object
    # directly leaves the parent's already-loaded `items` list stale for
    # the rest of this request, even though the DB row is correctly gone.
    cart.items.remove(item)
    await db.commit()
    return await get_cart(session_key, db)
