/**
 * Order notification email, against a real SMTP server.
 *
 * These run the actual nodemailer transport against a throwaway SMTP
 * server listening on localhost, so what is asserted is the bytes that
 * would really reach a mail server - not a mock's idea of them. The
 * behaviour that matters most is the negative kind: a payment must survive
 * a mail server that is missing, unreachable, or rejecting the address.
 */

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { AddressInfo } from "node:net";

import { SMTPServer } from "smtp-server";

import {
  buildCustomerEmail,
  buildOwnerEmail,
  emailEnabled,
  sendOrderEmails,
  type OrderEmailData,
} from "./email.mts";

interface Captured {
  from: string;
  to: string[];
  raw: string;
}

let server: SMTPServer;
let port: number;
let received: Captured[] = [];
/** Set to an address the server should refuse, to simulate a bad mailbox. */
let rejectRecipient: string | null = null;

const ORDER: OrderEmailData = {
  id: "7f9f4b0c-1111-4222-8333-444455556666",
  customer_name: "Thandi Nkosi",
  customer_email: "thandi@example.com",
  phone: "082 123 4567",
  shipping_address: "12 Kloof Street",
  city: "Cape Town",
  province: "Western Cape",
  postal_code: "8001",
  courier: "Aramex",
  subtotal_amount: "1598.00",
  shipping_fee: "99.00",
  total_amount: "1697.00",
  items: [
    { product_name: "Car Vacuum Cleaner", unit_price: "499.00", quantity: 2 },
    { product_name: "Kids Drawing Tablet", unit_price: "299.00", quantity: 2 },
  ],
};

