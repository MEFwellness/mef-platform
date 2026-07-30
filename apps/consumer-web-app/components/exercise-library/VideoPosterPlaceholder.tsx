import {
  getPlaceholderVisual,
  type PlaceholderMark,
} from '@/lib/exercise-library/placeholderVisual';

/**
 * Deep-forest-green background + a faint radial/diagonal gold or cream
 * accent, keyed by PlaceholderVisual's `tone` (0-3). All four stay inside
 * the brand palette (forest green #1B3A2D, warm gold #C4A050, cream
 * #F5F0E4) — this is the "grid doesn't look like one repeated tile" knob.
 */
const TONE_BACKGROUND: Record<number, string> = {
  0: 'radial-gradient(circle at 88% 12%, rgba(196,160,80,0.30) 0%, rgba(196,160,80,0) 55%), #1B3A2D',
  1: 'radial-gradient(circle at 10% 90%, rgba(196,160,80,0.26) 0%, rgba(196,160,80,0) 55%), #1B3A2D',
  2: 'linear-gradient(135deg, rgba(245,240,228,0.14) 0%, rgba(245,240,228,0) 60%), #1B3A2D',
  3: 'radial-gradient(circle at 50% 100%, rgba(196,160,80,0.20) 0%, rgba(196,160,80,0) 65%), #1B3A2D',
};

/**
 * Minimal abstract line marks — not literal body/muscle clip-art — tied to
 * the exercise's primary muscle group via PlaceholderVisual's `mark`.
 * Rendered faint, in a corner, so the play button stays the dominant
 * element on the card.
 */
function PlaceholderMarkSvg({ mark }: { mark: PlaceholderMark }) {
  const stroke = { stroke: '#C4A050', strokeWidth: 1.5, fill: 'none', opacity: 0.4 } as const;

  switch (mark) {
    case 'upper_body':
      return (
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute -right-4 -top-4 h-24 w-24" aria-hidden="true">
          <circle cx="24" cy="28" r="15" {...stroke} />
          <circle cx="40" cy="38" r="15" {...stroke} />
        </svg>
      );
    case 'lower_body':
      return (
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute -bottom-4 -right-4 h-24 w-24" aria-hidden="true">
          <line x1="22" y1="4" x2="8" y2="60" {...stroke} />
          <line x1="42" y1="4" x2="56" y2="60" {...stroke} />
        </svg>
      );
    case 'core':
      return (
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute -right-4 -top-4 h-24 w-24" aria-hidden="true">
          <circle cx="32" cy="32" r="9" {...stroke} />
          <circle cx="32" cy="32" r="19" {...stroke} />
        </svg>
      );
    case 'full_body':
      return (
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute -right-3 -top-3 h-24 w-24" aria-hidden="true">
          <line x1="32" y1="4" x2="32" y2="60" {...stroke} />
          <line x1="4" y1="32" x2="60" y2="32" {...stroke} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute -right-4 -top-4 h-24 w-24" aria-hidden="true">
          <circle cx="32" cy="32" r="17" {...stroke} />
        </svg>
      );
  }
}

/**
 * Branded stand-in for a video card's poster frame before poster
 * extraction has run for that exercise. Purely a function of already-
 * loaded exercise fields (posterUrl gates whether this even renders, at
 * the call site) — once a real poster exists this component is simply not
 * rendered, zero code change needed.
 *
 * Renders background + mark + name only — both call sites (ExerciseCard's
 * grid tile, ExerciseDetailView's TapToPlayVideo) already layer their own
 * play-button overlay on top of whatever fills this space, so this
 * component must not draw a second one.
 */
export function VideoPosterPlaceholder({
  exercise,
}: {
  exercise: { name: string; primaryMuscle: string | null; category: string | null };
}) {
  const { mark, tone } = getPlaceholderVisual(exercise);

  return (
    <div
      className="relative flex h-full w-full items-end overflow-hidden p-3"
      style={{ background: TONE_BACKGROUND[tone] }}
    >
      <PlaceholderMarkSvg mark={mark} />
      <p className="relative line-clamp-2 font-[family-name:var(--font-cormorant-garamond)] text-base leading-snug text-[#F5F0E4]">
        {exercise.name}
      </p>
    </div>
  );
}
