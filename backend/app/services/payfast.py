"""Payfast integration.

Payfast is the payment gateway used for all card transactions on MERAVO.
It handles card capture entirely on its own hosted, PCI-compliant page -
no card or bank account number is ever sent to, or stored by, this
application. Funds settle into whatever South African bank account the
merchant has linked on their Payfast dashboard.

Docs: https://developers.payfast.co.za/docs
"""

import hashlib
import uuid
from urllib.parse import quote_plus

import httpx

from app.core.config import settings


def _encode(value: str) -> str:
    return quote_plus(str(value)).replace("%20", "+")


def build_signature(fields: dict[str, str], passphrase: str = "") -> str:
    """Payfast requires an MD5 signature over the fields in the exact
    order they are set (excluding an already-present `signature` key),
    URL-encoded the same way PHP's urlencode() does."""
    pairs = [f"{key}={_encode(value)}" for key, value in fields.items() if key != "signature" and value != ""]
    query = "&".join(pairs)
    if passphrase:
        query += f"&passphrase={_encode(passphrase)}"
    return hashlib.md5(query.encode("utf-8")).hexdigest()


def build_checkout_fields(*, order_id: uuid.UUID, amount: float, item_name: str, customer_email: str, customer_name: str) -> dict[str, str]:
    name_parts = customer_name.strip().split(" ", 1)
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    fields = {
        "merchant_id": settings.PAYFAST_MERCHANT_ID,
        "merchant_key": settings.PAYFAST_MERCHANT_KEY,
        "return_url": settings.PAYFAST_RETURN_URL,
        "cancel_url": settings.PAYFAST_CANCEL_URL,
        "notify_url": settings.PAYFAST_NOTIFY_URL,
        "name_first": first_name,
        "name_last": last_name,
        "email_address": customer_email,
        "m_payment_id": str(order_id),
        "amount": f"{amount:.2f}",
        "item_name": item_name[:100],
    }
    fields["signature"] = build_signature(fields, settings.PAYFAST_PASSPHRASE)
    return fields


async def verify_itn_with_payfast(raw_body: dict[str, str]) -> bool:
    """Per Payfast's ITN spec, the notify payload must be posted back to
    Payfast so it can confirm the request genuinely originated from them."""
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(
            f"{settings.payfast_host}/eng/query/validate",
            data=raw_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        return response.text.strip() == "VALID"
