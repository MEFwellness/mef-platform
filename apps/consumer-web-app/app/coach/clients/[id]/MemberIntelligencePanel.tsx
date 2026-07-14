'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Radar, RefreshCw, AlertTriangle, Check, X, CheckCheck, Sparkles } from 'lucide-react';
import type {
  IntelligenceCoachAlert,
  IntelligenceAlertSeverity,
} from '@mef/shared-types-contracts';
import type { MemberIntelligenceReport } from '@/lib/intelligence-engine/types';
import {
  requestIntelligenceRecalculation,
  acknowledgeCoachAlertAction,
  resolveCoachAlertAction,
  dismissCoachAlertAction,
} from '@/app/actions/intelligence-engine';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SEVERITY_STYLE: Record<IntelligenceAlertSeverity, string> = {
  important: 'bg-red-50 text-red-700',
  notable: 'bg-amber-50 text-amber-700',
  info: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
};

const DIRECTION_STYLE: Record<string, string> = {
  improving: 'bg-emerald-50 text-emerald-700',
  declining: 'bg-red-50 text-red-700',
  stable: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
  insufficient_data: 'bg-[#FAFAF8] text-[#6B7A72]',
};

const ATTENTION_STYLE: Record<string, string> = {
  priority: 'bg-red-50 text-red-700',
  discuss: 'bg-amber-50 text-amber-700',
  monitor: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
  none: 'bg-[#FAFAF8] text-[#6B7A72]',
};

function formatArea(area: string | null): string {
  if (!area) return 'none';
  return area.replaceAll('_', ' ');
}

