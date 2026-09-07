import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useCartStore } from "../store/cartStore";
import { formatZAR } from "../utils/format";
import { errorMessage } from "../utils/errors";
import { useToast } from "../components/ToastProvider";

export default function Cart() {
  const { cart, fetchCart, updateItem, removeItem, fetchShippingConfig, shippingConfig, shippingFee, grandTotal } =
    useCartStore();
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    fetchCart();
    fetchShippingConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeQuantity = async (itemId: string, quantity: number) => {
    try {
      await updateItem(itemId, quantity);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't update that item. Please try again."), "error");
    }
  };

  const removeFromCart = async (itemId: string) => {
    try {
      await removeItem(itemId);
    } catch (err) {
      showToast(errorMessage(err, "Couldn't remove that item. Please try again."), "error");
    }
  };

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl text-maroon-800">Your Cart</h1>

      {isEmpty ? (
        <div className="mt-16 text-center">
          <p className="text-maroon-900/50">Your cart is empty.</p>
          <Link
            to="/shop"
            className="mt-6 inline-block rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white hover:bg-maroon-800"
          >
            Continue Shopping
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AnimatePresence>
              {cart.items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  className="mb-4 flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-maroon-100"
                >
                  <img
                    src={item.product.image_url}
                    alt={item.product.name}
                    className="h-20 w-20 rounded-xl object-cover"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-maroon-900">{item.product.name}</p>
                    <p className="text-sm text-maroon-900/50">{formatZAR(item.product.price)}</p>
                  </div>

                  <div className="flex items-center rounded-full border border-maroon-200">
                    <button
                      onClick={() => changeQuantity(item.id, Math.max(1, item.quantity - 1))}
                      className="px-3 py-1 text-maroon-700 disabled:opacity-40"
                      disabled={item.quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <button
                      onClick={() => changeQuantity(item.id, item.quantity + 1)}
                      className="px-3 py-1 text-maroon-700 disabled:opacity-40"
                      disabled={item.quantity >= item.product.stock}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  <p className="w-24 text-right font-medium text-maroon-800">
                    {formatZAR(item.product.price * item.quantity)}
                  </p>

                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-maroon-900/40 hover:text-maroon-700"
                    aria-label="Remove item"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-fit rounded-2xl bg-white p-6 ring-1 ring-maroon-100"
          >
            <h2 className="font-display text-xl text-maroon-800">Order Summary</h2>
            <div className="mt-4 flex justify-between text-sm text-maroon-900/70">
              <span>Subtotal</span>
              <span>{formatZAR(cart.total)}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm text-maroon-900/70">
              <span>Shipping ({shippingConfig?.courier ?? "Aramex"})</span>
              <span>{shippingFee() === 0 ? "Free" : formatZAR(shippingFee())}</span>
            </div>
            {shippingConfig && shippingFee() > 0 && (
              <p className="mt-1 text-xs text-maroon-900/40">
                Free shipping on orders over {formatZAR(shippingConfig.free_shipping_threshold)}
              </p>
            )}
            <div className="mt-4 flex justify-between border-t border-maroon-100 pt-4 font-display text-lg text-maroon-800">
              <span>Total</span>
              <span>{formatZAR(grandTotal())}</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-maroon-900/50">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-12.75h-1.5m-6 7.5V6.375c0-.621.504-1.125 1.125-1.125h8.626c.621 0 1.125.504 1.125 1.125v6.75" />
              </svg>
              Delivered nationwide via {shippingConfig?.courier ?? "Aramex"}, {shippingConfig?.estimated_delivery ?? "2-4 business days"}
            </p>
            <button
              onClick={() => navigate("/checkout")}
              className="mt-6 w-full rounded-full bg-maroon-700 py-3 text-sm font-semibold text-white hover:bg-maroon-800"
            >
              Proceed to Checkout
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
