'use client';

/**
 * Coach Dashboard — Longitudinal Intelligence (Prompt 12, Part 6). The one
 * new coach panel this prompt adds — everything else extends an existing
 * panel (RecommendationsPanel.tsx gained event-history rendering
 * separately). Purely presentational except for the "Request reassessment"
 * form at the bottom: signal states, tiers, and the Root Router's outcome
 * are all already-computed elsewhere (lib/longitudinal-intelligence/,
 * lib/investigation-engine/routerOutcome.ts) — this file never derives a
 * new conclusion, it explains the ones that already exist.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, HelpCircle } from 'lucide-react';
import { requestClientReassessment } from '@/app/actions/longitudinalIntelligence';
import type { LongitudinalSignal, SignalState } from '@/lib/longitudinal-intelligence';
import type { RootRouterOutcomeView } from '@/lib/investigation-engine/routerOutcome';
import type { AssessmentKey } from '@/lib/assessment-registry/types';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const STATE_LABEL: Record<SignalState, string> = {
  one_time_observation: 'One-time observation',
  repeated_signal: 'Repeated signal',
  emerging_pattern: 'Emerging pattern',
  established_pattern: 'Established pattern',
  improving: 'Improving',
  worsening: 'Worsening',
  stable: 'Stable',
  resolved: 'Resolved',
  stale: 'Stale',
  conflicting: 'Conflicting',
  insufficient_data: 'Insufficient data',
};

const STATE_STYLE: Record<SignalState, string> = {
  one_time_observation: 'bg-[#FAFAF8] text-[#6B7A72]',
  repeated_signal: 'bg-[#EAF3EC] text-[#2F5D3A]',
  emerging_pattern: 'bg-[#EAF3EC] text-[#2F5D3A]',
  established_pattern: 'bg-[#1B3A2D]/[0.08] text-[#1B3A2D]',
  improving: 'bg-[#EAF3EC] text-[#2F5D3A]',
  worsening: 'bg-[#FDF2E3] text-[#8A5A1F]',
  stable: 'bg-[#FAFAF8] text-[#6B7A72]',
  resolved: 'bg-[#EAF3EC] text-[#2F5D3A]',
  stale: 'bg-[#FAFAF8] text-[#6B7A72]',
  conflicting: 'bg-[#FDF2E3] text-[#8A5A1F]',
  insufficient_data: 'bg-[#FAFAF8] text-[#6B7A72]',
};

/** Static, deterministic — same shape as routerOutcome.ts's own MEMBER_MESSAGE table, never a freeform generator. */
const COACHING_QUESTION_BY_STATE: Partial<Record<SignalState, string>> = {
  one_time_observation: 'Has this come up again since they first mentioned it?',
  repeated_signal: "What tends to happen right before this shows up?",
  emerging_pattern: 'Is there a common thread across the times this has appeared?',
  established_pattern: "How is this affecting their day-to-day, and what have they already tried?",
  worsening: "What's changed recently that might be contributing to this?",
  improving: "What's been working — worth reinforcing or expanding on?",
  stable: 'Is "stable" here a good thing, or does it feel like a plateau worth addressing?',
  resolved: 'Does it feel resolved to them too, or just quieter for now?',
  stale: "It's been a while since we've heard about this — still relevant to bring up?",
  conflicting: 'What does their own day-to-day experience of this actually feel like?',
  insufficient_data: 'Would a specific check-in question help fill in the picture here?',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function SignalRow({ signal }: { signal: LongitudinalSignal }) {
  const question = COACHING_QUESTION_BY_STATE[signal.state];
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLE[signal.state]}`}>
          {STATE_LABEL[signal.state]}
        </span>
        <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs text-[#6B7A72]">
          {signal.occurrenceCount} occurrence{signal.occurrenceCount === 1 ? '' : 's'}
        </span>
        <span className="rounded-full bg-[#FAFAF8] px-2.5 py-1 text-xs text-[#6B7A72]">
          last observed {formatDate(signal.lastObservedAt)}
        </span>
      </div>
      <p className="mt-1.5 font-medium text-[#1B3A2D]">{signal.signalLabel}</p>
      {question && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-[#6B7A72]">
          <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {question}
        </p>
      )}
    </li>
  );
}

function RequestReassessmentForm({
  clientId,
  assignableAssessments,
}: {
  clientId: string;
  assignableAssessments: { key: AssessmentKey; displayName: string }[];
}) {
  const router = useRouter();
  const [assessmentKey, setAssessmentKey] = useState<AssessmentKey | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!assessmentKey) return;
    setError(null);
    startTransition(async () => {
      const result = await requestClientReassessment(clientId, assessmentKey, reason);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      setReason('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 border-t border-[#1B3A2D]/5 pt-4">
      <p className="text-sm font-semibold text-[#1B3A2D]">Request a Reassessment</p>
      <p className="mt-1 text-xs text-[#6B7A72]">
        Schedules it for this member the same way an automated trigger would — they&apos;ll see it as
        a normal suggested next step.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <select
          value={assessmentKey}
          onChange={(e) => setAssessmentKey(e.target.value as AssessmentKey)}
          className="rounded-xl border border-[#1B3A2D]/10 px-3 py-2 text-sm text-[#1B3A2D]"
        >
          <option value="">Choose an assessment…</option>
          {assignableAssessments.map((a) => (
            <option key={a.key} value={a.key}>
              {a.displayName}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why now? (optional)"
          className="flex-1 rounded-xl border border-[#1B3A2D]/10 px-3 py-2 text-sm text-[#1B3A2D]"
        />
        <button
          type="submit"
          disabled={!assessmentKey || isPending}
          className="rounded-xl bg-[#1B3A2D] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Requesting…' : 'Request'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {done && !error && <p className="mt-1.5 text-xs text-[#2F5D3A]">Requested.</p>}
    </form>
  );
}

export function LongitudinalIntelligencePanel({
  clientId,
  signals,
  routerOutcome,
  assignableAssessments,
}: {
  clientId: string;
  signals: LongitudinalSignal[];
  routerOutcome: RootRouterOutcomeView;
  assignableAssessments: { key: AssessmentKey; displayName: string }[];
}) {
  if (signals.length === 0) return null;

  const worthNoting = [...signals]
    .filter((s) => s.state !== 'insufficient_data')
    .sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt));

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#3E5C46]">
        <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Longitudinal Intelligence</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        How this member&apos;s signals have held up over time — emerging vs. established, improving vs.
        worsening, and what&apos;s gone stale or conflicting.
      </p>

      <div className="mt-4 rounded-2xl bg-[#EFF6F1] p-4">
        <p className="text-sm font-semibold text-[#1B3A2D]">Why the system recommended this next</p>
        <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{routerOutcome.memberMessage}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-[#6B7A72]">
          Outcome: {routerOutcome.outcome.replaceAll('_', ' ')}
        </p>
      </div>

      {worthNoting.length > 0 && (
        <ul className="mt-2 divide-y divide-[#1B3A2D]/5">
          {worthNoting.map((signal) => (
            <SignalRow key={signal.signalKey} signal={signal} />
          ))}
        </ul>
      )}

      <RequestReassessmentForm clientId={clientId} assignableAssessments={assignableAssessments} />
    </section>
  );
}