function AlertRow({ alert }: { alert: IntelligenceCoachAlert }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setNoteOpen(false);
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEVERITY_STYLE[alert.severity]}`}
        >
          {alert.severity}
        </span>
        <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs capitalize text-[#6B7A72]">
          {alert.alert_type.replaceAll('_', ' ')}
        </span>
        {alert.status !== 'open' && (
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs capitalize text-[#1B3A2D]/70">
            {alert.status}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm font-medium text-[#1B3A2D]">{alert.title}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]/80">{alert.reason}</p>

      {alert.status === 'open' || alert.status === 'acknowledged' ? (
        <div className="mt-2 flex items-center gap-1">
          {alert.status === 'open' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => acknowledgeCoachAlertAction(alert.id))}
              title="Acknowledge"
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/[0.06]"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Acknowledge
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => setNoteOpen((v) => !v)}
            title="Resolve"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/[0.06]"
          >
            <CheckCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Resolve
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => dismissCoachAlertAction(alert.id))}
            title="Dismiss as inaccurate"
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[#1B3A2D]/70 hover:bg-[#1B3A2D]/[0.06]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Dismiss
          </button>
        </div>
      ) : null}

      {noteOpen && (
        <div className="mt-2 space-y-2 rounded-2xl bg-[#FAFAF8] p-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional resolution note…"
            rows={2}
            className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-white p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => resolveCoachAlertAction(alert.id, note))}
              className="rounded-full bg-[#1B3A2D] px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              Confirm resolve
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </li>
  );
}

export function MemberIntelligencePanel({
  clientId,
  report,
  alerts,
}: {
  clientId: string;
  report: MemberIntelligenceReport;
  alerts: IntelligenceCoachAlert[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { memberSummary, priorities, longitudinalTrends, patterns, hypotheses, recommendations } =
    report;
  const openAlerts = alerts.filter((a) => a.status === 'open' || a.status === 'acknowledged');
  const otherAlerts = alerts.filter((a) => a.status === 'resolved' || a.status === 'dismissed');

  function handleRecalculate() {
    setError(null);
    startTransition(async () => {
      const result = await requestIntelligenceRecalculation(clientId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Radar className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">MEF Intelligence Engine</p>
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
        The centralized longitudinal read every coaching surface shares — never a diagnosis, every
        claim traces back to real evidence.
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {/* Member Summary */}
      <div className="mt-4 rounded-2xl bg-[#1B3A2D]/[0.04] p-4">
        <p className="text-sm font-semibold text-[#1B3A2D]">Member Summary</p>
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[#6B7A72]">Current focus</dt>
            <dd className="text-[#1B3A2D]">{memberSummary.currentFocus ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7A72]">Biggest obstacle</dt>
            <dd className="text-[#1B3A2D]">{memberSummary.biggestObstacle ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7A72]">Most improved area</dt>
            <dd className="text-[#1B3A2D] capitalize">
              {formatArea(memberSummary.mostImprovedArea)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7A72]">Greatest opportunity</dt>
            <dd className="text-[#1B3A2D] capitalize">
              {formatArea(memberSummary.greatestOpportunity)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7A72]">Coaching style</dt>
            <dd className="text-[#1B3A2D]">{memberSummary.currentCoachingStyle}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7A72]">Adherence score</dt>
            <dd className="text-[#1B3A2D]">
              {memberSummary.adherenceScore !== null ? `${memberSummary.adherenceScore}%` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7A72]">Recommended next discussion</dt>
            <dd className="text-[#1B3A2D]">{memberSummary.recommendedNextDiscussion ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#6B7A72]">Wellness trajectory</dt>
            <dd className="text-[#1B3A2D] capitalize">
              {memberSummary.wellnessTrajectory.replaceAll('_', ' ')}
            </dd>
          </div>
        </dl>
        {memberSummary.recentWins.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-[#6B7A72]">Recent wins</p>
            <ul className="mt-1 space-y-1">
              {memberSummary.recentWins.map((win, i) => (
                <li key={i} className="text-sm text-[#1B3A2D]">
                  · {win}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Coaching Priorities */}
      <div className="mt-3 rounded-2xl bg-[#1B3A2D]/[0.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#1B3A2D]">Coaching Priorities</p>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${ATTENTION_STYLE[priorities.recommendedCoachAttentionLevel]}`}
          >
            Attention: {priorities.recommendedCoachAttentionLevel}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            { label: 'Primary', value: priorities.primaryPriority },
            { label: 'Secondary', value: priorities.secondaryPriority },
            { label: 'Maintain', value: priorities.areaToMaintain },
            { label: 'Emerging', value: priorities.emergingConcern },
            { label: 'Strongest', value: priorities.strongestCurrentArea },
          ]
            .filter((r) => r.value)
            .map((r) => (
              <span
                key={r.label}
                className="rounded-full bg-white px-2.5 py-1 text-xs capitalize text-[#1B3A2D]/80"
                title={r.label}
              >
                {r.label}: {formatArea(r.value)}
              </span>
            ))}
        </div>
        {priorities.coachAttentionReason && (
          <p className="mt-2 text-sm text-[#1B3A2D]/80">{priorities.coachAttentionReason}</p>
        )}
      </div>

      {/* Longitudinal Trends */}
      <div className="mt-3">
        <p className="text-sm font-semibold text-[#1B3A2D]">Longitudinal Trends</p>
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {longitudinalTrends.map((trend) => (
            <li
              key={trend.area}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="font-medium capitalize text-[#1B3A2D]">{trend.area}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${DIRECTION_STYLE[trend.direction]}`}
                >
                  {trend.direction.replaceAll('_', ' ')}
                </span>
                <span className="text-xs text-[#6B7A72]">
                  {Math.round(trend.confidence * 100)}% confidence
                </span>
                <span className="text-xs text-[#6B7A72]">
                  {trend.points
                    .filter((p) => p.averageScore !== null)
                    .map(
                      (p) =>
                        `${p.window.replace('last_', '').replace('_days', 'd')}: ${p.averageScore}`
                    )
                    .join(' · ')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Patterns */}
      {patterns.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-[#1B3A2D]">Patterns</p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {patterns.map((pattern) => (
              <li key={pattern.key} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs capitalize text-[#6B7A72]">
                    {pattern.kind.replaceAll('_', ' ')}
                  </span>
                  <span className="text-xs text-[#6B7A72]">
                    {Math.round(pattern.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="mt-1 font-medium text-[#1B3A2D]">{pattern.label}</p>
                <p className="mt-0.5 text-[#1B3A2D]/80">{pattern.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Root Cause Hypotheses */}
      {hypotheses.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-[#1B3A2D]">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold">Root Cause Hypotheses</p>
          </div>
          <p className="text-xs text-[#6B7A72]">Coaching hypotheses only — never a diagnosis.</p>
          <ul className="mt-2 space-y-3">
            {hypotheses.map((h) => (
              <li key={h.id} className="rounded-2xl bg-[#FAFAF8] p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-[#1B3A2D]">{h.statement}</p>
                  <span className="shrink-0 text-xs text-[#6B7A72]">
                    {Math.round(h.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[#6B7A72]">
                  <span className="font-medium">Known facts:</span> {h.knownFacts.join(' ')}
                </p>
                <p className="mt-1 text-xs text-[#6B7A72]">
                  <span className="font-medium">Alternative explanations:</span>{' '}
                  {h.alternativeExplanations.join(' ')}
                </p>
                <p className="mt-1 text-xs italic text-[#1B3A2D]/70">
                  Suggested direction: {h.recommendedCoachingDirection}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-[#1B3A2D]">Recommendations</p>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
            {recommendations.map((r, i) => (
              <li key={`${r.domain}-${i}`} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium capitalize text-[#1B3A2D]">
                    {r.domain.replaceAll('_', ' ')}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                      r.priority === 'high'
                        ? SEVERITY_STYLE.important
                        : r.priority === 'medium'
                          ? SEVERITY_STYLE.notable
                          : SEVERITY_STYLE.info
                    }`}
                  >
                    {r.priority}
                  </span>
                </div>
                <p className="mt-1 font-medium text-[#1B3A2D]">{r.title}</p>
                <p className="mt-0.5 text-[#1B3A2D]/80">{r.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Coach Alerts */}
      <div className="mt-4 border-t border-[#1B3A2D]/5 pt-3">
        <div className="flex items-center gap-1.5 text-[#1B3A2D]">
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold">Coach Alerts</p>
        </div>
        {openAlerts.length === 0 ? (
          <p className="mt-2 text-sm text-[#6B7A72]">No open alerts right now.</p>
        ) : (
          <ul className="mt-1 divide-y divide-[#1B3A2D]/5">
            {openAlerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
        {otherAlerts.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-[#6B7A72]">
              {otherAlerts.length} resolved or dismissed alert{otherAlerts.length === 1 ? '' : 's'}
            </summary>
            <ul className="mt-2 divide-y divide-[#1B3A2D]/5 opacity-70">
              {otherAlerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
