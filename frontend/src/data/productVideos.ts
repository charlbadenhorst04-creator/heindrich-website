export interface ProductVideoEntry {
  videoUrl?: string;
  posterUrl?: string;
  // 3-4 short bullets covering materials / use case / care. Shown as the
  // fallback "feature highlight" card whenever videoUrl isn't set yet.
  bullets?: string[];
}

// Keyed by product slug so it's trivial to drop in a real clip per product
// later - just add videoUrl (and optionally posterUrl) to that entry.
// Nothing else in the app needs to change.
export const productVideos: Record<string, ProductVideoEntry> = {
  "101-piece-magnetic-precision-screwdriver-set": {
    bullets: [
      "Magnetic, chrome-vanadium steel bits that resist stripping",
      "Perfect for electronics, appliance and everyday household repairs",
      "Wipe clean and store bits in the rack to keep them organised",
    ],
  },
  "car-vacuum-cleaner": {
    bullets: [
      "Compact handheld design with strong cyclonic suction",
      "Ideal for quick clean-ups of seats, mats and boot space",
      "Empty the dust cup after use and rinse the filter monthly",
    ],
  },
  "interactive-plush-lion-hand-puppet": {
    bullets: [
      "Ultra-soft plush exterior, safe for ages 3 and up",
      "Fits little (and big) hands for imaginative storytime play",
      "Spot clean only - keep away from open flame",
    ],
  },
  "kids-drawing-tablet": {
    bullets: [
      "Pressure-sensitive LCD screen with instant one-tap erase",
      "Screen-free, reusable drawing for the car, home or on the go",
      "Wipe the screen with a soft, dry cloth - no liquids",
    ],
  },
  "kids-hobby-horse-unicorn-galloping-sounds": {
    bullets: [
      "Soft plush head with a sturdy, padded pole",
      "Built-in galloping and neighing sounds for active play",
      "Requires 2x AA batteries (included); wipe clean with a damp cloth",
    ],
  },
  "kids-mountain-bike-seat-dual-handle": {
    bullets: [
      "Reinforced steel mounting bracket fits most adult mountain bikes",
      "Dual handlebars give little riders a secure, confident grip",
      "Check mounting bolts are tight before every ride",
    ],
  },
  "white-shoe-cleaner-restore-refresh-shine": {
    bullets: [
      "Gentle whitening cream formulated for canvas and leather sneakers",
      "Apply with the included sponge, buff, then air dry",
      "Store the tub sealed, away from direct sunlight",
    ],
  },
};
