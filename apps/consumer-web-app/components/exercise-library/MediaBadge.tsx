import { PlayCircle, ImageIcon, Dumbbell } from 'lucide-react';
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
  image: {
    label: 'Image',
    Icon: ImageIcon,
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
  exercise: { videoUrl: string | null; imageUrl: string | null };
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

/** The elegant "no preview available" placeholder — never a broken `<img>` icon. Shared by the card grid and (at a larger scale) the detail page. */
export function MediaPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-[#EFF6F1] to-[#E4EEE7] text-[#6B7A72]"
      aria-hidden="true"
    >
      <Dumbbell className={compact ? 'h-6 w-6' : 'h-10 w-10'} strokeWidth={1.25} />
      {!compact && <p className="text-xs font-medium">No preview available</p>}
    </div>
  );
}
