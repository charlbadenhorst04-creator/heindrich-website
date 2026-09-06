import { motion } from "framer-motion";
import { useRef, useState } from "react";

interface ProductExplainerVideoProps {
  productName: string;
  videoUrl?: string;
  posterUrl?: string;
  bullets?: string[];
}

const DEFAULT_BULLETS = [
  "Thoughtfully made with everyday use in mind",
  "A practical addition to home, family or on-the-go life",
  "Care for it well and it'll care for you back",
];

export default function ProductExplainerVideo({
  productName,
  videoUrl,
  posterUrl,
  bullets,
}: ProductExplainerVideoProps) {
  return videoUrl ? (
    <VideoMode productName={productName} videoUrl={videoUrl} posterUrl={posterUrl} />
  ) : (
    <FeatureHighlights bullets={bullets && bullets.length > 0 ? bullets : DEFAULT_BULLETS} />
  );
}

function VideoMode({
  productName,
  videoUrl,
  posterUrl,
}: {
  productName: string;
  videoUrl: string;
  posterUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [unmuted, setUnmuted] = useState(false);

  const unmuteAndPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    video.play().catch(() => {
      // Autoplay-with-sound can be blocked by the browser - the visible
      // controls still let the visitor start it manually.
    });
    setUnmuted(true);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setUnmuted(!video.muted);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl bg-maroon-900">
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl}
        muted
        loop
        autoPlay
        playsInline
        className="aspect-video w-full object-cover"
        aria-label={`${productName} explainer video`}
      />

      {!unmuted && (
        <button
          type="button"
          onClick={unmuteAndPlay}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-maroon-900/30 text-white transition-colors hover:bg-maroon-900/40"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-maroon-800 shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="text-sm font-medium">Tap for sound</span>
        </button>
      )}

      {unmuted && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label="Mute video"
          className="absolute bottom-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-maroon-800 shadow"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12c0-1.6-.8-3-2-3.9M17 5.1A9 9 0 0121 12a9 9 0 01-4 7.5M15.5 8.5v7L11 12l4.5-3.5zM8 9v6H4V9h4z" />
          </svg>
        </button>
      )}
    </div>
  );
}

function FeatureHighlights({ bullets }: { bullets: string[] }) {
  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-maroon-100 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-gold-600">Why you'll love it</p>
      <ul className="mt-4 space-y-4">
        {bullets.map((bullet, i) => (
          <motion.li
            key={bullet}
            initial={{ opacity: 0, x: -12 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: i * 0.15 }}
            className="flex items-start gap-3"
          >
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-maroon-100 text-maroon-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </span>
            <span className="text-sm text-maroon-900/80">{bullet}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
