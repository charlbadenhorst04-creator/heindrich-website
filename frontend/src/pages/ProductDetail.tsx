import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import { useCartStore } from "../store/cartStore";
import type { Product } from "../api/types";
import { formatZAR } from "../utils/format";
import { useToast } from "../components/ToastProvider";

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const { showToast } = useToast();

  useEffect(() => {
    if (!slug) return;
    setProduct(null);
    api.getProduct(slug).then(setProduct);
  }, [slug]);

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center text-maroon-900/50">Loading...</div>
    );
  }

  const handleAdd = async () => {
    setAdding(true);
    try {
      await addItem(product.id, quantity);
      setAdded(true);
      showToast(`${product.name} added to cart`);
      setTimeout(() => setAdded(false), 1800);
    } catch {
      showToast("Couldn't add that to your cart. Please try again.", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <nav className="text-sm text-maroon-900/50">
        <Link to="/shop" className="hover:underline">
          Shop
        </Link>{" "}
        / <span className="text-maroon-900">{product.name}</span>
      </nav>

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="overflow-hidden rounded-3xl bg-blush-100"
        >
          <motion.img
            key={product.slug}
            src={product.image_url}
            alt={product.name}
            className="aspect-square w-full object-cover"
            initial={{ rotate: -12, scale: 1.1, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            whileHover={{ rotate: 360 }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-600">
            {product.category.name}
          </p>
          <h1 className="mt-2 font-display text-3xl text-maroon-900 sm:text-4xl">{product.name}</h1>
          <p className="mt-4 font-display text-2xl text-maroon-700">{formatZAR(product.price)}</p>
          <p className="mt-6 leading-relaxed text-maroon-900/70">{product.description}</p>

          <p className="mt-4 text-sm text-maroon-900/50">
            {product.stock > 0 ? `${product.stock} in stock` : "Currently out of stock"}
          </p>

          <div className="mt-8 flex items-center gap-4">
            <div className="flex items-center rounded-full border border-maroon-200 bg-white">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-4 py-2 text-lg text-maroon-700"
                aria-label="Decrease quantity"
              >
                -
              </button>
              <span className="w-8 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                className="px-4 py-2 text-lg text-maroon-700"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <motion.button
              onClick={handleAdd}
              disabled={adding || product.stock === 0}
              whileTap={{ scale: 0.96 }}
              className="flex-1 rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-maroon-800 disabled:opacity-50"
            >
              {added ? "Added to cart ✓" : adding ? "Adding..." : "Add to Cart"}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
