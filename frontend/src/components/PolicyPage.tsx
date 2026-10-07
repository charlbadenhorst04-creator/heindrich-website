import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** The shared layout for the Privacy, Returns and Terms pages. */
export default function PolicyPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-4xl text-maroon-800"
      >
        {title}
      </motion.h1>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-8 rounded-2xl bg-white p-6 text-lg leading-relaxed text-maroon-900/70 ring-1 ring-maroon-100 sm:p-8"
      >
        {children}
      </motion.div>
    </div>
  );
}

export const policyLinkClass = "font-medium text-maroon-700 underline-offset-2 hover:underline";
