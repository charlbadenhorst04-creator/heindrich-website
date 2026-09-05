import { motion } from "framer-motion";

import { showcaseProducts, type ShowcaseProduct } from "../data/showcaseProducts";
import ShowcaseCard from "./ShowcaseCard";

interface ProductShowcaseProps {
  products?: ShowcaseProduct[];
  eyebrow?: string;
  title?: string;
}

/**
 * Front-end-only product showcase: a horizontal scroll-snap carousel on
 * mobile that becomes a multi-column grid from the `md` breakpoint up.
 * Pass `products` to display a different set - defaults to
 * `showcaseProducts` from src/data/showcaseProducts.ts.
 */
export default function ProductShowcase({
  products = showcaseProducts,
  eyebrow = "Shop the Range",
  title = "Popular Right Now",
}: ProductShowcaseProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mb-8"
      >
        <p className="text-sm font-semibold uppercase tracking-widest text-gold-600">{eyebrow}</p>
        <h2 className="mt-1 font-display text-3xl text-maroon-800">{title}</h2>
      </motion.div>

      <div
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:pb-0 lg:grid-cols-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {products.map((product, index) => (
          <ShowcaseCard key={product.id} product={product} index={index} />
        ))}
      </div>
    </section>
  );
}
