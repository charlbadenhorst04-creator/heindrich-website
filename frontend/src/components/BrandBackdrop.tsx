import { motion, useReducedMotion } from "framer-motion";

/**
 * The Meravo brand artwork, held behind the whole site.
 *
 * It stays put while the page scrolls, which is the point: the brand is
 * always there without ever being something to scroll past. Two things
 * keep it from competing with the products it sits behind - it is held at
 * low opacity, and a wash of the site's own background colour is laid over
 * it, heaviest in the middle where product cards and text sit.
 *
 * On a wide screen the whole artwork is shown: it is one composition, and
 * cropping it to fill cuts the figure off the right-hand side. A phone is
 * the other way round - the artwork is two and a half times wider than it
 * is tall, so fitting all of it on a portrait screen leaves a thin band
 * with an unreadable wordmark. There it fills the screen instead, centred
 * on the wordmark.
 *
 * Fixed positioning rather than `background-attachment: fixed`, which iOS
 * Safari has never handled properly - it jumps on scroll and tears during
 * momentum scrolling.
 */
export default function BrandBackdrop() {
  // Someone who has asked their system for less motion should get a still
  // image, not a drifting one.
  const stillness = useReducedMotion();

  return (
    <div
      aria-hidden
      // Held back a little on phones, where the artwork fills the screen
      // rather than sitting inside it and so competes harder with the
      // products in front of it.
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-70 md:opacity-100"
    >
      <motion.img
        src="/images/meravo-banner.jpg"
        alt=""
        // Decorative, and never the reason to wait for the page.
        loading="eager"
        fetchPriority="low"
        className="h-full w-full object-cover object-center md:object-contain"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={
          stillness
            ? { opacity: 0.38, scale: 1 }
            : { opacity: 0.38, scale: [1.02, 1.06, 1.02] }
        }
        transition={
          stillness
            ? { duration: 0.8 }
            : {
                opacity: { duration: 1.6, ease: "easeOut" },
                // Slow enough to read as the room breathing rather than as
                // something moving on the page.
                scale: { duration: 48, repeat: Infinity, ease: "easeInOut" },
              }
        }
      />

      {/* Softens the middle of the screen, where the products and text
          sit, while letting the artwork stay legible towards the edges. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_50%_45%,rgba(253,246,243,0.55)_0%,rgba(253,246,243,0.62)_45%,rgba(253,246,243,0.78)_80%,rgba(253,246,243,0.9)_100%)]" />
    </div>
  );
}
