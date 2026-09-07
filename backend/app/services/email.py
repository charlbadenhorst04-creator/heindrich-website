"""Order notification email.

Two messages go out the moment Payfast confirms a payment: one to the shop
owner so they know to pack and ship, and one to the customer as their
receipt.

Nothing in here is allowed to break a payment. Every send is wrapped so a
misconfigured or unreachable mail server logs a warning and nothing more -
if an SMTP failure propagated, the Payfast callback would return an error,
Payfast would retry it, and a real paid order could be left unconfirmed.
"""

import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import settings
from app.core.shipping import ESTIMATED_DELIVERY_DAYS
from app.models.order import Order

logger = logging.getLogger(__name__)


def _money(amount: float) -> str:
    return f"R {float(amount):,.2f}"


def _items_text(order: Order) -> str:
    return "\n".join(
        f"  - {item.product_name} x{item.quantity}  {_money(item.unit_price * item.quantity)}"
        for item in order.items
    )


def _items_html(order: Order) -> str:
    rows = "".join(
        f"<tr>"
        f'<td style="padding:8px 0;border-bottom:1px solid #f6e3e5;">{item.product_name}</td>'
        f'<td style="padding:8px 0;border-bottom:1px solid #f6e3e5;text-align:center;">{item.quantity}</td>'
        f'<td style="padding:8px 0;border-bottom:1px solid #f6e3e5;text-align:right;">'
        f"{_money(item.unit_price * item.quantity)}</td>"
        f"</tr>"
        for item in order.items
    )
    return (
        '<table style="width:100%;border-collapse:collapse;font-size:14px;">'
        '<tr style="text-align:left;color:#8f2f40;font-size:12px;text-transform:uppercase;">'
        '<th style="padding-bottom:6px;">Item</th>'
        '<th style="padding-bottom:6px;text-align:center;">Qty</th>'
        '<th style="padding-bottom:6px;text-align:right;">Total</th></tr>'
        f"{rows}</table>"
    )


def _totals_html(order: Order) -> str:
    shipping = "Free" if float(order.shipping_fee) == 0 else _money(order.shipping_fee)
    return (
        '<table style="width:100%;font-size:14px;margin-top:12px;">'
        f'<tr><td style="padding:2px 0;">Subtotal</td>'
        f'<td style="padding:2px 0;text-align:right;">{_money(order.subtotal_amount)}</td></tr>'
        f'<tr><td style="padding:2px 0;">Shipping ({order.courier})</td>'
        f'<td style="padding:2px 0;text-align:right;">{shipping}</td></tr>'
        f'<tr style="font-weight:bold;color:#611c2b;font-size:16px;">'
        f'<td style="padding-top:8px;border-top:1px solid #f6e3e5;">Total</td>'
        f'<td style="padding-top:8px;border-top:1px solid #f6e3e5;text-align:right;">'
        f"{_money(order.total_amount)}</td></tr></table>"
    )


def _shell(title: str, intro: str, body: str) -> str:
    return f"""\
<div style="background:#fdf6f3;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#4a1520;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:#7a2436;letter-spacing:2px;">MERAVO</p>
    <p style="margin:0 0 20px;font-size:12px;color:#96692b;">Your Style. Your Story.</p>
    <h1 style="margin:0 0 8px;font-size:20px;color:#611c2b;">{title}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#611c2b;">{intro}</p>
    {body}
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#8f2f40;text-align:center;">
    MERAVO &middot; {settings.SHOP_OWNER_EMAIL} &middot; {settings.SHOP_CONTACT_PHONE}
  </p>
</div>"""


