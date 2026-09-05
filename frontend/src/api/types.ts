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

export interface PayfastInitiateResponse {
  order_id: string;
  action_url: string;
  fields: Record<string, string>;
}

export interface Order {
  id: string;
  customer_email: string;
  customer_name: string;
  shipping_address: string;
  city: string;
  postal_code: string;
  province: string;
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
}
