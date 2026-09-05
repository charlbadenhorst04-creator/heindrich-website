import { create } from "zustand";

import { api } from "../api/client";
import type { CartResponse } from "../api/types";

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
  fetchCart: () => Promise<void>;
  addItem: (productId: string, quantity?: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  itemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  sessionKey: getOrCreateSessionKey(),
  cart: null,
  isLoading: false,

  fetchCart: async () => {
    set({ isLoading: true });
    try {
      const cart = await api.getCart(get().sessionKey);
      set({ cart });
    } finally {
      set({ isLoading: false });
    }
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
