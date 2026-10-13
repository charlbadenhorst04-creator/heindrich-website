/**
 * A woman in a sun hat strolling across the bottom of the screen with her
 * handbag, echoing the figure in the MERAVO banner.
 *
 * She lives in the fixed backdrop layer (BrandBackdrop), behind every
 * product and every word, and that layer is clipped, so she can never cover
 * anything or make the page scroll sideways. Her stride is CSS (.walker-* in
 * styles/index.css): legs and arms swing from hip and shoulder, the bag
 * swings from her hand, and she rises slightly as each leg passes under
 * her. Visitors whose device asks for less motion see her standing still.
 *
 * The same drawing as meravo-theme/snippets/walking-woman.liquid.
 */
export default function WalkingWoman() {
  return (
    <div className="walker">
      <div className="walker-bob">
        <svg viewBox="0 0 124 256" className="h-full w-auto" focusable="false">
          <ellipse className="walker-shadow" cx="62" cy="246" rx="26" ry="4" fill="#4a1520" opacity="0.18" />

          {/* Far side: leg and arm behind the coat. */}
          <g className="walker-leg walker-leg-back">
            <rect x="58" y="148" width="8.5" height="88" rx="4.25" fill="#4a1520" />
            <path d="M55 233 h13 q7 0 8 6 h-21 z" fill="#4a1520" />
          </g>
          <g className="walker-arm walker-arm-back">
            <rect x="58.5" y="78" width="7" height="56" rx="3.5" fill="#611c2b" />
            <circle cx="62" cy="136" r="3.6" fill="#e9bfae" />
          </g>

          {/* Long hair falls behind her shoulders. */}
          <path d="M53 52 Q48 70 47 88 Q46 100 52 104 Q56 92 58 80 Q57 66 60 56 Z" fill="#4a1520" />

          {/* Near leg. */}
          <g className="walker-leg walker-leg-front">
            <rect x="58" y="148" width="9" height="88" rx="4.5" fill="#611c2b" />
            <path d="M55 233 h13 q7 0 8 6 h-21 z" fill="#4a1520" />
          </g>

          {/* Belted coat. */}
          <path d="M51 76 Q62 71 73 76 L77 118 L86 166 Q62 173 38 166 L47 118 Z" fill="#7a2436" />
          <path d="M57 76 L62 94 L67 76 Q62 74 57 76 Z" fill="#8f2f40" />
          <rect x="45" y="114" width="33" height="4.5" rx="2.25" fill="#4a1520" />
          <path d="M62 118 L62 168" stroke="#611c2b" strokeWidth="1.2" />

          {/* Neck, head, face. */}
          <rect x="59" y="64" width="7" height="12" rx="3" fill="#e9bfae" />
          <circle cx="63" cy="57" r="10.5" fill="#f3d2c4" />
          <path d="M73 56 l2.6 3.4 l-2.8 0.8 z" fill="#f3d2c4" />
          <circle cx="68.2" cy="55.6" r="1.1" fill="#4a1520" />
          <path d="M67 61.6 q2 1 3.6 -0.2" stroke="#b34a5c" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M53.5 54 Q55 47 63 46.5 Q70 47 73 52 Q65 50 58 56 Z" fill="#4a1520" />

          {/* Wide-brim sun hat with a band. */}
          <path d="M51 49 Q52 35 63 34 Q74 35 75 49 Z" fill="#c9a15a" />
          <rect x="51" y="44.5" width="24" height="4" fill="#7a2436" />
          <ellipse cx="63" cy="49.5" rx="23" ry="4.4" fill="#c9a15a" />

          {/* Near arm, carrying the handbag. */}
          <g className="walker-arm walker-arm-front">
            <rect x="59" y="78" width="7.5" height="57" rx="3.75" fill="#8f2f40" />
            <circle cx="62.7" cy="137" r="3.8" fill="#f3d2c4" />
            <g className="walker-bag">
              <path d="M54.5 141 Q62.7 127 71 141" stroke="#96692b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <rect x="50" y="140" width="25.5" height="20" rx="4.5" fill="#c9a15a" />
              <rect x="50" y="140" width="25.5" height="7.5" rx="3.5" fill="#b8863d" />
              <circle cx="62.7" cy="148" r="1.7" fill="#96692b" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}
