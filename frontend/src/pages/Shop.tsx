import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import ProductCard from "../components/ProductCard";
import ProductCardSkeleton from "../components/ProductCardSkeleton";
import type { Category, Product } from "../api/types";

export default function Shop() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // Every search/filter change starts a new request while earlier ones may
  // still be in flight. Only the newest is allowed to write to state, so a
  // slow earlier response can't land on top of newer results.
  const requestId = useRef(0);

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const handle = setTimeout(() => {
      const id = ++requestId.current;
      api
        .listProducts({ q: query || undefined, category: activeCategory, page: 1 })
        .then((res) => {
          if (id !== requestId.current) return;
          setProducts(res.items);
          setTotal(res.total);
          setPage(1);
          setLoadFailed(false);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setProducts([]);
          setTotal(0);
          setLoadFailed(true);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, activeCategory, retryTick]);

  // Without this the page only ever showed the API's first page, so once the
  // catalogue grew past one page those products were unreachable entirely.
  const loadMore = async () => {
    const nextPage = page + 1;
    // Continuation of the current query, so take the id rather than bumping
    // it. If a search or filter starts before this returns, that bumps the
    // id and these results are dropped instead of being appended onto a
    // list they no longer belong to.
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const res = await api.listProducts({
        q: query || undefined,
        category: activeCategory,
        page: nextPage,
      });
      if (id !== requestId.current) return;
      setProducts((prev) => [...prev, ...res.items]);
      setTotal(res.total);
      setPage(nextPage);
    } catch {
      if (id === requestId.current) setLoadFailed(true);
    } finally {
      // Always clears: this is the button's own spinner state, so it must
      // reset even when the results above were discarded as stale.
      setLoadingMore(false);
    }
  };

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
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : products.map((product, i) => <ProductCard key={product.id} product={product} index={i} />)}
      </div>

      {!loading && products.length < total && (
        <div className="mt-10 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full bg-maroon-700 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-maroon-800 disabled:opacity-60"
          >
            {loadingMore ? "Loading..." : `Load more (${total - products.length} left)`}
          </button>
        </div>
      )}

      {/* A failed request and a genuinely empty result need different copy -
          telling someone to "try a different search" when the API is down
          sends them chasing a problem that isn't theirs. */}
      {!loading && products.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-16 text-center text-maroon-900/50"
        >
          {loadFailed ? (
            <>
              <p>We couldn't load the products just now.</p>
              <button
                onClick={() => setRetryTick((t) => t + 1)}
                className="mt-4 rounded-full bg-maroon-700 px-6 py-2 text-sm font-semibold text-white hover:bg-maroon-800"
              >
                Try again
              </button>
            </>
          ) : (
            <p>No products found. Try a different search or category.</p>
          )}
        </motion.div>
      )}
    </div>
  );
}
