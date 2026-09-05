from pydantic import BaseModel


class ShippingConfig(BaseModel):
    courier: str
    flat_fee: float
    free_shipping_threshold: float
    estimated_delivery: str
