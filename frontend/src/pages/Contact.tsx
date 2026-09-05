import { motion } from "framer-motion";

export default function Contact() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-4xl text-maroon-800"
      >
        Get in Touch
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-4 text-maroon-900/70"
      >
        Questions about an order, a product, or delivery? We're happy to help.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2"
      >
        <a
          href="https://wa.me/27671572670"
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl bg-white p-6 ring-1 ring-maroon-100 transition-shadow hover:shadow-lg"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-gold-600">WhatsApp</p>
          <p className="mt-2 text-lg text-maroon-900">067 157 2670</p>
        </a>
        <a
          href="mailto:Heinrichcdoman@gmail.com"
          className="rounded-2xl bg-white p-6 ring-1 ring-maroon-100 transition-shadow hover:shadow-lg"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-gold-600">Email</p>
          <p className="mt-2 text-lg text-maroon-900">Heinrichcdoman@gmail.com</p>
        </a>
      </motion.div>
    </div>
  );
}
