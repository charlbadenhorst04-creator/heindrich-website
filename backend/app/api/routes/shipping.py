from fastapi import APIRouter

from app.core.shipping import (
    COURIER_NAME,
    ESTIMATED_DELIVERY_DAYS,
    FLAT_SHIPPING_FEE,
    FREE_SHIPPING_THRESHOLD,
)
from app.schemas.shipping import ShippingConfig

router = APIRouter(prefix="/shipping", tags=["shipping"])


@router.get("/config", response_model=ShippingConfig)
async def get_shipping_config() -> ShippingConfig:
    return ShippingConfig(
        courier=COURIER_NAME,
        flat_fee=FLAT_SHIPPING_FEE,
        free_shipping_threshold=FREE_SHIPPING_THRESHOLD,
        estimated_delivery=ESTIMATED_DELIVERY_DAYS,
    )
