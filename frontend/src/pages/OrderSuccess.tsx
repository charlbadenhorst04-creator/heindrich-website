import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api/client";
import { resetSessionKey } from "../store/cartStore";
import type { Order } from "../api/types";
import { formatZAR } from "../utils/format";

export default function OrderSuccess() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("m_payment_id") ?? searchParams.get("order_id");
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (orderId) {
      api.getOrder(orderId).then(setOrder).catch(() => setOrder(null));
    }
    resetSessionKey();
  }, [orderId]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6 lg:px-8">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-maroon-700 text-white"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </motion.div>

      <h1 className="mt-6 font-display text-3xl text-maroon-800">Thank you for your order!</h1>
      <p className="mt-2 text-maroon-900/60">
        We've received your order and will notify you once it's confirmed and shipped.
      </p>

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
                  : `You'll receive your ${order.courier} tracking number by email once your order ships.`}
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
