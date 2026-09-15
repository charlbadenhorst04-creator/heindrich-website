import type { Config } from "@netlify/functions";
import { jsonResponse } from "./_shared/db.mts";
import { env } from "./_shared/env.mts";
import { paymentsStatus } from "./_shared/payments.mts";
import {
  COURIER_NAME,
  ESTIMATED_DELIVERY_DAYS,
  FLAT_SHIPPING_FEE,
  FREE_SHIPPING_THRESHOLD,
} from "./_shared/shipping.mts";

export default async () => {
  const payments = paymentsStatus();
  return jsonResponse({
    courier: COURIER_NAME,
    flat_fee: FLAT_SHIPPING_FEE,
    free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
    estimated_delivery: ESTIMATED_DELIVERY_DAYS,
    payments_enabled: payments.enabled,
    payments_message: payments.message,
    whatsapp_number: env("SHOP_WHATSAPP_NUMBER") || env("SHOP_CONTACT_PHONE", "067 157 2670"),
  });
};

export const config: Config = {
  path: "/api/shipping/config",
};
