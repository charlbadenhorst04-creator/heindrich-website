import { motion } from "framer-motion";

export default function About() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-4xl text-maroon-800"
      >
        About MERAVO
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-6 text-lg leading-relaxed text-maroon-900/70"
      >
        MERAVO is a South African online store built around a simple idea: everyday
        shopping should feel effortless, and every product should tell a little bit
        of your story. From household tools to gifts for the kids, we handpick
        products that combine quality and value.
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-4 text-lg leading-relaxed text-maroon-900/70"
      >
        We're based in South Africa and ship nationwide, with secure payments and
        a support team that's just a WhatsApp message away.
      </motion.p>
    </div>
  );
}
