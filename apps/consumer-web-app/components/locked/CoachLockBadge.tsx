import { Lock } from 'lucide-react';

/**
 * Coach-Assign-Only Gating task (2026-08-04) — the small gold "unlocked by
 * your coach" marker in the corner of a locked card, per the task's own
 * design requirement to use the app's gold accent (#C4A050, the same tone
 * already used for the Premium badge and the "Waiting on you" pill) so it
 * reads as a distinct, deliberate signal rather than a generic gray lock.
 * Always rendered outside whatever opacity/dim wrapper mutes the rest of
 * the card's content, so the marker itself never dims.
 */
export function CoachLockBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[#C4A050] text-[#1B3A2D] shadow-[0_2px_10px_-2px_rgba(0,0,0,0.35)] ${className}`}
      aria-label="Unlocked by your coach"
      title="Unlocked by your coach"
    >
      <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
