'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  BrainCircuit,
  Pin,
  PinOff,
  Check,
  X,
  CheckCheck,
  RefreshCw,
  MessageSquarePlus,
  EyeOff,
} from 'lucide-react';
import type { WellnessInsight, WellnessInsightType } from '@mef/shared-types-contracts';
import type { PriorityIntelligence } from '@/lib/intelligence/types';
import {
  confirmInsightAction,
  dismissInsightAction,
  resolveInsightAction,
  pinInsightAction,
  addInsightCoachContextAction,
  requestWellnessIntelligenceRecalculation,
} from '@/app/actions/wellness-intelligence';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const TYPE_LABEL: Record<WellnessInsightType, string> = {
  trend: 'Trend',
  pattern: 'Pattern',
  strength: 'Strength',
  priority_summary: 'Priority overview',
};

const SEVERITY_STYLE: Record<WellnessInsight['severity'], string> = {
  important: 'bg-red-50 text-red-700',
  notable: 'bg-amber-50 text-amber-700',
  info: 'bg-[#1B3A2D]/[0.06] text-[#1B3A2D]/70',
};

const TIME_WINDOW_LABEL: Record<WellnessInsight['time_window'], string> = {
  last_7_days: 'Last 7 days',
  previous_7_days: 'Previous 7 days',
  last_14_days: 'Last 14 days',
  last_30_days: 'Last 30 days',
  previous_30_days: 'Previous 30 days',
  last_90_days: 'Last 90 days',
  since_baseline: 'Since baseline',
  since_reassessment: 'Since reassessment',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parsePrioritySummary(coachDetail: string): PriorityIntelligence | null {
  try {
    return JSON.parse(coachDetail) as PriorityIntelligence;
  } catch {
    return null;
  }
}

function PrioritySummaryBanner({ insight }: { insight: WellnessInsight }) {
  const priority = parsePrioritySummary(insight.coach_detail);
  if (!priority) return null;

  const rows: { label: string; value: string | null }[] = [
    { label: 'Primary priority', value: priority.primaryPriority },
    { label: 'Secondary priority', value: priority.secondaryPriority },
    { label: 'Area to maintain', value: priority.areaToMaintain },
    { label: 'Emerging concern', value: priority.emergingConcern },
    { label: 'Strongest area', value: priority.strongestCurrentArea },
  ];

  return (
    <div className="rounded-2xl bg-[#1B3A2D]/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#1B3A2D]">Priority Intelligence</p>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
            priority.recommendedCoachAttentionLevel === 'priority'
              ? SEVERITY_STYLE.important
              : priority.recommendedCoachAttentionLevel === 'discuss'
                ? SEVERITY_STYLE.notable
                : SEVERITY_STYLE.info
          }`}
        >
          Attention: {priority.recommendedCoachAttentionLevel}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {rows
          .filter((r) => r.value)
          .map((r) => (
            <span
              key={r.label}
              className="rounded-full bg-white px-2.5 py-1 text-xs text-[#1B3A2D]/80"
              title={r.label}
            >
              {r.label}: {r.value}
            </span>
          ))}
      </div>
    </div>
  );
}

function InsightRow({ insight }: { insight: WellnessInsight }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addingContext, setAddingContext] = useState(false);
  const [context, setContext] = useState(insight.coach_context ?? '');
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setAddingContext(false);
      router.refresh();
    });
  }

  if (insight.insight_type === 'priority_summary') {
    return (
      <li className="py-3">
        <PrioritySummaryBanner insight={insight} />
      </li>
    );
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
            {TYPE_LABEL[insight.insight_type]}
          </span>
          {insight.wellness_area && (
            <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs capitalize text-[#6B7A72]">
              {insight.wellness_area.replaceAll('_', ' ')}
            </span>
          )}
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEVERITY_STYLE[insight.severity]}`}
          >
            {insight.severity}
          </span>
          <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs text-[#6B7A72]">
            {TIME_WINDOW_LABEL[insight.time_window]}
          </span>
          {!insight.member_visible && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              <EyeOff className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Coach-only
            </span>
          )}
          {insight.status !== 'active' && (
            <span className="rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs capitalize text-[#1B3A2D]/70">
              {insight.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => pinInsightAction(insight.id, !insight.is_pinned))}
            title={insight.is_pinned ? 'Unpin' : 'Pin as important'}
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
          >
            {insight.is_pinned ? (
              <Pin className="h-4 w-4 fill-current" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <PinOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            disabled={isPending || insight.status === 'confirmed'}
            onClick={() => run(() => confirmInsightAction(insight.id))}
            title="Confirm"
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] disabled:opacity-30"
          >
            <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={isPending || insight.status === 'resolved'}
            onClick={() => run(() => resolveInsightAction(insight.id))}
            title="Mark resolved"
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] disabled:opacity-30"
          >
            <CheckCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setAddingContext((v) => !v)}
            title="Add context"
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
          >
            <MessageSquarePlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={isPending || insight.status === 'dismissed'}
            onClick={() => run(() => dismissInsightAction(insight.id))}
            title="Dismiss as inaccurate"
            className="rounded-full p-1.5 text-[#1B3A2D]/60 hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] disabled:opacity-30"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="mt-1.5 text-sm font-medium text-[#1B3A2D]">{insight.title}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-[#1B3A2D]/80">{insight.coach_detail}</p>
      {insight.recommended_coach_action && (
        <p className="mt-1 text-xs italic text-[#6B7A72]">
          Suggested: {insight.recommended_coach_action}
        </p>
      )}
      {insight.coach_context && (
        <p className="mt-1.5 rounded-xl bg-[#FAFAF8] p-2.5 text-xs text-[#1B3A2D]/80">
          Coach note: {insight.coach_context}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#6B7A72]">
        <span>{Math.round(insight.confidence * 100)}% confidence</span>
        <span>·</span>
        <span>
          {insight.evidence_refs.length} evidence reference
          {insight.evidence_refs.length === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span>Updated {formatDate(insight.updated_at)}</span>
      </div>

      {addingContext && (
        <div className="mt-2 space-y-2 rounded-2xl bg-[#FAFAF8] p-3">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Add your own context or correction…"
            rows={2}
            className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-white p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isPending || !context.trim()}
              onClick={() => run(() => addInsightCoachContextAction(insight.id, context))}
              className="rounded-full bg-[#1B3A2D] px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              Save context
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </li>
  );
}

export function IntelligencePanel({
  clientId,
  insights,
}: {
  clientId: string;
  insights: WellnessInsight[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const priority = insights.find((i) => i.insight_type === 'priority_summary');
  const active = insights.filter(
    (i) =>
      i.insight_type !== 'priority_summary' && (i.status === 'active' || i.status === 'confirmed')
  );
  const other = insights.filter(
    (i) =>
      i.insight_type !== 'priority_summary' && i.status !== 'active' && i.status !== 'confirmed'
  );

  function handleRecalculate() {
    setError(null);
    startTransition(async () => {
      const result = await requestWellnessIntelligenceRecalculation(clientId);
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
          <BrainCircuit className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Personal Wellness Intelligence
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
        Longer-term trends and patterns across this member&apos;s real check-in and coaching history —
        never a diagnosis.
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {priority && (
        <div className="mt-3">
          <PrioritySummaryBanner insight={priority} />
        </div>
      )}

      {active.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7A72]">
          No notable patterns yet — insights build as more history comes in.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {active.map((insight) => (
            <InsightRow key={insight.id} insight={insight} />
          ))}
        </ul>
      )}

      {other.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-[#6B7A72]">
            {other.length} resolved, dismissed, or superseded insight{other.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-2 divide-y divide-[#1B3A2D]/5 opacity-70">
            {other.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
