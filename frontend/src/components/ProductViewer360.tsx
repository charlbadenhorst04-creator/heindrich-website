import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface ProductViewer360Props {
  // Pass one image for the tilt/parallax fallback (Mode B), or several
  // sequential frames (product-01.jpg ... product-36.jpg) for a real
  // drag-to-rotate 360 view (Mode A). The mode is picked automatically.
  images: string[];
  alt: string;
  className?: string;
}

const AUTOPLAY_MS = 90;
const PX_PER_FRAME = 6;

export default function ProductViewer360({ images, alt, className = "" }: ProductViewer360Props) {
  const frames = images.filter(Boolean);
  const mode: "sequence" | "tilt" = frames.length > 1 ? "sequence" : "tilt";

  if (frames.length === 0) {
    return <div className={`aspect-square rounded-3xl bg-blush-100 ${className}`} aria-hidden="true" />;
  }

  return mode === "sequence" ? (
    <SequenceViewer frames={frames} alt={alt} className={className} />
  ) : (
    <TiltViewer image={frames[0]} alt={alt} className={className} />
  );
}

function SequenceViewer({ frames, alt, className }: { frames: string[]; alt: string; className: string }) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartFrame = useRef(0);

  // Warm the browser cache for every frame up front so drag-scrubbing
  // doesn't stutter waiting on network requests.
  useEffect(() => {
    frames.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [frames]);

  // Slow idle rotation until the visitor first touches the viewer.
  useEffect(() => {
    if (hasInteracted) return;
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [hasInteracted, frames.length]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartFrame.current = frameIndex;
    setHasInteracted(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - dragStartX.current;
    const steps = Math.round(deltaX / PX_PER_FRAME);
    const next = ((dragStartFrame.current - steps) % frames.length + frames.length) % frames.length;
    setFrameIndex(next);
  };

  const endDrag = () => {
    isDragging.current = false;
  };

  return (
    <div
      className={`relative aspect-square touch-none select-none overflow-hidden rounded-3xl bg-blush-100 ${className}`}
      style={{ touchAction: "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label={`${alt} - drag to rotate 360 degrees`}
    >
      <img
        src={frames[frameIndex]}
        alt={alt}
        draggable={false}
        className="h-full w-full cursor-grab object-cover active:cursor-grabbing"
      />

      <ViewerHint visible={!hasInteracted} text="Drag to rotate" />
    </div>
  );
}

function TiltViewer({ image, alt, className }: { image: string; alt: string; className: string }) {
  const [hasInteracted, setHasInteracted] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springConfig = { stiffness: 150, damping: 18, mass: 0.6 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [10, -10]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-10, 10]), springConfig);
  const scale = useSpring(1, springConfig);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
    scale.set(1.03);
    if (!hasInteracted) setHasInteracted(true);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
    scale.set(1);
  };

  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-3xl bg-blush-100 ${className}`}
      style={{ perspective: 800, touchAction: "pan-y" }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <motion.img
        src={image}
        alt={alt}
        draggable={false}
        className="h-full w-full select-none object-cover"
        style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" }}
      />

      <ViewerHint visible={!hasInteracted} text="Move to explore" />
    </div>
  );
}

function ViewerHint({ visible, text }: { visible: boolean; text: string }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-maroon-900/70 px-3 py-1.5 text-xs font-medium text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-9L21 12m0 0l-4.5 4.5M21 12H7.5" />
          </svg>
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
