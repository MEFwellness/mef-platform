import { Fingerprint } from 'lucide-react';
import type { MemberWellnessHighlight } from '@/lib/intelligence-core/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * "Your Wellness Identity" (Milestone 9) — the member-facing surface for
 * the Wellness Intelligence Core's identity observations. Same restraint
 * as WellnessPatternsPanel: the server action
 * (getMyWellnessIdentityHighlights) already filters to a small,
 * high-confidence, positive-framed handful via
 * lib/intelligence-core/memberView.ts — this component only ever renders
 * plain statements, never confidence, evidence, or domain codes.
 */
export function WellnessIdentityPanel({ highlights }: { highlights: MemberWellnessHighlight[] }) {
  if (highlights.length === 0) return null;

  return (
    <section className={`${CARD} mt-5 p-6`}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Fingerprint className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Your Wellness Identity</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        Patterns your coach has noticed about how you personally respond, over time.
      </p>
      <ul className="mt-3 space-y-3">
        {highlights.map((highlight) => (
          <li
            key={highlight.id}
            className="rounded-2xl bg-[#FAFAF8] p-4 text-sm leading-relaxed text-[#1B3A2D]"
          >
            {highlight.statement}
          </li>
        ))}
      </ul>
    </section>
  );
}
