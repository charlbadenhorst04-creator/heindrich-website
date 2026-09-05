import crypto from "node:crypto";
import { toProductRead } from "./serializers.mts";

export async function getOrCreateCart(database: any, sessionKey: string) {
  const existing = await database.sql`SELECT id FROM carts WHERE session_key = ${sessionKey}`;
  if (existing.length > 0) return existing[0].id as string;

  const id = crypto.randomUUID();
  await database.sql`INSERT INTO carts (id, session_key) VALUES (${id}, ${sessionKey})`;
  return id;
}

export async function getCartRead(database: any, sessionKey: string) {
  const cartId = await getOrCreateCart(database, sessionKey);

  // ci.id is aliased to item_id - without it, p.* also contributes a
  // column literally named "id" (the product's own id), which silently
  // overwrites cart_items.id in the resulting row object since both
  // columns share the same name. That collision previously made every
  // cart item report its *product's* id instead of its own, so update
  // and delete silently matched zero rows.
  const itemRows = await database.sql`
    SELECT ci.id AS item_id, ci.quantity, p.*, c.id AS c_id, c.name AS c_name, c.slug AS c_slug
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    JOIN categories c ON c.id = p.category_id
    WHERE ci.cart_id = ${cartId}
    ORDER BY ci.created_at
  `;

  const items = itemRows.map((row: any) => ({
    id: row.item_id,
    quantity: row.quantity,
    product: toProductRead(row),
  }));

  const total = items.reduce((sum: number, item: any) => sum + item.product.price * item.quantity, 0);

  return { id: cartId, session_key: sessionKey, items, total };
}
