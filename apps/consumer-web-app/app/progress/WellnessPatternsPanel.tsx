import { Sparkles } from 'lucide-react';
import type { WellnessInsight } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Section 8's "Your Wellness Patterns" — restrained by construction: the
 * server action (getMyWellnessPatterns) already caps this at a small
 * handful of member-visible insights, so this component only ever
 * renders `member_summary` (never confidence, evidence_refs, or
 * coach_detail — those are coach-only, see CoachIntelligencePanel). No
 * mention of AI, no raw numbers — the tone is a coach quietly noticing
 * something, not a dashboard.
 */
export function WellnessPatternsPanel({ insights }: { insights: WellnessInsight[] }) {
  if (insights.length === 0) return null;

  return (
    <section className={`${CARD} mt-5 p-6`}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Your Wellness Patterns</p>
      </div>
      <ul className="mt-3 space-y-3">
        {insights.map((insight) => (
          <li
            key={insight.id}
            className="rounded-2xl bg-[#FAFAF8] p-4 text-sm leading-relaxed text-[#1B3A2D]"
          >
            {insight.member_summary}
          </li>
        ))}
      </ul>
    </section>
  );
}
