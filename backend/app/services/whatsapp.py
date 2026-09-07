"""WhatsApp order confirmation.

Sent to the customer once Payfast confirms their payment, alongside the
confirmation email.

Two constraints from WhatsApp itself shape this module:

1. A business cannot send free-form text to someone who has not messaged it
   in the last 24 hours. An order confirmation is business-initiated, so it
   must go out as a *template* that Meta has approved in advance. That is
   why the message is assembled as an ordered list of parameters rather
   than a sentence - the wording lives in the approved template, and the
   order of `template_parameters()` has to match it exactly.

2. Numbers must be in international form. Shoppers type local ones
   ("082 123 4567"), so they are converted here.

As with email, nothing raises: a messaging failure must never turn a
confirmed payment into a failed Payfast callback.
"""

import logging
import re

import httpx

from app.core.config import settings
from app.models.order import Order

logger = logging.getLogger(__name__)


def normalise_msisdn(raw: str, country_code: str | None = None) -> str | None:
    """Convert a typed phone number to international digits, or None if it
    cannot be one.

    Returns digits only, without a leading "+" - the form Meta's API wants.
    """
    if not raw:
        return None

    country_code = (country_code or settings.WHATSAPP_COUNTRY_CODE).lstrip("+")
    had_plus = raw.strip().startswith("+")
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None

    if had_plus:
        pass  # already international
    elif digits.startswith("00"):
        digits = digits[2:]  # 00 is the other way of writing +
    elif digits.startswith("0"):
        # A local number: 082... -> 27 82...
        digits = country_code + digits[1:]
    elif not digits.startswith(country_code):
        # No 0, no country code, no "+": too ambiguous to guess at.
        return None

    # E.164 allows 8-15 digits. Anything outside that is a typo, and sending
    # to it would either fail or reach a stranger.
    if not 8 <= len(digits) <= 15:
        return None
    return digits


def template_parameters(order: Order) -> list[str]:
    """The values substituted into {{1}}...{{4}} of the approved template.

    Keep this in step with the template registered with the provider - see
    the WhatsApp section of the README for the exact wording.
    """
    return [
        order.customer_name.split(" ")[0] or order.customer_name,
        str(order.id),
        f"R {float(order.total_amount):,.2f}",
        order.courier,
    ]


def plain_message(order: Order) -> str:
    """Fallback wording for the Twilio sandbox, which accepts free-form text.

    Mirrors the approved template so testing looks like production.
    """
    first_name, order_id, total, courier = template_parameters(order)
    return (
        f"Hi {first_name}! Thanks for shopping with MERAVO. "
        f"Your order {order_id} for {total} is confirmed and we're getting it ready. "
        f"We'll send your {courier} tracking number as soon as it ships."
    )


async def _send_via_meta(client: httpx.AsyncClient, to: str, order: Order) -> None:
    url = (
        f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}"
        f"/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_TEMPLATE_NAME,
            "language": {"code": settings.WHATSAPP_TEMPLATE_LANGUAGE},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": value}
                        for value in template_parameters(order)
                    ],
                }
            ],
        },
    }
    response = await client.post(
        url,
        json=payload,
        headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
    )
    response.raise_for_status()


async def _send_via_twilio(client: httpx.AsyncClient, to: str, order: Order) -> None:
    url = (
        "https://api.twilio.com/2010-04-01/Accounts/"
        f"{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    )
    form = {
        "From": f"whatsapp:{settings.TWILIO_WHATSAPP_FROM.removeprefix('whatsapp:')}",
        "To": f"whatsapp:+{to}",
    }
    if settings.TWILIO_CONTENT_SID:
        form["ContentSid"] = settings.TWILIO_CONTENT_SID
        # Twilio numbers content variables from "1".
        form["ContentVariables"] = _twilio_content_variables(order)
    else:
        form["Body"] = plain_message(order)

    response = await client.post(
        url,
        data=form,
        auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
    )
    response.raise_for_status()


def _twilio_content_variables(order: Order) -> str:
    import json

    return json.dumps(
        {str(index): value for index, value in enumerate(template_parameters(order), start=1)}
    )


async def send_order_whatsapp(order: Order) -> None:
    """Message the customer that their paid order is confirmed.

    Swallows every failure by design - see the module docstring.
    """
    if not settings.whatsapp_enabled:
        logger.info(
            "Order %s paid - WhatsApp not sent because WHATSAPP_PROVIDER is not set", order.id
        )
        return

    to = normalise_msisdn(order.phone)
    if to is None:
        logger.info(
            "Order %s paid - no usable WhatsApp number on the order (phone=%r)",
            order.id,
            order.phone,
        )
        return

    provider = settings.WHATSAPP_PROVIDER.strip().lower()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if provider == "meta":
                await _send_via_meta(client, to, order)
            else:
                await _send_via_twilio(client, to, order)
        logger.info("Order %s: WhatsApp confirmation sent via %s", order.id, provider)
    except httpx.HTTPStatusError as exc:
        # The provider's body says why (bad token, unapproved template,
        # number not on WhatsApp), and is the first thing worth reading.
        logger.error(
            "Order %s: WhatsApp send rejected by %s (HTTP %s): %s",
            order.id,
            provider,
            exc.response.status_code,
            exc.response.text[:500],
        )
    except Exception:
        logger.exception("Order %s: could not send WhatsApp confirmation", order.id)
