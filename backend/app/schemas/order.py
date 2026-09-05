import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.order import OrderStatus


class CheckoutRequest(BaseModel):
    session_key: str
    customer_email: EmailStr
    customer_name: str = Field(min_length=1)
    shipping_address: str = Field(min_length=1)
    city: str = Field(min_length=1)
    postal_code: str = Field(min_length=1)
    province: str = Field(min_length=1)
    phone: str = ""


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
