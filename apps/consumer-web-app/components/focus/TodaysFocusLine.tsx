/**
 * The one focus, rendered anywhere that needs to name it.
 *
 * The audit counted six surfaces naming five different focuses on one
 * morning: Home's brief said Stress, the noticing carousel said
 * Consistency, Root Score said complete a movement session, Today said
 * take a few minutes for your Daily Reset, Movement said strength and
 * conditioning, and the Root Map said stress regulation.
 *
 * This component is the answer. It reads the Priority Card decision
 * engine's already-published verdict through the interpretation layer's
 * focus accessor and renders it verbatim. It decides nothing, re-words
 * nothing, and has no second source to fall back on: when the engine has
 * no focus, this renders nothing at all rather than inventing one, which
 * is how five answers happened in the first place.
 *
 * It is a POINTER, not a second Priority Card. There are no buttons on it,
 * because the card is where a member acts on her focus and two places to
 * mark the same thing done is its own kind of contradiction. Tapping it
 * goes to Home, where the real card is.
 */

import Link from 'next/link';
import { Target } from 'lucide-react';
import { getMemberFocus } from '@/lib/member-interpretation/focus';

export async function TodaysFocusLine({
  /** Where the real card lives for this member's current context. Home by default. */
  href = '/dashboard',
  className = '',
}: {
  href?: '/dashboard' | '/today';
  className?: string;
}) {
  const focus = await getMemberFocus();
  if (!focus) return null;

  return (
    <Link
      href={href}
      className={`mef-press flex items-start gap-3 rounded-2xl bg-[#F3F6F4] p-5 transition hover:bg-[#EFF6F1] ${className}`}
    >
      <Target
        className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          {focus.status === 'done' ? 'Done today' : 'Your one thing today'}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{focus.title}</p>
      </div>
    </Link>
  );
}
