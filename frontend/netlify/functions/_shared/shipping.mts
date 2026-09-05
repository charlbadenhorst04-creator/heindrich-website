export const COURIER_NAME = "Aramex";
export const FLAT_SHIPPING_FEE = 99.0;
export const FREE_SHIPPING_THRESHOLD = 1500.0;
export const ESTIMATED_DELIVERY_DAYS = "2-4 business days";

export function computeShippingFee(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
}
