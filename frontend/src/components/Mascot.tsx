import { motion } from "framer-motion";

// A decorative, hand-drawn-style mascot for the hero section - a happy
// shopper enjoying a MERAVO product. Pure inline SVG + Framer Motion,
// no external image assets.
export default function Mascot({ className = "" }: { className?: string }) {
  return (
    <motion.div
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.4 }}
    >
      <motion.svg
        viewBox="0 0 220 280"
        className="h-full w-full"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* soft ground shadow */}
        <ellipse cx="110" cy="262" rx="52" ry="10" fill="#7A2436" opacity="0.12" />

        {/* legs */}
        <rect x="86" y="196" width="16" height="46" rx="8" fill="#611c2b" />
        <rect x="118" y="196" width="16" height="46" rx="8" fill="#611c2b" />
        <rect x="80" y="236" width="28" height="12" rx="6" fill="#4a1520" />
        <rect x="112" y="236" width="28" height="12" rx="6" fill="#4a1520" />

        {/* body */}
        <rect x="66" y="120" width="88" height="90" rx="30" fill="#8f2f40" />
        <rect x="66" y="120" width="88" height="26" rx="13" fill="#7a2436" />

        {/* static arm holding a shopping bag */}
        <g transform="translate(150 150)">
          <rect x="-8" y="0" width="18" height="52" rx="9" fill="#8f2f40" transform="rotate(18)" />
        </g>
        <g transform="translate(168 196)">
          <rect x="-16" y="-4" width="34" height="30" rx="6" fill="#c9a15a" />
          <path d="M-8 -4 v-10 a8 8 0 0 1 16 0 v10" stroke="#96692b" strokeWidth="4" fill="none" strokeLinecap="round" />
        </g>

        {/* waving arm */}
        <motion.g
          style={{ transformOrigin: "72px 132px" }}
          animate={{ rotate: [0, 24, 0, 24, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }}
        >
          <rect x="52" y="130" width="18" height="52" rx="9" fill="#8f2f40" />
          <circle cx="58" cy="178" r="12" fill="#f6e3e5" />
        </motion.g>

        {/* head */}
        <circle cx="110" cy="86" r="48" fill="#f6e3e5" />

        {/* ears */}
        <circle cx="60" cy="88" r="9" fill="#f6e3e5" />
        <circle cx="160" cy="88" r="9" fill="#f6e3e5" />

        {/* hair */}
        <path d="M64 70 a46 40 0 0 1 92 0 q-4 -14 -20 -14 q-4 8 -14 4 q-6 -10 -18 -6 q-10 4 -12 12 q-16 -4 -28 4z" fill="#4a1520" />

        {/* cheeks */}
        <circle cx="80" cy="98" r="9" fill="#e0a0a9" opacity="0.6" />
        <circle cx="140" cy="98" r="9" fill="#e0a0a9" opacity="0.6" />

        {/* eyes (blinking) */}
        <motion.g
          animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.85, 0.9, 0.95, 1], ease: "easeInOut" }}
          style={{ transformOrigin: "center" }}
        >
          <ellipse cx="92" cy="86" rx="5" ry="6" fill="#4a1520" />
          <ellipse cx="128" cy="86" rx="5" ry="6" fill="#4a1520" />
        </motion.g>

        {/* big happy smile */}
        <path
          d="M86 104 Q110 126 134 104"
          stroke="#7a2436"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />

        {/* sparkles of delight */}
        {[
          { x: 34, y: 60, delay: 0 },
          { x: 190, y: 50, delay: 0.6 },
          { x: 176, y: 130, delay: 1.2 },
        ].map((s, i) => (
          <motion.path
            key={i}
            d={`M${s.x} ${s.y - 8} l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z`}
            fill="#c9a15a"
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: s.delay, ease: "easeInOut" }}
          />
        ))}
      </motion.svg>
    </motion.div>
  );
}
