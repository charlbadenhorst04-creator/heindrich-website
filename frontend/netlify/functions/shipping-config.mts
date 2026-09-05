import type { Config } from "@netlify/functions";
import { jsonResponse } from "./_shared/db.mts";
import {
  COURIER_NAME,
  ESTIMATED_DELIVERY_DAYS,
  FLAT_SHIPPING_FEE,
  FREE_SHIPPING_THRESHOLD,
} from "./_shared/shipping.mts";

export default async () => {
  return jsonResponse({
    courier: COURIER_NAME,
    flat_fee: FLAT_SHIPPING_FEE,
    free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
    estimated_delivery: ESTIMATED_DELIVERY_DAYS,
  });
};

export const config: Config = {
  path: "/api/shipping/config",
};
