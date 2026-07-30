import { PlayCircle, NotebookText, Dumbbell } from 'lucide-react';
import { getExerciseMediaTier, type ExerciseMediaTier } from '@/lib/exercise-library/ranking';

const BADGE_COPY: Record<
  ExerciseMediaTier,
  { label: string; Icon: typeof PlayCircle; className: string }
> = {
  video: {
    label: 'Video',
    Icon: PlayCircle,
    className: 'bg-[#1B3A2D] text-white',
  },
  cues: {
    label: 'Cues',
    Icon: NotebookText,
    className: 'bg-white text-[#1B3A2D]',
  },
  none: {
    label: 'No Media',
    Icon: Dumbbell,
    className: 'bg-white/90 text-[#6B7A72]',
  },
};

/** One small, unambiguous "what will I see" signal — never a broken-image icon, per the Exercise Library media requirement. Same tier logic that drives ranking (lib/exercise-library/ranking.ts), so the badge a member sees always matches why a card sorted where it did. */
export function MediaBadge({
  exercise,
  className = '',
}: {
  exercise: { hasVideo: boolean; cues: string[] };
  className?: string;
}) {
  const tier = getExerciseMediaTier(exercise);
  const { label, Icon, className: toneClassName } = BADGE_COPY[tier];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${toneClassName} ${className}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * The card-surface fallback for an exercise with no video — renders its
 * coaching cues right where media would appear. Every exercise_catalog
 * row gets a generated cue row (see scripts/exercise-media/
 * generate-your-move-cues.ts, run over the whole Your Move catalog), so
 * `cues` is expected to be non-empty by the time this renders; the
 * empty-cues branch below is a plain, unlabeled background — never the
 * old dumbbell "No preview available" placeholder — since that state
 * should not occur against the real catalog.
 */
export function CuesPlaceholder({ cues, compact = false }: { cues: string[]; compact?: boolean }) {
  if (cues.length === 0) {
    return <div className="h-full w-full bg-gradient-to-br from-[#EFF6F1] to-[#E4EEE7]" aria-hidden="true" />;
  }

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 bg-gradient-to-br from-[#EFF6F1] to-[#E4EEE7] px-4 py-3 text-[#1B3A2D]">
      {cues.slice(0, compact ? 1 : 3).map((cue, i) => (
        <p
          key={i}
          className={compact ? 'line-clamp-2 text-[11px] leading-snug' : 'line-clamp-2 text-xs leading-snug'}
        >
          {cue}
        </p>
      ))}
    </div>
  );
}
