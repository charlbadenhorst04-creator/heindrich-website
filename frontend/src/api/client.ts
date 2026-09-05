import axios from "axios";

import type {
  CartResponse,
  CheckoutPayload,
  Category,
  Order,
  PayfastInitiateResponse,
  ProductListResponse,
  Product,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

const client = axios.create({ baseURL: API_BASE_URL });

export const api = {
  listProducts: async (params: { q?: string; category?: string; page?: number }) => {
    const { data } = await client.get<ProductListResponse>("/products", { params });
    return data;
  },
  getProduct: async (slug: string) => {
    const { data } = await client.get<Product>(`/products/${slug}`);
    return data;
  },
  listCategories: async () => {
    const { data } = await client.get<Category[]>("/categories");
    return data;
  },
  getCart: async (sessionKey: string) => {
    const { data } = await client.get<CartResponse>(`/cart/${sessionKey}`);
    return data;
  },
  addToCart: async (sessionKey: string, productId: string, quantity = 1) => {
    const { data } = await client.post<CartResponse>(`/cart/${sessionKey}/items`, {
      product_id: productId,
      quantity,
    });
    return data;
  },
  updateCartItem: async (sessionKey: string, itemId: string, quantity: number) => {
    const { data } = await client.patch<CartResponse>(
      `/cart/${sessionKey}/items/${itemId}`,
      { quantity },
    );
    return data;
  },
  removeCartItem: async (sessionKey: string, itemId: string) => {
    const { data } = await client.delete<CartResponse>(`/cart/${sessionKey}/items/${itemId}`);
    return data;
  },
  checkout: async (payload: CheckoutPayload) => {
    const { data } = await client.post<PayfastInitiateResponse>("/orders/checkout", payload);
    return data;
  },
  getOrder: async (orderId: string) => {
    const { data } = await client.get<Order>(`/orders/${orderId}`);
    return data;
  },
};
