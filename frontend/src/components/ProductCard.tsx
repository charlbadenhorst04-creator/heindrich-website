import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { Product } from "../api/types";
import { useCartStore } from "../store/cartStore";
import { formatZAR } from "../utils/format";

export default function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const addItem = useCartStore((s) => s.addItem);
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await addItem(product.id, 1);
    } finally {
      setAdding(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4) }}
      whileHover={{ y: -6 }}
      className="group relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-maroon-100 transition-shadow hover:shadow-xl"
    >
      <Link to={`/products/${product.slug}`}>
        <div className="aspect-square overflow-hidden bg-blush-100">
          <motion.img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover"
            whileHover={{ scale: 1.08 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-gold-600">{product.category.name}</p>
          <h3 className="mt-1 line-clamp-2 font-medium text-maroon-900">{product.name}</h3>
          <p className="mt-2 font-display text-lg text-maroon-700">{formatZAR(product.price)}</p>
        </div>
      </Link>

      <motion.button
        onClick={handleAdd}
        disabled={adding || product.stock === 0}
        whileTap={{ scale: 0.92 }}
        className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-maroon-700 text-white shadow-lg transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:bg-maroon-800"
        aria-label="Add to cart"
      >
        {adding ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
      </motion.button>

      {product.stock === 0 && (
        <span className="absolute left-4 top-4 rounded-full bg-maroon-900/80 px-3 py-1 text-xs font-medium text-white">
          Out of stock
        </span>
      )}
    </motion.div>
  );
}
