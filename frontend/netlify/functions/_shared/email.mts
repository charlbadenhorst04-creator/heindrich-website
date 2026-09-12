/**
 * Order notification email - Netlify mirror of backend/app/services/email.py.
 *
 * Two messages go out the moment Payfast confirms a payment: one to the
 * shop owner so they know to pack and ship, and one to the customer as
 * their receipt.
 *
 * Nothing in here is allowed to break a payment. Every send is wrapped, so
 * a misconfigured or unreachable mail server logs a warning and nothing
 * more. If a mail failure propagated, the Payfast callback would answer
 * with an error, Payfast would retry it, and a real paid order could be
 * left unconfirmed.
 */
import nodemailer from "nodemailer";

import { env } from "./env.mts";
import { ESTIMATED_DELIVERY_DAYS } from "./shipping.mts";

function mailConfig() {
  const host = env("SMTP_HOST");
  const username = env("SMTP_USERNAME");
  return {
    host,
    port: Number(env("SMTP_PORT", "587")),
    username,
    password: env("SMTP_PASSWORD"),
    // Port 465 is implicit TLS from the first byte; 587 starts plain and
    // upgrades with STARTTLS. Getting this backwards is the single most
    // common reason mail silently stops working, so it follows the port
    // unless SMTP_USE_TLS says otherwise.
    useTls: (env("SMTP_USE_TLS", "true") || "true").toLowerCase() !== "false",
    // Gmail sends as the account that authenticated regardless of what is
    // put here, so defaulting to the username is one less thing to get
    // wrong.
    from: env("MAIL_FROM") || username,
    fromName: env("MAIL_FROM_NAME", "MERAVO"),
    ownerEmail: env("SHOP_OWNER_EMAIL", "Heinrichcdoman@gmail.com"),
    contactPhone: env("SHOP_CONTACT_PHONE", "067 157 2670"),
    storeUrl: env("STORE_URL") || env("URL", "https://meravo.co.za"),
  };
}

/** Mail is off, not broken, when no server is configured. */
export function emailEnabled(): boolean {
  return Boolean(env("SMTP_HOST"));
}

export interface OrderEmailItem {
  product_name: string;
  unit_price: number | string;
  quantity: number;
}

export interface OrderEmailData {
  id: string;
  customer_name: string;
  customer_email: string;
  phone?: string | null;
  shipping_address: string;
  city: string;
  province: string;
  postal_code: string;
  courier: string;
  subtotal_amount: number | string;
  shipping_fee: number | string;
  total_amount: number | string;
  items: OrderEmailItem[];
}

