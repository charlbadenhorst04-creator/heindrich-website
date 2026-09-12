import type { Config, Context } from "@netlify/functions";
import { readyDb, jsonResponse } from "./_shared/db.mts";
import { getCartRead } from "./_shared/cart.mts";

export default async (req: Request, context: Context) => {
  const sessionKey = context.params.sessionKey;
  const database = await readyDb();
  return jsonResponse(await getCartRead(database, sessionKey));
};

export const config: Config = {
  path: "/api/cart/:sessionKey",
};
