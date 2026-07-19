'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BrainCircuit, RefreshCw, Gauge, Compass } from 'lucide-react';
import type { IntelligenceCoreSummary } from '@/lib/intelligence-core/types';
import { requestIntelligenceCoreRecalculation } from '@/app/actions/intelligence-core';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const TREND_STYLE: Record<string, string> = {
  strengthening: 'bg-emerald-50 text-emerald-700',
  improving: 'bg-emerald-50 text-emerald-700',
  weakening: 'bg-amber-50 text-amber-700',
  declining: 'bg-amber-50 text-amber-700',
  stable: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
  insufficient_data: 'bg-[#FAFAF8] text-[#6B7A72]',
};

const LEVEL_STYLE: Record<string, string> = {
  very_high: 'bg-emerald-50 text-emerald-700',
  high: 'bg-emerald-50 text-emerald-700',
  moderate: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
  low: 'bg-amber-50 text-amber-700',
  very_low: 'bg-red-50 text-red-700',
  insufficient_data: 'bg-[#FAFAF8] text-[#6B7A72]',
};

function titleCase(text: string): string {
  return text.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function IntelligenceCorePanel({
  clientId,
  summary,
}: {
  clientId: string;
  summary: IntelligenceCoreSummary;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRecalculate() {
    setError(null);
    startTransition(async () => {
      const result = await requestIntelligenceCoreRecalculation(clientId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const { prioritization } = summary;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <BrainCircuit className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            MEF Wellness Intelligence Core
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleRecalculate}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1.5 text-xs font-medium text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.12] disabled:opacity-40"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Recalculate
        </button>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        A durable, confidence-weighted model of who this member is as a coaching subject — never a
        diagnosis. Composes every other system&apos;s output; nothing here is fabricated.
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {/* Coaching strategy / motivation profile */}
      <div className="mt-4 rounded-2xl bg-[#1B3A2D]/[0.04] p-4">
        <p className="text-sm font-semibold text-[#1B3A2D]">Current Coaching Strategy</p>
        <p className="mt-1 text-sm text-[#1B3A2D]/80">{summary.currentCoachingStrategy}</p>
        <p className="mt-2 text-xs text-[#6B7A72]">Motivation profile</p>
        <p className="text-sm text-[#1B3A2D]/80">{summary.motivationProfile}</p>
        {summary.longTermTrendSummary && (
          <>
            <p className="mt-2 text-xs text-[#6B7A72]">Long-term trend</p>
            <p className="text-sm text-[#1B3A2D]/80">{summary.longTermTrendSummary}</p>
          </>
        )}
      </div>

      {/* Coach Prioritization — one primary, up to two secondary, rest waits */}
      <div className="mt-3 rounded-2xl bg-[#1B3A2D]/[0.04] p-4">
        <div className="flex items-center gap-1.5 text-[#1B3A2D]">
          <Compass className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold">Coach Prioritization</p>
        </div>
        {prioritization.primary ? (
          <div className="mt-2 rounded-xl bg-white p-3">
            <span className="rounded-full bg-[#F5B700]/20 px-2.5 py-1 text-xs font-medium text-[#854D0E]">
              Primary focus
            </span>
            <p className="mt-1.5 text-sm font-medium text-[#1B3A2D]">
              {prioritization.primary.title}
            </p>
            <p className="mt-0.5 text-sm text-[#1B3A2D]/80">{prioritization.primary.detail}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#6B7A72]">
            No single leverage point stands out right now.
          </p>
        )}
        {prioritization.secondary.length > 0 && (
          <ul className="mt-2 space-y-2">
            {prioritization.secondary.map((opp, i) => (
              <li key={i} className="rounded-xl bg-white p-3">
                <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
                  Secondary
                </span>
                <p className="mt-1.5 text-sm font-medium text-[#1B3A2D]">{opp.title}</p>
                <p className="mt-0.5 text-sm text-[#1B3A2D]/80">{opp.detail}</p>
              </li>
            ))}
          </ul>
        )}
        {prioritization.deferredCount > 0 && (
          <p className="mt-2 text-xs text-[#6B7A72]">
            {prioritization.deferredCount} more opportunit
            {prioritization.deferredCount === 1 ? 'y' : 'ies'} waiting — never surfaced all at once,
            to avoid overwhelming the member.
          </p>
        )}
      </div>

      {/* Top strengths / biggest opportunities */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-[#1B3A2D]/[0.04] p-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Top Strengths</p>
          {summary.topStrengths.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {summary.topStrengths.map((s, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium capitalize text-[#1B3A2D]">{s.title}</span>
                  <p className="text-[#1B3A2D]/70">{s.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[#6B7A72]">Not enough data yet.</p>
          )}
        </div>
        <div className="rounded-2xl bg-[#1B3A2D]/[0.04] p-4">
          <p className="text-sm font-semibold text-[#1B3A2D]">Biggest Opportunities</p>
          {summary.biggestOpportunities.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {summary.biggestOpportunities.map((s, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium capitalize text-[#1B3A2D]">{s.title}</span>
                  <p className="text-[#1B3A2D]/70">{s.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-[#6B7A72]">Not enough data yet.</p>
          )}
        </div>
      </div>

      {summary.emergingConcerns.length > 0 && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Emerging Concerns</p>
          <ul className="mt-1 space-y-1">
            {summary.emergingConcerns.map((c, i) => (
              <li key={i} className="text-sm text-amber-900">
                · {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.recentWins.length > 0 && (
        <div className="mt-3 rounded-2xl bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">Recent Wins</p>
          <ul className="mt-1 space-y-1">
            {summary.recentWins.map((w, i) => (
              <li key={i} className="text-sm text-emerald-900">
                · {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wellness Identity — confidence-weighted observations, WHY explained */}
      {summary.identityObservations.length > 0 && (
        <div className="mt-4 border-t border-[#1B3A2D]/5 pt-3">
          <p className="text-sm font-semibold text-[#1B3A2D]">Wellness Identity</p>
          <p className="text-xs text-[#6B7A72]">
            Durable, confidence-weighted coaching observations — never a diagnosis.
          </p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {summary.identityObservations.map((o) => (
              <li key={o.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs capitalize text-[#6B7A72]">
                    {titleCase(o.domain)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${TREND_STYLE[o.trendDirection]}`}
                  >
                    {o.trendDirection}
                  </span>
                  <span className="text-xs text-[#6B7A72]">
                    {Math.round(o.confidence * 100)}% confidence · {o.evidenceCount} data point
                    {o.evidenceCount === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="mt-1 font-medium text-[#1B3A2D]">{o.statement}</p>
                <p className="mt-0.5 text-xs text-[#6B7A72]">Why: {o.coachDetail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wellness Profile — 15 named coaching-model dimensions */}
      <div className="mt-4 border-t border-[#1B3A2D]/5 pt-3">
        <div className="flex items-center gap-1.5 text-[#1B3A2D]">
          <Gauge className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold">Wellness Profile</p>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {summary.profileDimensions.map((d) => (
            <div key={d.dimension} className="rounded-xl bg-[#FAFAF8] p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize text-[#1B3A2D]">
                  {titleCase(d.dimension)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${LEVEL_STYLE[d.level]}`}
                >
                  {titleCase(d.level)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#6B7A72]">{d.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Coaching Style Profile */}
      <div className="mt-4 border-t border-[#1B3A2D]/5 pt-3">
        <p className="text-sm font-semibold text-[#1B3A2D]">Coaching Style Profile</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs capitalize text-[#1B3A2D]">
            Tone: {summary.coachingStyle.tonePreference.replaceAll('_', ' ')}
          </span>
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs capitalize text-[#1B3A2D]">
            Detail: {summary.coachingStyle.detailPreference}
          </span>
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs capitalize text-[#1B3A2D]">
            Task load: {summary.coachingStyle.taskLoadPreference.replaceAll('_', ' ')}
          </span>
          {summary.coachingStyle.timeCommitmentSweetSpotMinutes !== null && (
            <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs text-[#1B3A2D]">
              Sweet spot: {summary.coachingStyle.timeCommitmentSweetSpotMinutes} min
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-[#6B7A72]">{summary.coachingStyle.rationale}</p>
      </div>
    </section>
  );
}
