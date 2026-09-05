export function toProductRead(row: any) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: Number(row.price),
    image_url: row.image_url,
    stock: row.stock,
    is_active: row.is_active,
    category: { id: row.c_id, name: row.c_name, slug: row.c_slug },
  };
}

export function toOrderRead(order: any, items: any[]) {
  return {
    id: order.id,
    customer_email: order.customer_email,
    customer_name: order.customer_name,
    shipping_address: order.shipping_address,
    city: order.city,
    postal_code: order.postal_code,
    province: order.province,
    subtotal_amount: Number(order.subtotal_amount),
    shipping_fee: Number(order.shipping_fee),
    total_amount: Number(order.total_amount),
    status: order.status,
    courier: order.courier,
    tracking_number: order.tracking_number,
    items: items.map((item) => ({
      id: item.id,
      product_name: item.product_name,
      unit_price: Number(item.unit_price),
      quantity: item.quantity,
    })),
  };
}
