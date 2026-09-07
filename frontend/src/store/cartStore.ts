import { create } from "zustand";

import { api } from "../api/client";
import type { CartResponse, ShippingConfig } from "../api/types";
import { useMascotStore } from "./mascotStore";

const SESSION_KEY_STORAGE = "meravo_session_key";

function getOrCreateSessionKey(): string {
  let key = localStorage.getItem(SESSION_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY_STORAGE, key);
  }
  return key;
}

interface CartState {
  sessionKey: string;
  cart: CartResponse | null;
  isLoading: boolean;
  shippingConfig: ShippingConfig | null;
  startNewSession: () => void;
  fetchCart: () => Promise<void>;
  fetchShippingConfig: () => Promise<void>;
  shippingKnown: () => boolean;
  shippingFee: () => number;
  grandTotal: () => number;
  addItem: (productId: string, quantity?: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  itemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  sessionKey: getOrCreateSessionKey(),
  cart: null,
  isLoading: false,
  shippingConfig: null,

  // Called once an order is placed, so the shopper starts from an empty
  // cart. The new key has to land in the store as well as localStorage -
  // updating only localStorage would leave this (already-created) store
  // holding the old key, and the next add-to-cart would reopen the cart
  // that was just ordered.
  startNewSession: () => {
    const key = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY_STORAGE, key);
    set({ sessionKey: key, cart: null });
  },

  // The two fetches below run on mount as background loads, so they
  // absorb their own failures rather than surfacing an unhandled
  // rejection. The mutating actions further down deliberately still
  // throw, so the UI can tell the shopper what went wrong.
  fetchCart: async () => {
    set({ isLoading: true });
    try {
      const cart = await api.getCart(get().sessionKey);
      set({ cart });
    } catch {
      // Leave the last known cart in place; the next action will retry.
    } finally {
      set({ isLoading: false });
    }
  },

  fetchShippingConfig: async () => {
    if (get().shippingConfig) return;
    try {
      const shippingConfig = await api.getShippingConfig();
      set({ shippingConfig });
    } catch {
      // Falls back to the "Aramex" copy already rendered in the UI.
    }
  },

  // Whether the shipping rules were actually loaded from the API. Without
  // this the UI cannot tell "shipping is free" apart from "we don't know
  // the shipping cost yet", and would quote a total lower than the amount
  // the backend goes on to charge at Payfast.
  shippingKnown: () => get().shippingConfig !== null,

  shippingFee: () => {
    const { cart, shippingConfig } = get();
    if (!cart || !shippingConfig) return 0;
    if (cart.total >= shippingConfig.free_shipping_threshold) return 0;
    return shippingConfig.flat_fee;
  },

  grandTotal: () => {
    const { cart } = get();
    if (!cart) return 0;
    return cart.total + get().shippingFee();
  },

  addItem: async (productId, quantity = 1) => {
    const cart = await api.addToCart(get().sessionKey, productId, quantity);
    set({ cart });
    useMascotStore.getState().celebrate();
  },

  updateItem: async (itemId, quantity) => {
    const cart = await api.updateCartItem(get().sessionKey, itemId, quantity);
    set({ cart });
  },

  removeItem: async (itemId) => {
    const cart = await api.removeCartItem(get().sessionKey, itemId);
    set({ cart });
  },

  itemCount: () => {
    const cart = get().cart;
    if (!cart) return 0;
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
