'use client';

import { useEffect, useState, useTransition } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { CVS_CARD, CVS_DISPLAY_FONT } from './theme';
import { CvsDay3FollowUp, CvsDay7FollowUp } from './CvsFollowUpCards';
import { buildExperimentTheoryCopy, cvsDailyPromptCopy, cvsDay3ReflectionText } from '@/lib/core-values-snapshot/copy';
import type { CvsScoring } from '@/lib/core-values-snapshot/types';
import { logCvsExperimentDayAction, startCvsExperimentAction, type CvsExperimentStatus } from '@/app/actions/coreValuesSnapshot';
import type { ValueArea } from '@/lib/core-values-snapshot/constants';

type Props = {
  sessionId: string;
  topValue: ValueArea;
  scoring: CvsScoring | null;
  initialStatus: CvsExperimentStatus | null;
  onStatusChange?: (status: CvsExperimentStatus | null) => void;
};

/** Beat 5 — the offer/theory screen when no experiment is running yet, plus the daily/day-3/day-7 active states. Shared between the in-flow taker (right after finishing), the dashboard's own "start it later" offer, and the standalone /assessments/core-values-snapshot/experiment page (reached later via the "From Root" day-3/day-7 nudge). */
export function CvsExperimentPanel({ sessionId, topValue, scoring, initialStatus, onStatusChange }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Bubbles this panel's own status up to a parent that needs to know
  // (CoreValuesSnapshotTaker.tsx, so the closing screen's copy can
  // honestly reflect whether an experiment actually started) — its own
  // effect, not inside setStatus's updater, since calling a parent's
  // setState from inside a child's state updater triggers React's "Cannot
  // update a component while rendering a different component" warning
  // (a real bug caught the same way in Life Signal Check's own panel).
  useEffect(() => {
    onStatusChange?.(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!status) {
    if (!scoring) return null;
    const theory = buildExperimentTheoryCopy(scoring);
    return (
      <div className={`${CVS_CARD} mef-animate-in p-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">I have a theory. Help me test it.</p>
        <p className={`${CVS_DISPLAY_FONT} mt-3 text-xl leading-snug text-[#1B3A2D]`}>{theory.theory}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{theory.body}</p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await startCvsExperimentAction(sessionId, topValue);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setStatus({
                experiment: result.experiment,
                todayLocalDate: result.experiment.startDate,
                daysSinceStart: 0,
                isDay3Eligible: false,
                isDay7Eligible: false,
                logs: [],
                todayCompleted: null,
              });
            });
          }}
          className="mef-focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-4 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-50"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {theory.button}
        </button>
        <p className="mt-3 text-center text-xs leading-relaxed text-[#6B7A72]">{theory.followUpNote}</p>
      </div>
    );
  }

  const topLabelText = status.experiment.title;
  const day3Log = status.logs.find((l) => l.day3Response !== null) ?? null;

  function logDay(completed: boolean) {
    if (!status) return;
    setError(null);
    startTransition(async () => {
      const result = await logCvsExperimentDayAction(status.experiment.id, completed);
      if (!result.ok) {
        setError(result.error ?? 'Could not save that.');
        return;
      }
      setStatus((prev) => (prev ? { ...prev, todayCompleted: completed } : prev));
    });
  }

  return (
    <div className="space-y-4">
      <div className={`${CVS_CARD} mef-animate-in p-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Day {Math.min(status.daysSinceStart + 1, status.experiment.durationDays)} of {status.experiment.durationDays}
        </p>
        <p className={`${CVS_DISPLAY_FONT} mt-2 text-xl text-[#1B3A2D]`}>{cvsDailyPromptCopy(topLabelText)}</p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {status.todayCompleted !== null ? (
          <div className="mt-5 flex items-center gap-2 text-sm font-medium text-[#4F7A63]">
            <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            {status.todayCompleted ? 'Logged: today counted.' : 'Logged: not today, and that’s fine.'}
          </div>
        ) : (
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => logDay(true)}
              className="mef-focus-ring flex-1 rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
            >
              Yes
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => logDay(false)}
              className="mef-focus-ring flex-1 rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] disabled:opacity-50"
            >
              Not today
            </button>
          </div>
        )}
      </div>

      {status.isDay3Eligible && (
        day3Log ? (
          <div className={`${CVS_CARD} mef-animate-in p-7`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">
              {cvsDay3ReflectionText(day3Log.day3Response!)}
            </p>
          </div>
        ) : (
          <CvsDay3FollowUp experimentId={status.experiment.id} topLabelText={topLabelText} />
        )
      )}

      {status.isDay7Eligible && !status.experiment.day7AcknowledgedAt && (
        <CvsDay7FollowUp
          experimentId={status.experiment.id}
          topLabelText={topLabelText}
          logs={status.logs}
          durationDays={status.experiment.durationDays}
        />
      )}
    </div>
  );
}
