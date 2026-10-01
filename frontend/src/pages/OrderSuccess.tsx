import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import { useCartStore } from "../store/cartStore";
import type { Order } from "../api/types";
import { formatZAR } from "../utils/format";

/** How long to keep asking while a payment is still being confirmed. */
const CONFIRM_ATTEMPTS = 10;
const CONFIRM_INTERVAL_MS = 3000;

type View = "checking" | "paid" | "confirming" | "not-completed" | "failed" | "missing";

export default function OrderSuccess() {
  const [searchParams] = useSearchParams();
  // Payfast returns to the address we gave it, which carries ?order=.
  // Stitch adds externalReference (our order id), id and status itself.
  const orderId =
    searchParams.get("order") ??
    searchParams.get("externalReference") ??
    searchParams.get("m_payment_id") ??
    searchParams.get("order_id");
  // What the payment page said on the way back. Only ever used to choose
  // wording - anyone can edit a URL, so it decides nothing about money.
  const returnedStatus = searchParams.get("status");
  const customerGaveUp = returnedStatus === "closed" || returnedStatus === "failed";

  const [order, setOrder] = useState<Order | null>(null);
  const [view, setView] = useState<View>(orderId ? "checking" : "missing");
  const startNewSession = useCartStore((s) => s.startNewSession);
  const cleared = useRef(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;

    // Emptied only once the customer has plausibly paid. Someone who closed
    // the payment page keeps their basket so they can simply try again.
    const clearCart = () => {
      if (!cleared.current) {
        cleared.current = true;
        startNewSession();
      }
    };

    api.getOrder(orderId).then((o) => !cancelled && setOrder(o)).catch(() => {});

    (async () => {
      for (let attempt = 0; attempt < CONFIRM_ATTEMPTS && !cancelled; attempt++) {
        let status: string | null = null;
        try {
          status = (await api.confirmPayment(orderId)).status;
        } catch {
          // Treated like "not confirmed yet"; the next attempt may succeed.
        }
        if (cancelled) return;

        if (status === "paid") {
          clearCart();
          setView("paid");
          // Refreshed so the summary reflects the settled order.
          api.getOrder(orderId).then((o) => !cancelled && setOrder(o)).catch(() => {});
          return;
        }
        if (status === "failed") {
          setView("failed");
          return;
        }
        if (customerGaveUp) {
          setView("not-completed");
          return;
        }
        // Back from the payment page without a "closed": most likely paid,
        // with confirmation a few seconds behind. Say so, and keep asking.
        clearCart();
        setView("confirming");
        await new Promise((resolve) => setTimeout(resolve, CONFIRM_INTERVAL_MS));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, customerGaveUp, startNewSession]);

  if (view === "missing") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl text-maroon-800">We couldn't find that order</h1>
        <p className="mt-2 text-maroon-900/60">
          If you've just paid, check your email for the confirmation, or{" "}
          <Link to="/contact" className="text-maroon-700 underline hover:text-maroon-800">
            get in touch
          </Link>{" "}
          and we'll look it up for you.
        </p>
        <Link
          to="/shop"
          className="mt-10 inline-block rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white hover:bg-maroon-800"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  if (view === "not-completed" || view === "failed") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blush-100 text-maroon-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mt-6 font-display text-3xl text-maroon-800">
          {view === "failed" ? "Your payment didn't go through" : "Payment not completed"}
        </h1>
        <p className="mt-2 text-maroon-900/60">
          No money has been taken. Your basket is still saved, so you can try again whenever
          you're ready.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            to="/checkout"
            className="inline-block rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white hover:bg-maroon-800"
          >
            Try again
          </Link>
          <Link
            to="/contact"
            className="inline-block rounded-full px-8 py-3 text-sm font-semibold text-maroon-700 ring-1 ring-maroon-200 hover:bg-blush-50"
          >
            Get help
          </Link>
        </div>
      </div>
    );
  }

  const confirming = view === "checking" || view === "confirming";

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6 lg:px-8">
      <motion.div
        key={confirming ? "confirming" : "paid"}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={confirming ? { scale: [0.95, 1.05, 0.95], opacity: 0.5 } : { scale: 1, opacity: 1 }}
        transition={
          confirming
            ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
            : { type: "spring", stiffness: 200, damping: 15 }
        }
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-maroon-700 text-white"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </motion.div>

      <h1 className="mt-6 font-display text-3xl text-maroon-800">
        {confirming ? "Confirming your payment…" : "Thank you for your order!"}
      </h1>
      {confirming ? (
        <p className="mt-2 text-maroon-900/60">
          This usually takes a few seconds. You don't need to pay again — you'll get an email
          {order ? ` at ${order.customer_email}` : ""} as soon as it's through.
        </p>
      ) : (
        <p className="mt-2 text-maroon-900/60">
          Your payment is confirmed and a confirmation email is on its way
          {order ? ` to ${order.customer_email}` : ""}. Keep your order reference below and
          quote it any time you{" "}
          <Link to="/contact" className="text-maroon-700 underline hover:text-maroon-800">
            get in touch
          </Link>
          .
        </p>
      )}

      {order && (
        <div className="mt-8 rounded-2xl bg-white p-6 text-left ring-1 ring-maroon-100">
          <p className="text-sm text-maroon-900/50">Order reference</p>
          <p className="font-mono text-sm text-maroon-900">{order.id}</p>
          <div className="mt-4 space-y-1 text-sm">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between">
                <span>
                  {item.product_name} &times; {item.quantity}
                </span>
                <span>{formatZAR(item.unit_price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-1 border-t border-maroon-100 pt-4 text-sm text-maroon-900/70">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatZAR(order.subtotal_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping ({order.courier})</span>
              <span>{order.shipping_fee === 0 ? "Free" : formatZAR(order.shipping_fee)}</span>
            </div>
          </div>
          <div className="mt-2 flex justify-between border-t border-maroon-100 pt-4 font-semibold text-maroon-800">
            <span>Total</span>
            <span>{formatZAR(order.total_amount)}</span>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-xl bg-blush-100 p-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 shrink-0 text-maroon-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-12.75h-1.5m-6 7.5V6.375c0-.621.504-1.125 1.125-1.125h8.626c.621 0 1.125.504 1.125 1.125v6.75" />
            </svg>
            <div>
              <p className="text-sm font-medium text-maroon-900">Shipped via {order.courier}</p>
              <p className="mt-0.5 text-xs text-maroon-900/60">
                {order.tracking_number
                  ? `Tracking number: ${order.tracking_number}`
                  : `Your ${order.courier} tracking number is added here once your order ships.`}
              </p>
            </div>
          </div>
        </div>
      )}

      <Link
        to="/shop"
        className="mt-10 inline-block rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white hover:bg-maroon-800"
      >
        Continue Shopping
      </Link>
    </div>
  );
}
