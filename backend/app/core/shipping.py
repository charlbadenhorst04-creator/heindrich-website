"""Shipping/courier configuration.

MERAVO ships nationwide across South Africa via Aramex.
"""

COURIER_NAME = "Aramex"
FLAT_SHIPPING_FEE = 99.00
FREE_SHIPPING_THRESHOLD = 1500.00
ESTIMATED_DELIVERY_DAYS = "2-4 business days"


def compute_shipping_fee(subtotal: float) -> float:
    if subtotal >= FREE_SHIPPING_THRESHOLD:
        return 0.0
    return FLAT_SHIPPING_FEE
