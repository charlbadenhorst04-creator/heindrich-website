from pydantic import BaseModel


class ShippingConfig(BaseModel):
    courier: str
    flat_fee: float
    free_shipping_threshold: float
    estimated_delivery: str
    # Whether checkout takes card payments right now. When false the
    # storefront shows payments_message and a WhatsApp handover instead.
    payments_enabled: bool
    payments_provider: str | None
    payments_message: str
    whatsapp_number: str
