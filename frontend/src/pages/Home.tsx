import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import ProductCard from "../components/ProductCard";
import ProductCardSkeleton from "../components/ProductCardSkeleton";
import ProductShowcase from "../components/ProductShowcase";
import type { Product } from "../api/types";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listProducts({ page: 1 })
      .then((res) => setProducts(res.items.slice(0, 8)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-b from-maroon-100 via-blush-100 to-blush-50">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-32">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-sm font-semibold uppercase tracking-[0.3em] text-gold-600"
          >
            Proudly South African
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-4 font-display text-4xl font-semibold text-maroon-800 sm:text-5xl lg:text-6xl"
          >
            Your Style. Your Story.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 max-w-xl text-base text-maroon-900/70 sm:text-lg"
          >
            Discover carefully chosen products for home, family and everyday life —
            delivered to your door, anywhere in South Africa.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8"
          >
            <Link
              to="/shop"
              className="inline-flex items-center gap-2 rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-maroon-800"
            >
              Shop Now
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </motion.div>
        </div>

        <motion.div
          className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-maroon-300/20 blur-3xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
      </section>

      <ProductShowcase />

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-gold-600">Featured</p>
            <h2 className="mt-1 font-display text-3xl text-maroon-800">New &amp; Popular</h2>
          </div>
          <Link to="/shop" className="text-sm font-medium text-maroon-700 hover:underline">
            View all &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : products.map((product, i) => <ProductCard key={product.id} product={product} index={i} />)}
        </div>
      </section>

      <section className="bg-maroon-800 py-14">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 text-center text-blush-50 sm:grid-cols-3 sm:px-6 lg:px-8">
          <div>
            <p className="font-display text-2xl">Nationwide Delivery</p>
            <p className="mt-2 text-sm text-blush-100/80">Fast, tracked shipping across South Africa.</p>
          </div>
          <div>
            <p className="font-display text-2xl">Secure Checkout</p>
            <p className="mt-2 text-sm text-blush-100/80">Payments processed securely via Payfast.</p>
          </div>
          <div>
            <p className="font-display text-2xl">Real Support</p>
            <p className="mt-2 text-sm text-blush-100/80">Reach us on WhatsApp for any questions.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
