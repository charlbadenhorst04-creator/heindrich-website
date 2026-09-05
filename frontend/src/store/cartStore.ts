import { create } from "zustand";

import { api } from "../api/client";
import type { CartResponse, ShippingConfig } from "../api/types";

const SESSION_KEY_STORAGE = "meravo_session_key";

function getOrCreateSessionKey(): string {
  let key = localStorage.getItem(SESSION_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY_STORAGE, key);
  }
  return key;
}

export function resetSessionKey(): string {
  const key = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY_STORAGE, key);
  return key;
}

interface CartState {
  sessionKey: string;
  cart: CartResponse | null;
  isLoading: boolean;
  shippingConfig: ShippingConfig | null;
  fetchCart: () => Promise<void>;
  fetchShippingConfig: () => Promise<void>;
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

  fetchCart: async () => {
    set({ isLoading: true });
    try {
      const cart = await api.getCart(get().sessionKey);
      set({ cart });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchShippingConfig: async () => {
    if (get().shippingConfig) return;
    const shippingConfig = await api.getShippingConfig();
    set({ shippingConfig });
  },

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