function configure(overrides: Record<string, string | undefined> = {}) {
  const base: Record<string, string> = {
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(port),
    SMTP_USE_TLS: "false",
    SMTP_USERNAME: "",
    SMTP_PASSWORD: "",
    MAIL_FROM: "shop@meravo.co.za",
    MAIL_FROM_NAME: "MERAVO",
    SHOP_OWNER_EMAIL: "heindrich@example.com",
    SHOP_CONTACT_PHONE: "067 157 2670",
    STORE_URL: "https://meravo.co.za",
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

/** Decodes the quoted-printable body nodemailer produces, so assertions
 * can be written against the text a person would actually read. */
function readable(raw: string): string {
  return raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function headerOf(raw: string, name: string): string {
  // Headers can be folded across lines; join continuations before matching.
  const headers = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
  const match = headers.match(new RegExp(`^${name}:\\s*(.*)$`, "im"));
  return match ? match[1].trim() : "";
}

describe("order notification email", () => {
  before(async () => {
    server = new SMTPServer({
      disabledCommands: ["STARTTLS"],
      authOptional: true,
      // Accept whatever is offered; the credential-specific behaviour has
      // its own server below.
      onAuth(auth, _session, callback) {
        callback(null, { user: auth.username ?? "anonymous" });
      },
      onRcptTo(address, _session, callback) {
        if (rejectRecipient && address.address === rejectRecipient) {
          return callback(new Error("550 no such mailbox"));
        }
        callback();
      },
      onData(stream, session, callback) {
        let raw = "";
        stream.on("data", (chunk) => (raw += chunk.toString()));
        stream.on("end", () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
            to: session.envelope.rcptTo.map((r) => r.address),
            raw,
          });
          callback();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.server.address() as AddressInfo).port;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    received = [];
    rejectRecipient = null;
    configure();
  });

  it("sends the owner and the customer a message that really reaches a mail server", async () => {
    await sendOrderEmails(ORDER);

    assert.equal(received.length, 2, "both notifications should have been sent");

    const owner = received.find((m) => m.to.includes("heindrich@example.com"));
    const customer = received.find((m) => m.to.includes("thandi@example.com"));
    assert.ok(owner, "the shop owner was not notified");
    assert.ok(customer, "the customer was not notified");

    // Replying to either message has to reach the other party - that is the
    // whole point of these two going out.
    assert.match(headerOf(owner.raw, "Reply-To"), /thandi@example\.com/);
    assert.match(headerOf(customer.raw, "Reply-To"), /heindrich@example\.com/);
    assert.equal(owner.from, "shop@meravo.co.za");

    const ownerBody = readable(owner.raw);
    // Everything needed to pack and post the parcel.
    assert.match(ownerBody, /Thandi Nkosi/);
    assert.match(ownerBody, /12 Kloof Street/);
    assert.match(ownerBody, /082 123 4567/);
    assert.match(ownerBody, /Car Vacuum Cleaner/);
    assert.match(ownerBody, /Kids Drawing Tablet/);
    assert.match(ownerBody, /R 1,697\.00/);
    assert.match(headerOf(owner.raw, "Subject"), /New paid order/);

    const customerBody = readable(customer.raw);
    assert.match(customerBody, /R 1,697\.00/);
    assert.match(customerBody, /Aramex/);
    assert.match(customerBody, new RegExp(ORDER.id));
  });

  it("prices line totals by quantity, not by unit price", async () => {
    // A receipt that bills two vacuums at R499 is a support ticket.
    const owner = buildOwnerEmail(ORDER);
    assert.match(owner.text, /Car Vacuum Cleaner x2\s+R 998\.00/);
    assert.match(owner.html, /R 998\.00/);
    assert.match(owner.html, /R 598\.00/);
  });

  it("escapes customer-supplied text instead of putting it raw into the HTML", async () => {
    // Names and addresses are typed by the public and land in an inbox.
    const injected = {
      ...ORDER,
      customer_name: '<script>alert("x")</script>',
      shipping_address: "12 Kloof & Main <b>St</b>",
    };
    const owner = buildOwnerEmail(injected);
    assert.ok(!owner.html.includes("<script>"), "raw script tag reached the HTML body");
    assert.match(owner.html, /&lt;script&gt;/);
    assert.match(owner.html, /Kloof &amp; Main/);
    assert.ok(!owner.html.includes("<b>St</b>"), "raw markup reached the HTML body");
  });

  it("does nothing at all when no mail server is configured", async () => {
    configure({ SMTP_HOST: undefined });
    assert.equal(emailEnabled(), false);

    await sendOrderEmails(ORDER);

    assert.equal(received.length, 0);
  });

  it("does not throw when the mail server is unreachable", async () => {
    // The real failure this guards: a mail error propagating out of the
    // Payfast callback, which would make Payfast retry a settled payment.
    configure({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1" });

    await sendOrderEmails(ORDER);

    assert.equal(received.length, 0);
  });

  it("still notifies the customer when the owner's address is rejected", async () => {
    rejectRecipient = "heindrich@example.com";

    await sendOrderEmails(ORDER);

    assert.equal(received.length, 1, "one bad address suppressed the other message");
    assert.deepEqual(received[0].to, ["thandi@example.com"]);
  });

  it("authenticates when credentials are configured", async () => {
    // Gmail - the documented setup - refuses unauthenticated mail, so a
    // dropped username would mean nothing ever sends in production.
    const seen: string[] = [];
    const authServer = new SMTPServer({
      disabledCommands: ["STARTTLS"],
      onAuth(auth, _session, callback) {
        seen.push(auth.username ?? "");
        if (auth.username === "shop@meravo.co.za" && auth.password === "app-password") {
          return callback(null, { user: auth.username });
        }
        callback(new Error("535 bad credentials"));
      },
      onData(stream, _session, callback) {
        stream.resume();
        stream.on("end", callback);
      },
    });
    await new Promise<void>((resolve) => authServer.listen(0, "127.0.0.1", resolve));
    const authPort = (authServer.server.address() as AddressInfo).port;

    configure({
      SMTP_PORT: String(authPort),
      SMTP_USERNAME: "shop@meravo.co.za",
      SMTP_PASSWORD: "app-password",
      MAIL_FROM: undefined,
    });

    await sendOrderEmails(ORDER);

    assert.deepEqual(seen, ["shop@meravo.co.za", "shop@meravo.co.za"]);
    await new Promise<void>((resolve) => authServer.close(() => resolve()));
  });

  it("falls back to the SMTP username as the sending address", async () => {
    // Gmail sends as the authenticated account whatever MAIL_FROM says, so
    // leaving MAIL_FROM blank has to still produce a valid From.
    configure({
      MAIL_FROM: undefined,
      SMTP_USERNAME: "meravostore@gmail.com",
      SMTP_PASSWORD: "app-password",
    });

    const message = buildCustomerEmail(ORDER);
    assert.equal(message.to, "thandi@example.com");

    await sendOrderEmails(ORDER);
    assert.equal(received.length, 2);
    assert.ok(
      received.every((m) => m.from === "meravostore@gmail.com"),
      "From did not fall back to the SMTP username",
    );
  });
});
