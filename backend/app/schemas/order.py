import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.order import OrderStatus


class CheckoutRequest(BaseModel):
    """Every max_length here mirrors the matching column on `orders`.

    Without them an over-long value reaches PostgreSQL and fails there,
    which surfaces to the shopper as a 500 on the last step of the sale
    instead of a field-level validation message.
    """

    session_key: str = Field(min_length=1, max_length=200)
    customer_email: EmailStr = Field(max_length=255)
    customer_name: str = Field(min_length=1, max_length=200)
    shipping_address: str = Field(min_length=1, max_length=500)
    city: str = Field(min_length=1, max_length=120)
    postal_code: str = Field(min_length=1, max_length=20)
    province: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=30)


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_name: str
    unit_price: float
    quantity: int


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_email: str
    customer_name: str
    shipping_address: str
    city: str
    postal_code: str
    province: str
    subtotal_amount: float
    shipping_fee: float
    total_amount: float
    status: OrderStatus
    courier: str
    tracking_number: str
    items: list[OrderItemRead]


class PayfastInitiateResponse(BaseModel):
    order_id: uuid.UUID
    action_url: str
    fields: dict[str, str]
