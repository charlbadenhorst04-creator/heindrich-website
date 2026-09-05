import { motion } from "framer-motion";
import { useState } from "react";

import type { ShowcaseProduct } from "../data/showcaseProducts";
import { formatZAR } from "../utils/format";

export default function ShowcaseCard({
  product,
  index = 0,
}: {
  product: ShowcaseProduct;
  index?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showPlaceholder = !product.imageUrl || imageFailed;

  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.08, 0.48), ease: "easeOut" }}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="w-64 shrink-0 snap-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-maroon-100 transition-shadow hover:shadow-xl md:w-auto md:shrink md:snap-align-none"
    >
      <div className="aspect-square overflow-hidden bg-blush-100">
        {showPlaceholder ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blush-100 to-blush-200">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-maroon-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </div>
        ) : (
          <motion.img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
            whileHover={{ scale: 1.08 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        )}
      </div>

      <div className="p-4">
        <h3 className="line-clamp-2 font-medium text-maroon-900">{product.name}</h3>
        <p className="mt-2 font-display text-lg text-maroon-700">{formatZAR(product.price)}</p>
      </div>
    </motion.article>
  );
}
