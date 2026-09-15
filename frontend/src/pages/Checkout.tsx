import { motion } from "framer-motion";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { useCartStore } from "../store/cartStore";
import { formatZAR } from "../utils/format";
import { errorMessage } from "../utils/errors";

const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape",
];

function submitPayfastForm(actionUrl: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;

  for (const [key, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

/**
 * Turns a South African number as it is normally written ("067 157 2670")
 * into the international form wa.me needs. Already-international numbers
 * are left alone.
 */
function whatsappLink(rawNumber: string, message: string): string {
  const digits = rawNumber.replace(/[^\d+]/g, "");
  let international = digits.replace(/^\+/, "");
  if (international.startsWith("0")) {
    international = `27${international.slice(1)}`;
  }
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

export default function Checkout() {
  const {
    cart,
    isLoading,
    sessionKey,
    fetchCart,
    fetchShippingConfig,
    shippingConfig,
    shippingKnown,
    shippingFee,
    grandTotal,
  } = useCartStore();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only an explicit false closes checkout, so a deployment whose API
  // predates this setting keeps taking payments as before.
  const paymentsOpen = shippingConfig?.payments_enabled !== false;

  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    phone: "",
    shipping_address: "",
    city: "",
    postal_code: "",
    province: "",
  });

  useEffect(() => {
    fetchCart();
    fetchShippingConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cart && cart.items.length === 0) {
      navigate("/cart");
    }
  }, [cart, navigate]);

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Pressing Enter in a text field submits the form even when the pay
    // button is not on screen, so the closed state is enforced here too.
    if (!paymentsOpen) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.checkout({ session_key: sessionKey, ...form });
      submitPayfastForm(response.action_url, response.fields);
    } catch (err) {
      // Surface what the API actually said - checkout re-checks stock and
      // availability, so this is often something the shopper can act on
      // ("Only 1 of X left in stock") rather than a generic failure.
      setError(errorMessage(err, "Something went wrong preparing your payment. Please try again."));
      setSubmitting(false);
    }
  };

  // The cart load can fail (API unreachable). Without these two states the
  // page renders as a blank white screen with no way forward.
  if (!cart) {
    if (isLoading) {
      return (
        <div className="mx-auto max-w-5xl px-4 py-24 text-center text-maroon-900/50 sm:px-6 lg:px-8">
          Loading your order...
        </div>
      );
    }
    return (
      <div className="mx-auto max-w-5xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl text-maroon-800">We couldn't load your cart</h1>
        <p className="mt-2 text-maroon-900/60">
          Please check your connection and try again.
        </p>
        <button
          onClick={() => {
            fetchCart();
            fetchShippingConfig();
          }}
          className="mt-6 rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white hover:bg-maroon-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl text-maroon-800">Checkout</h1>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-3">
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="space-y-4 lg:col-span-2"
        >
          {/* Each maxLength matches the limit the API enforces, so an
              over-long value is stopped here rather than bouncing back
              from the server on the last step of the sale. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input required maxLength={200} value={form.customer_name} onChange={handleChange("customer_name")} className="input" />
            </Field>
            <Field label="Email">
              <input required type="email" maxLength={255} value={form.customer_email} onChange={handleChange("customer_email")} className="input" />
            </Field>
          </div>

          <Field label="Phone (for delivery)">
            <input maxLength={30} value={form.phone} onChange={handleChange("phone")} className="input" placeholder="e.g. 067 157 2670" />
          </Field>

          <Field label="Shipping address">
            <input required maxLength={500} value={form.shipping_address} onChange={handleChange("shipping_address")} className="input" />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="City">
              <input required maxLength={120} value={form.city} onChange={handleChange("city")} className="input" />
            </Field>
            <Field label="Postal code">
              <input required maxLength={20} value={form.postal_code} onChange={handleChange("postal_code")} className="input" />
            </Field>
            <Field label="Province">
              {/* Starts unselected: a pre-filled province would quietly ship
                  to Gauteng for anyone who skips the dropdown. */}
              <select required value={form.province} onChange={handleChange("province")} className="input">
                <option value="" disabled>
                  Select province
                </option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {paymentsOpen ? (
            <>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-maroon-700 py-3 text-sm font-semibold text-white hover:bg-maroon-800 disabled:opacity-60"
              >
                {submitting
                  ? "Redirecting to secure payment..."
                  : shippingKnown()
                    ? `Pay ${formatZAR(grandTotal())} with Payfast`
                    : "Continue to secure payment"}
              </button>

              <p className="text-center text-xs text-maroon-900/40">
                You'll be redirected to Payfast's secure page to complete payment by card, EFT or
                instant EFT.
              </p>
            </>
          ) : (
            /* Card payments are not available yet. Rather than let someone
               fill all of this in and then fail at the payment provider,
               say so plainly and hand the order to WhatsApp, which is a
               route that actually works today. */
            <div className="rounded-2xl bg-blush-50 p-5 ring-1 ring-maroon-100">
              <p className="text-sm font-semibold text-maroon-800">
                Card payments open here shortly
              </p>
              <p className="mt-1 text-sm text-maroon-900/70">
                {shippingConfig?.payments_message ??
                  "Send us your order on WhatsApp and we'll get it on its way."}
              </p>
              <a
                href={whatsappLink(
                  shippingConfig?.whatsapp_number ?? "067 157 2670",
                  `Hi MERAVO, I'd like to order:\n\n${cart.items
                    .map((item) => `• ${item.product.name} x${item.quantity}`)
                    .join("\n")}\n\nTotal: ${formatZAR(grandTotal())}`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block w-full rounded-full bg-maroon-700 py-3 text-center text-sm font-semibold text-white hover:bg-maroon-800"
              >
                Send this order on WhatsApp
              </a>
              <p className="mt-3 text-center text-xs text-maroon-900/40">
                Your basket is filled in for you — just press send.
              </p>
            </div>
          )}
        </motion.form>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-fit rounded-2xl bg-white p-6 ring-1 ring-maroon-100"
        >
          <h2 className="font-display text-xl text-maroon-800">Order Summary</h2>
          <div className="mt-4 space-y-2 text-sm text-maroon-900/70">
            {cart.items.map((item) => (
              <div key={item.id} className="flex justify-between">
                <span>
                  {item.product.name} &times; {item.quantity}
                </span>
                <span>{formatZAR(item.product.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1 border-t border-maroon-100 pt-4 text-sm text-maroon-900/70">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatZAR(cart.total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping ({shippingConfig?.courier ?? "Aramex"})</span>
              <span>
                {!shippingKnown()
                  ? "Calculated at payment"
                  : shippingFee() === 0
                    ? "Free"
                    : formatZAR(shippingFee())}
              </span>
            </div>
          </div>
          <div className="mt-2 flex justify-between border-t border-maroon-100 pt-4 font-display text-lg text-maroon-800">
            <span>Total</span>
            <span>{shippingKnown() ? formatZAR(grandTotal()) : `${formatZAR(cart.total)} + shipping`}</span>
          </div>
          <p className="mt-3 text-xs text-maroon-900/50">
            Delivered nationwide via {shippingConfig?.courier ?? "Aramex"}
            {shippingConfig ? `, ${shippingConfig.estimated_delivery}` : ""}.
          </p>
          <Link to="/cart" className="mt-4 block text-center text-sm text-maroon-700 hover:underline">
            Edit cart
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-maroon-900/70">{label}</span>
      {children}
    </label>
  );
}