export interface BuiltEmail {
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Formatted by hand rather than through Intl: a serverless bundle can ship
 * without the full locale data, and a receipt that renders "R 1,697.00" in
 * one deployment and "R 1 697,00" in another is the kind of difference
 * that turns into a support question. This matches the wording the Docker
 * backend already emails.
 */
function money(amount: number | string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "R 0.00";
  const [whole, decimals] = Math.abs(value).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `R ${value < 0 ? "-" : ""}${grouped}.${decimals}`;
}

/**
 * Customer names and addresses are typed by the public and land inside an
 * HTML email. Escaping them is what keeps a stray `<` from mangling the
 * message - or worse, from smuggling markup into the shop owner's inbox.
 */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemsText(order: OrderEmailData): string {
  return order.items
    .map(
      (item) =>
        `  - ${item.product_name} x${item.quantity}  ` +
        money(Number(item.unit_price) * item.quantity),
    )
    .join("\n");
}

function itemsHtml(order: OrderEmailData): string {
  const cell = "padding:8px 0;border-bottom:1px solid #f6e3e5;";
  const rows = order.items
    .map(
      (item) =>
        `<tr><td style="${cell}">${esc(item.product_name)}</td>` +
        `<td style="${cell}text-align:center;">${esc(item.quantity)}</td>` +
        `<td style="${cell}text-align:right;">` +
        `${money(Number(item.unit_price) * item.quantity)}</td></tr>`,
    )
    .join("");
  return (
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
    '<tr style="text-align:left;color:#8f2f40;font-size:12px;text-transform:uppercase;">' +
    '<th style="padding-bottom:6px;">Item</th>' +
    '<th style="padding-bottom:6px;text-align:center;">Qty</th>' +
    '<th style="padding-bottom:6px;text-align:right;">Total</th></tr>' +
    `${rows}</table>`
  );
}

function totalsHtml(order: OrderEmailData): string {
  const shipping = Number(order.shipping_fee) === 0 ? "Free" : money(order.shipping_fee);
  return (
    '<table style="width:100%;font-size:14px;margin-top:12px;">' +
    '<tr><td style="padding:2px 0;">Subtotal</td>' +
    `<td style="padding:2px 0;text-align:right;">${money(order.subtotal_amount)}</td></tr>` +
    `<tr><td style="padding:2px 0;">Shipping (${esc(order.courier)})</td>` +
    `<td style="padding:2px 0;text-align:right;">${shipping}</td></tr>` +
    '<tr style="font-weight:bold;color:#611c2b;font-size:16px;">' +
    '<td style="padding-top:8px;border-top:1px solid #f6e3e5;">Total</td>' +
    '<td style="padding-top:8px;border-top:1px solid #f6e3e5;text-align:right;">' +
    `${money(order.total_amount)}</td></tr></table>`
  );
}

function shell(title: string, intro: string, body: string): string {
  const cfg = mailConfig();
  return `<div style="background:#fdf6f3;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#4a1520;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;">
    <p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:#7a2436;letter-spacing:2px;">MERAVO</p>
    <p style="margin:0 0 20px;font-size:12px;color:#96692b;">Your Style. Your Story.</p>
    <h1 style="margin:0 0 8px;font-size:20px;color:#611c2b;">${title}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#611c2b;">${intro}</p>
    ${body}
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-size:12px;color:#8f2f40;text-align:center;">
    MERAVO &middot; ${esc(cfg.ownerEmail)} &middot; ${esc(cfg.contactPhone)}
  </p>
</div>`;
}

/** What the shop owner needs to pack and ship, without opening the site. */
export function buildOwnerEmail(order: OrderEmailData): BuiltEmail {
  const cfg = mailConfig();
  const address = `${order.shipping_address}\n${order.city}\n${order.province}\n${order.postal_code}`;

  const text = `A new order has been paid for.

Order reference: ${order.id}

Customer
  Name:  ${order.customer_name}
  Email: ${order.customer_email}
  Phone: ${order.phone || "(not given)"}

Deliver to (${order.courier})
${address}

Items
${itemsText(order)}

Subtotal: ${money(order.subtotal_amount)}
Shipping: ${money(order.shipping_fee)}
Total paid: ${money(order.total_amount)}

View the order: ${cfg.storeUrl}/order-success?order=${order.id}
`;

  const html = shell(
    "New paid order",
    `${esc(order.customer_name)} has paid for an order. Reference ` +
      `<span style="font-family:monospace;">${esc(order.id)}</span>.`,
    `
    <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;color:#96692b;">Customer</p>
    <p style="margin:0 0 16px;font-size:14px;">
      ${esc(order.customer_name)}<br>
      <a href="mailto:${esc(order.customer_email)}" style="color:#7a2436;">${esc(order.customer_email)}</a><br>
      ${esc(order.phone || "(no phone given)")}
    </p>
    <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;color:#96692b;">
      Deliver to (${esc(order.courier)})</p>
    <p style="margin:0 0 20px;font-size:14px;">${esc(address).replace(/\n/g, "<br>")}</p>
    ${itemsHtml(order)}
    ${totalsHtml(order)}
`,
  );

  return {
    to: cfg.ownerEmail,
    // So hitting reply goes straight to the customer.
    replyTo: order.customer_email,
    subject: `New paid order - ${money(order.total_amount)} - ${order.customer_name}`,
    text,
    html,
  };
}

export function buildCustomerEmail(order: OrderEmailData): BuiltEmail {
  const cfg = mailConfig();

  const text = `Hi ${order.customer_name},

Thank you for your order! Your payment came through and we're getting it ready.

Order reference: ${order.id}

Items
${itemsText(order)}

Subtotal: ${money(order.subtotal_amount)}
Shipping: ${money(order.shipping_fee)}
Total paid: ${money(order.total_amount)}

Delivering to
  ${order.shipping_address}, ${order.city}, ${order.province}, ${order.postal_code}

Shipped nationwide via ${order.courier}, usually ${ESTIMATED_DELIVERY_DAYS}.
We'll be in touch with your tracking number once it's on its way.

Any questions? Just reply to this email, or reach us on ${cfg.contactPhone}.

MERAVO
${cfg.storeUrl}
`;

  const html = shell(
    "Thank you for your order!",
    `Hi ${esc(order.customer_name)}, your payment came through and we're getting ` +
      `your order ready. Your reference is ` +
      `<span style="font-family:monospace;">${esc(order.id)}</span>.`,
    `
    ${itemsHtml(order)}
    ${totalsHtml(order)}
    <p style="margin:20px 0 6px;font-size:12px;text-transform:uppercase;color:#96692b;">
      Delivering to</p>
    <p style="margin:0 0 16px;font-size:14px;">
      ${esc(order.shipping_address)}<br>${esc(order.city)}<br>${esc(order.province)}<br>${esc(order.postal_code)}
    </p>
    <p style="margin:0;font-size:14px;">
      Shipped nationwide via ${esc(order.courier)}, usually ${ESTIMATED_DELIVERY_DAYS}.
      We'll send your tracking number once it's on its way.
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#8f2f40;">
      Any questions? Reply to this email or call ${esc(cfg.contactPhone)}.
    </p>
`,
  );

  return {
    to: order.customer_email,
    replyTo: cfg.ownerEmail,
    subject: `Your MERAVO order is confirmed (${order.id})`,
    text,
    html,
  };
}

async function send(message: BuiltEmail): Promise<void> {
  const cfg = mailConfig();
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 465 speaks TLS immediately; anything else negotiates STARTTLS.
    secure: cfg.useTls && cfg.port === 465,
    requireTLS: cfg.useTls && cfg.port !== 465,
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    // A function that never returns holds the Payfast callback open until
    // it times out, which makes Payfast retry a payment it already has.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transport.sendMail({
      from: { name: cfg.fromName, address: cfg.from },
      to: message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } finally {
    transport.close();
  }
}

/**
 * Notify the shop owner and the customer that an order has been paid.
 *
 * Never throws. Each message is sent separately so one bad address cannot
 * suppress the other, and a mail problem is logged rather than allowed to
 * cost a confirmed order.
 */
export async function sendOrderEmails(order: OrderEmailData): Promise<void> {
  if (!emailEnabled()) {
    console.log(
      `Order ${order.id} paid - email not sent because SMTP_HOST is not configured`,
    );
    return;
  }

  const messages: [string, BuiltEmail][] = [];
  try {
    messages.push(["shop owner", buildOwnerEmail(order)]);
    messages.push(["customer", buildCustomerEmail(order)]);
  } catch (error) {
    console.error(`Order ${order.id}: could not build notification emails`, error);
    return;
  }

  for (const [label, message] of messages) {
    try {
      await send(message);
      console.log(`Order ${order.id}: ${label} notification sent`);
    } catch (error) {
      console.error(`Order ${order.id}: could not send ${label} notification`, error);
    }
  }
}
