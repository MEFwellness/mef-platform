/**
 * Root Cause Signals (Prompt 6) — coach-only. Renders
 * lib/intelligence-engine/rootCauseSignals.ts's already-composed view:
 * nothing here computes anything itself, purely presentational, same
 * "never a diagnosis" framing as MemberIntelligencePanel's own Root Cause
 * Hypotheses section.
 */

import { GitMerge } from 'lucide-react';
import type { RootCauseSignalsView } from '@/lib/intelligence-engine/rootCauseSignals';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function RootCauseSignalsPanel({ signals }: { signals: RootCauseSignalsView }) {
  const {
    signals: hypotheses,
    correlations,
    findingTimeline,
    suggestedAssessments,
    suggestedReassessments,
    suggestedCoachingPriorities,
  } = signals;

  const hasAnything =
    hypotheses.length > 0 ||
    correlations.length > 0 ||
    findingTimeline.length > 0 ||
    suggestedAssessments.length > 0 ||
    suggestedReassessments.length > 0;

  if (!hasAnything) return null;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <GitMerge className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Root Cause Signals</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        Cross-assessment findings, patterns, and suggested next steps — coaching signals only, never
        a diagnosis.
      </p>

      {hypotheses.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Most Supported Findings</p>
          <ul className="mt-2 space-y-3">
            {hypotheses.map((s) => (
              <li key={s.hypothesis.id} className="rounded-2xl bg-[#FAFAF8] p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-[#1B3A2D]">{s.hypothesis.statement}</p>
                  <span className="shrink-0 text-xs text-[#6B7A72]">
                    {Math.round(s.hypothesis.confidence * 100)}%
                  </span>
                </div>
                {s.supportingAssessments.length > 0 && (
                  <p className="mt-1.5 text-xs text-[#6B7A72]">
                    <span className="font-medium">Supporting assessments:</span>{' '}
                    {s.supportingAssessments.join(', ')}
                  </p>
                )}
                {s.relatedFindingLabels.length > 0 && (
                  <p className="mt-1 text-xs text-[#6B7A72]">
                    <span className="font-medium">Related findings:</span>{' '}
                    {s.relatedFindingLabels.join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {correlations.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Cross-Assessment Correlations</p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {correlations.map((c) => (
              <li key={c.key} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-[#1B3A2D]">{c.label}</span>
                  <span className="text-xs text-[#6B7A72]">
                    {Math.round(c.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="mt-0.5 text-[#1B3A2D]/80">{c.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {findingTimeline.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Finding Timeline</p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {findingTimeline.slice(0, 8).map((f) => (
              <li
                key={`${f.domain}-${f.code}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="font-medium text-[#1B3A2D]">{f.label}</span>
                <span className="text-xs capitalize text-[#6B7A72]">
                  {f.currentTrendStatus ?? f.currentStatus} · first seen{' '}
                  {new Date(f.firstObservedAt).toLocaleDateString()} · {f.occurrenceCount}x observed
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestedAssessments.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Suggested Assessments</p>
          <ul className="mt-2 space-y-1.5">
            {suggestedAssessments.map((s) => (
              <li key={s.assessmentKey} className="text-sm text-[#1B3A2D]/80">
                · {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestedReassessments.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Suggested Reassessment</p>
          <ul className="mt-2 space-y-1.5">
            {suggestedReassessments.map((r) => (
              <li key={r.assessmentKey} className="text-sm text-[#1B3A2D]/80">
                · {r.displayName}: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-[#1B3A2D]/[0.04] p-3">
        <p className="text-sm font-semibold text-[#1B3A2D]">Suggested Coaching Priorities</p>
        <p className="mt-1 text-xs text-[#6B7A72]">
          {suggestedCoachingPriorities.coachAttentionReason ?? 'Nothing urgent right now.'}
        </p>
      </div>
    </section>
  );
}
