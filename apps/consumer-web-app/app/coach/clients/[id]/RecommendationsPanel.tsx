/**
 * Coach Dashboard — Recommendations (Prompt 11). Coach-only, read-only:
 * shows recommendation history grouped by status plus supporting findings,
 * confidence, and why each was generated — the one place confidence
 * renders (members never see it), matching MemberIntelligencePanel.tsx's
 * existing confidence-display convention. Same "never compute here, purely
 * presentational" discipline as RootCauseSignalsPanel/RootMapPanel.
 */

import type { CoachMemberRecommendationView } from '@/app/actions/recommendations';
import type { LifestyleExperiment } from '@/lib/lifestyle-experiments';
import type { RecommendationEvent } from '@/lib/longitudinal-intelligence';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const EVENT_LABEL: Record<RecommendationEvent['eventType'], string> = {
  started: 'started',
  stopped_early: 'stopped early',
  dismissed: 'dismissed',
  marked_helpful: 'marked helpful',
  marked_not_helpful: 'marked not helpful',
  reflection_outcome_worked: 'reflected: worked',
  reflection_outcome_partially_worked: 'reflected: partially worked',
  reflection_outcome_didnt_work: "reflected: didn't work",
  reflection_outcome_inconclusive: 'reflected: inconclusive',
  member_reported_improvement: 'member reported improvement',
  member_reported_no_change: 'member reported no change',
  member_reported_worsening: 'member reported worsening',
};

const STATUS_LABEL: Record<CoachMemberRecommendationView['status'], string> = {
  shown: 'Active',
  completed: 'Completed',
  ignored: 'Ignored by member',
  expired: 'Expired',
};

const STATUS_STYLE: Record<CoachMemberRecommendationView['status'], string> = {
  shown: 'bg-[#EAF3EC] text-[#2F5D3A]',
  completed: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
  ignored: 'bg-[#FDF2E3] text-[#8A5A1F]',
  expired: 'bg-[#FAFAF8] text-[#6B7A72]',
};

export function RecommendationsPanel({
  recommendations,
  experiments,
  events = [],
}: {
  recommendations: CoachMemberRecommendationView[];
  experiments: LifestyleExperiment[];
  /** Prompt 12, Part 4/6 — the real outcome-event history behind each row below (member_recommendation_events, migration 94). Optional so this panel keeps working for any caller that hasn't fetched it. */
  events?: RecommendationEvent[];
}) {
  if (recommendations.length === 0 && experiments.length === 0) return null;

  const eventsByRecommendationId = new Map<string, RecommendationEvent[]>();
  for (const event of events) {
    const bucket = eventsByRecommendationId.get(event.recommendationId);
    if (bucket) bucket.push(event);
    else eventsByRecommendationId.set(event.recommendationId, [event]);
  }

  return (
    <section className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#3E5C46]">
        Recommendations
      </p>
      <p className="mt-1 text-xs text-[#6B7A72]">
        What the Recommendation Engine has surfaced for this member, why, and what they&apos;ve
        done with it — never a diagnosis.
      </p>

      {recommendations.length > 0 && (
        <ul className="mt-3 divide-y divide-[#1B3A2D]/5">
          {recommendations.map((r) => (
            <li key={r.rowId} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
                <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs capitalize text-[#6B7A72]">
                  {r.category.replaceAll('_', ' ')}
                </span>
                <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs text-[#6B7A72]">
                  {Math.round(r.confidence * 100)}% confidence
                </span>
              </div>
              <p className="mt-1.5 font-medium text-[#1B3A2D]">{r.title}</p>
              <p className="mt-0.5 text-[#1B3A2D]/80">{r.explanation}</p>
              <p className="mt-1 text-xs text-[#6B7A72]">{r.whyThisWasSelected}</p>
              {r.supportingFindings.length > 0 && (
                <p className="mt-1 text-xs text-[#6B7A72]">
                  <span className="font-medium">Supporting findings:</span>{' '}
                  {r.supportingFindings.join(' · ')}
                </p>
              )}
              {(eventsByRecommendationId.get(r.rowId)?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-[#6B7A72]">
                  <span className="font-medium">Response history:</span>{' '}
                  {eventsByRecommendationId
                    .get(r.rowId)!
                    .map((e) => EVENT_LABEL[e.eventType])
                    .join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {experiments.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Lifestyle Experiments</p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {experiments.map((e) => (
              <li key={e.id} className="py-2.5 text-sm">
                <p className="font-medium text-[#1B3A2D]">{e.title}</p>
                <p className="mt-0.5 text-xs text-[#6B7A72]">
                  {e.status.replaceAll('_', ' ')} · started {new Date(e.startDate).toLocaleDateString()} ·{' '}
                  {e.durationDays} days
                  {e.outcome ? ` · outcome: ${e.outcome.replaceAll('_', ' ')}` : ''}
                </p>
                {e.reflectionText && (
                  <p className="mt-1 text-[#1B3A2D]/80">{e.reflectionText}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
