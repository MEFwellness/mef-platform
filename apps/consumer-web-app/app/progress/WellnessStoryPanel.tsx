import { Compass, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { MemberWellnessStorySummary } from '@/lib/intelligence-core/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * "Your Wellness Story" — the Intelligence Core's strengths/opportunities/
 * priorities/wins/motivation, member-projected via
 * toMemberWellnessStorySummary (title-only, no confidence/evidence/domain
 * codes — same restraint as WellnessIdentityPanel/WellnessPatternsPanel).
 * Renders nothing when there isn't yet enough real signal for any section,
 * same honest-empty-state discipline as every other panel on this page.
 */
export function WellnessStoryPanel({ summary }: { summary: MemberWellnessStorySummary }) {
  const hasStrengths = summary.topStrengths.length > 0;
  const hasOpportunities = summary.biggestOpportunities.length > 0;
  const hasPriority = summary.primaryPriorityTitle !== null || summary.secondaryPriorityTitles.length > 0;
  const hasWins = summary.recentWins.length > 0;
  const hasNarrative = summary.motivationProfile.length > 0 || summary.longTermTrendSummary !== null;

  if (!hasStrengths && !hasOpportunities && !hasPriority && !hasWins && !hasNarrative) {
    return null;
  }

  return (
    <div className="mt-5 space-y-5">
      {hasNarrative && (
        <section className={`${CARD} mef-animate-in p-7`}>
          <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Where You Are Right Now
          </p>
          <p className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[1.35rem] leading-relaxed text-[#1B3A2D]">
            {summary.longTermTrendSummary ?? summary.motivationProfile}
          </p>
        </section>
      )}

      {hasPriority && (
        <section className={`${CARD} mef-animate-in p-6`}>
          <div className="flex items-center gap-2 text-[#854D0E]">
            <Target className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Your Focus</p>
          </div>
          {summary.primaryPriorityTitle && (
            <p className="mt-3 rounded-2xl bg-[#EFF6F1] p-4 text-sm font-medium leading-relaxed text-[#1B3A2D]">
              {summary.primaryPriorityTitle}
            </p>
          )}
          {summary.secondaryPriorityTitles.length > 0 && (
            <ul className="mt-2.5 space-y-2">
              {summary.secondaryPriorityTitles.map((title) => (
                <li key={title} className="rounded-2xl bg-[#FAFAF8] p-3.5 text-sm text-[#1B3A2D]">
                  {title}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(hasStrengths || hasOpportunities) && (
        <section className={`${CARD} mef-animate-in p-6`}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {hasStrengths && (
              <div>
                <div className="flex items-center gap-2 text-[#854D0E]">
                  <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Strengths</p>
                </div>
                <ul className="mt-2.5 space-y-2">
                  {summary.topStrengths.map((title) => (
                    <li key={title} className="rounded-2xl bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D]">
                      {title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasOpportunities && (
              <div>
                <div className="flex items-center gap-2 text-[#854D0E]">
                  <TrendingUp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider">Opportunities</p>
                </div>
                <ul className="mt-2.5 space-y-2">
                  {summary.biggestOpportunities.map((title) => (
                    <li key={title} className="rounded-2xl bg-[#FAFAF8] p-3 text-sm text-[#1B3A2D]">
                      {title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {hasWins && (
        <section className={`${CARD} mef-animate-in p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">Recent Wins</p>
          <ul className="mt-2.5 space-y-2">
            {summary.recentWins.map((win) => (
              <li key={win} className="rounded-2xl bg-[#FAFAF8] p-3.5 text-sm text-[#1B3A2D]">
                {win}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
