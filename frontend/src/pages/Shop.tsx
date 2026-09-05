import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import { api } from "../api/client";
import ProductCard from "../components/ProductCard";
import type { Category, Product } from "../api/types";

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    const handle = setTimeout(() => {
      api
        .listProducts({ q: query || undefined, category: activeCategory, page: 1 })
        .then((res) => setProducts(res.items))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, activeCategory]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="font-display text-3xl text-maroon-800">Browse &amp; Buy</h1>
      <p className="mt-2 text-maroon-900/60">Everything you need, all in one place.</p>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory(undefined)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeCategory === undefined
                ? "bg-maroon-700 text-white"
                : "bg-white text-maroon-800 ring-1 ring-maroon-200"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.slug)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeCategory === cat.slug
                  ? "bg-maroon-700 text-white"
                  : "bg-white text-maroon-800 ring-1 ring-maroon-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          className="w-full rounded-full border border-maroon-200 bg-white px-5 py-2 text-sm outline-none ring-maroon-300 focus:ring-2 sm:w-64"
        />
      </div>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
        {products.map((product, i) => (
          <ProductCard key={product.id} product={product} index={i} />
        ))}
      </div>

      {!loading && products.length === 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-16 text-center text-maroon-900/50"
        >
          No products found. Try a different search or category.
        </motion.p>
      )}
    </div>
  );
}
