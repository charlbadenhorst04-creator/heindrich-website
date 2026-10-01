export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  image_url: string;
  stock: number;
  is_active: boolean;
  category: Category;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
}

export interface CartItem {
  id: string;
  quantity: number;
  product: Product;
}

export interface CartResponse {
  id: string;
  session_key: string;
  items: CartItem[];
  total: number;
}

export interface CheckoutPayload {
  session_key: string;
  customer_email: string;
  customer_name: string;
  shipping_address: string;
  city: string;
  postal_code: string;
  province: string;
  phone?: string;
}

/** The customer is sent to Stitch's hosted payment page at redirect_url. */
export interface CheckoutResponse {
  order_id: string;
  provider: "stitch";
  redirect_url: string;
}

export interface PaymentConfirmation {
  order_id: string;
  status: "pending" | "paid" | "failed" | string;
}

export interface Order {
  id: string;
  customer_email: string;
  customer_name: string;
  // Not returned by the public order endpoint on the Netlify deployment,
  // which keeps the delivery address out of anything reachable by URL.
  shipping_address?: string;
  city?: string;
  postal_code?: string;
  province?: string;
  subtotal_amount: number;
  shipping_fee: number;
  total_amount: number;
  status: string;
  courier: string;
  tracking_number: string;
  items: {
    id: string;
    product_name: string;
    unit_price: number;
    quantity: number;
  }[];
}

export interface ShippingConfig {
  courier: string;
  flat_fee: number;
  free_shipping_threshold: number;
  estimated_delivery: string;
  // Absent on deployments that predate the payments switch, so anything
  // other than an explicit false means the shop is taking card payments.
  payments_enabled?: boolean;
  payments_provider?: "stitch" | null;
  payments_message?: string;
  whatsapp_number?: string;
}
