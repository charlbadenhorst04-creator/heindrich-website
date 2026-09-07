import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { mascotTips } from "../data/mascotTips";
import { useMascotStore } from "../store/mascotStore";

// M steps aside on the pages where a mis-tap costs the shopper money -
// on a narrow screen a floating corner widget can sit right on top of
// the pay/place-order button.
const HIDDEN_ON = ["/checkout", "/order-success"];

const STORAGE_KEY = "meravo_mascot_minimized";

// M - the small assistant character that lives in the bottom-right corner
// of every page. Personality/copy comes from data/mascotTips.ts; behaviour
// (wave on load, celebrate on add-to-cart, minimize) lives here.
export default function MascotAssistant({ tips = mascotTips }: { tips?: string[] }) {
  const celebrationTick = useMascotStore((s) => s.celebrationTick);
  const isFirstTick = useRef(true);
  const { pathname } = useLocation();

  const [minimized, setMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [showBubble, setShowBubble] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [hasWaved, setHasWaved] = useState(false);

  // Wave once, shortly after the page settles.
  useEffect(() => {
    const t = setTimeout(() => setHasWaved(true), 700);
    return () => clearTimeout(t);
  }, []);

  // Celebrate whenever something is added to the cart, anywhere in the app.
  useEffect(() => {
    if (isFirstTick.current) {
      isFirstTick.current = false;
      return;
    }
    setCelebrating(true);
    const t = setTimeout(() => setCelebrating(false), 1500);
    return () => clearTimeout(t);
  }, [celebrationTick]);

  const persistMinimized = (value: boolean) => {
    setMinimized(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // localStorage unavailable (private mode etc.) - not worth failing over
    }
  };

  const openBubble = () => {
    setTipIndex((i) => (i + 1) % tips.length);
    setShowBubble(true);
  };

  // Auto-dismiss the speech bubble a few seconds after it opens, so a tap
  // on mobile (no mouse-leave to close it) doesn't leave it stuck open.
  useEffect(() => {
    if (!showBubble) return;
    const t = setTimeout(() => setShowBubble(false), 3200);
    return () => clearTimeout(t);
  }, [showBubble]);

  if (HIDDEN_ON.includes(pathname)) return null;

  if (minimized) {
    return (
      <motion.button
        type="button"
        onClick={() => persistMinimized(false)}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        aria-label="Show M, your shopping assistant"
        className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-[#7C2A38] text-[#F8EFE8] shadow-lg sm:bottom-6 sm:right-6"
      >
        <span className="font-display text-lg">M</span>
      </motion.button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {showBubble && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative max-w-[220px] rounded-2xl bg-white px-4 py-2.5 text-sm text-[#7C2A38] shadow-lg ring-1 ring-[#F1D9D2]"
          >
            {tips[tipIndex]}
            <div className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 bg-white ring-1 ring-[#F1D9D2]" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <button
          type="button"
          onClick={() => persistMinimized(true)}
          aria-label="Minimize M"
          className="absolute -right-1 -top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs text-[#7C2A38] shadow ring-1 ring-[#F1D9D2] hover:bg-[#F8EFE8]"
        >
          ×
        </button>

        <motion.button
          type="button"
          onClick={openBubble}
          onMouseEnter={openBubble}
          onMouseLeave={() => setShowBubble(false)}
          aria-label="M, your shopping assistant - tap for a tip"
          className="relative block h-16 w-16 cursor-pointer sm:h-[72px] sm:w-[72px]"
          animate={
            celebrating
              ? { y: [0, -18, 0, -10, 0], rotate: [0, -8, 8, -8, 0] }
              : { y: [0, -6, 0] }
          }
          transition={
            celebrating
              ? { duration: 0.8, ease: "easeInOut" }
              : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-md">
            {/* body */}
            <circle cx="50" cy="56" r="34" fill="#F1D9D2" />
            {/* ears */}
            <circle cx="24" cy="40" r="8" fill="#F1D9D2" />
            <circle cx="76" cy="40" r="8" fill="#F1D9D2" />
            {/* ivory belly highlight */}
            <ellipse cx="50" cy="66" rx="16" ry="11" fill="#F8EFE8" />
            {/* bow - signature wine-red accent */}
            <path d="M50 40 l-9 -6 v12 z" fill="#7C2A38" />
            <path d="M50 40 l9 -6 v12 z" fill="#7C2A38" />
            <circle cx="50" cy="40" r="3.5" fill="#7C2A38" />
            {/* cheeks */}
            <circle cx="34" cy="58" r="4.5" fill="#F8EFE8" opacity="0.9" />
            <circle cx="66" cy="58" r="4.5" fill="#F8EFE8" opacity="0.9" />
            {/* eyes (blink loop) */}
            <motion.g
              animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
              transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.85, 0.9, 0.95, 1], ease: "easeInOut" }}
              style={{ transformOrigin: "center" }}
            >
              <circle cx="40" cy="52" r="3.4" fill="#7C2A38" />
              <circle cx="60" cy="52" r="3.4" fill="#7C2A38" />
            </motion.g>
            {/* smile */}
            <path d="M40 62 Q50 70 60 62" stroke="#7C2A38" strokeWidth="2.6" strokeLinecap="round" fill="none" />

            {/* waving hand */}
            <motion.g
              style={{ transformOrigin: "78px 62px" }}
              animate={hasWaved ? { rotate: [0, 24, 0, 24, 0, 0] } : { rotate: 0 }}
              transition={{ duration: 1.6, ease: "easeInOut" }}
            >
              <circle cx="78" cy="62" r="7" fill="#F1D9D2" />
            </motion.g>
          </svg>

          {celebrating && (
            <>
              {[
                { x: "10%", y: "10%", delay: 0 },
                { x: "85%", y: "5%", delay: 0.1 },
                { x: "90%", y: "60%", delay: 0.2 },
                { x: "0%", y: "60%", delay: 0.15 },
              ].map((s, i) => (
                <motion.span
                  key={i}
                  className="pointer-events-none absolute h-2 w-2 rounded-full bg-[#c9a15a]"
                  style={{ left: s.x, top: s.y }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 1, 0], y: [0, -14] }}
                  transition={{ duration: 0.9, delay: s.delay, ease: "easeOut" }}
                />
              ))}
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
