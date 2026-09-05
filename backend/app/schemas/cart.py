import uuid

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.schemas.product import ProductRead


class CartItemCreate(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(gt=0, default=1)


class CartItemUpdate(BaseModel):
    quantity: int = Field(gt=0)


class CartItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quantity: int
    product: ProductRead


class CartRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_key: str
    items: list[CartItemRead]

    @computed_field
    @property
    def total(self) -> float:
        return sum(item.product.price * item.quantity for item in self.items)