def build_owner_email(order: Order) -> EmailMessage:
    """What the shop owner needs in order to pack and ship, without having
    to open the site or the database."""
    message = EmailMessage()
    message["Subject"] = f"New paid order - {_money(order.total_amount)} - {order.customer_name}"
    message["To"] = settings.SHOP_OWNER_EMAIL
    # So hitting reply goes straight to the customer.
    message["Reply-To"] = order.customer_email

    address = (
        f"{order.shipping_address}\n{order.city}\n{order.province}\n{order.postal_code}"
    )
    message.set_content(
        f"""A new order has been paid for.

Order reference: {order.id}

Customer
  Name:  {order.customer_name}
  Email: {order.customer_email}
  Phone: {order.phone or "(not given)"}

Deliver to ({order.courier})
{address}

Items
{_items_text(order)}

Subtotal: {_money(order.subtotal_amount)}
Shipping: {_money(order.shipping_fee)}
Total paid: {_money(order.total_amount)}

Once it ships, record the tracking number so the customer can see it:
  docker compose exec db psql -U meravo -d meravo -c \\
    "UPDATE orders SET tracking_number = 'YOUR-TRACKING-NO', status = 'SHIPPED' WHERE id = '{order.id}';"
"""
    )

    address_html = address.replace("\n", "<br>")
    message.add_alternative(
        _shell(
            "New paid order",
            f"{order.customer_name} has paid for an order. Reference "
            f'<span style="font-family:monospace;">{order.id}</span>.',
            f"""
    <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;color:#96692b;">Customer</p>
    <p style="margin:0 0 16px;font-size:14px;">
      {order.customer_name}<br>
      <a href="mailto:{order.customer_email}" style="color:#7a2436;">{order.customer_email}</a><br>
      {order.phone or "(no phone given)"}
    </p>
    <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;color:#96692b;">
      Deliver to ({order.courier})</p>
    <p style="margin:0 0 20px;font-size:14px;">{address_html}</p>
    {_items_html(order)}
    {_totals_html(order)}
""",
        ),
        subtype="html",
    )
    return message


def build_customer_email(order: Order) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = f"Your MERAVO order is confirmed ({order.id})"
    message["To"] = order.customer_email
    message["Reply-To"] = settings.SHOP_OWNER_EMAIL

    message.set_content(
        f"""Hi {order.customer_name},

Thank you for your order! Your payment came through and we're getting it ready.

Order reference: {order.id}

Items
{_items_text(order)}

Subtotal: {_money(order.subtotal_amount)}
Shipping: {_money(order.shipping_fee)}
Total paid: {_money(order.total_amount)}

Delivering to
  {order.shipping_address}, {order.city}, {order.province}, {order.postal_code}

Shipped nationwide via {order.courier}, usually {ESTIMATED_DELIVERY_DAYS}.
We'll be in touch with your tracking number once it's on its way.

Any questions? Just reply to this email, or reach us on {settings.SHOP_CONTACT_PHONE}.

MERAVO
{settings.STORE_URL}
"""
    )

    message.add_alternative(
        _shell(
            "Thank you for your order!",
            f"Hi {order.customer_name}, your payment came through and we're getting "
            f"your order ready. Your reference is "
            f'<span style="font-family:monospace;">{order.id}</span>.',
            f"""
    {_items_html(order)}
    {_totals_html(order)}
    <p style="margin:20px 0 6px;font-size:12px;text-transform:uppercase;color:#96692b;">
      Delivering to</p>
    <p style="margin:0 0 16px;font-size:14px;">
      {order.shipping_address}<br>{order.city}<br>{order.province}<br>{order.postal_code}
    </p>
    <p style="margin:0;font-size:14px;">
      Shipped nationwide via {order.courier}, usually {ESTIMATED_DELIVERY_DAYS}.
      We'll send your tracking number once it's on its way.
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#8f2f40;">
      Any questions? Reply to this email or call {settings.SHOP_CONTACT_PHONE}.
    </p>
""",
        ),
        subtype="html",
    )
    return message


def _send(message: EmailMessage) -> None:
    message["From"] = formataddr((settings.MAIL_FROM_NAME, settings.mail_from_address))
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        if settings.SMTP_USERNAME:
            smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(message)


def send_order_emails(order: Order) -> None:
    """Notify the shop owner and the customer that an order has been paid.

    Runs as a background task after the Payfast callback has already been
    answered, and swallows its own failures: a mail problem must never cost
    a confirmed order. Each message is sent separately so one bad address
    cannot suppress the other.
    """
    if not settings.email_enabled:
        logger.info(
            "Order %s paid - email not sent because SMTP_HOST is not configured", order.id
        )
        return

    for label, build in (("shop owner", build_owner_email), ("customer", build_customer_email)):
        try:
            _send(build(order))
            logger.info("Order %s: %s notification sent", order.id, label)
        except Exception:
            logger.exception("Order %s: could not send %s notification", order.id, label)
