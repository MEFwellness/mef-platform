import { VideoOff } from 'lucide-react';

/**
 * How a coach is told that an exercise exists but cannot be given to a
 * member yet. One component, one sentence, used by every picker that
 * searches the full library, so the two pickers can never end up saying
 * different things about the same exercise.
 *
 * It renders as a row, not a button. There is no disabled button here on
 * purpose: a greyed-out button invites a tap and then swallows it, which
 * reads as a broken screen. This is plainly a listing with a reason on it.
 *
 * The reason is the truth and not a euphemism. These are MEF's own written
 * corrective exercises, waiting on video. They stay visible because a coach
 * planning a program has a real reason to see what exists; they are simply
 * not pickable until there is something to show the member.
 */
export const NOT_ASSIGNABLE_LABEL = 'No video, cannot be assigned';

export function NotAssignableRow({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div
      aria-disabled="true"
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] px-4 py-3 text-left"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#4F645A]">{name}</p>
        {subtitle && <p className="mt-0.5 truncate text-xs text-[#4F645A]">{subtitle}</p>}
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#854D0E]">
        <VideoOff className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        {NOT_ASSIGNABLE_LABEL}
      </span>
    </div>
  );
}
