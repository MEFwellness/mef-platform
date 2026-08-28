import { Lock } from 'lucide-react';

/**
 * The small gold marker in the corner of a locked card. Gold (#C4A050,
 * the same tone as the Premium badge and the "Waiting on you" pill) so it
 * reads as a deliberate signal rather than a generic gray lock. Always
 * rendered outside whatever opacity/dim wrapper mutes the rest of the
 * card, so the marker itself never dims.
 *
 * IT NO LONGER NAMES A COACH (Build 2, 2026-08-27). This was
 * `CoachLockBadge`, labelled "Unlocked by your coach", from the days when
 * a coach-assign-only flag was what held these cards shut. Her plan is
 * what holds them shut now, the card and the sheet both say so, and a
 * badge that answered the same question differently was the only thing on
 * the screen still talking about assignment. The marker says the one
 * thing it can see: this is locked.
 */
export function LockedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[#C4A050] text-[#1B3A2D] shadow-[0_2px_10px_-2px_rgba(0,0,0,0.35)] ${className}`}
      aria-label="Locked"
      title="Locked"
    >
      <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
