'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { CvsDay3FollowUp, CvsDay7FollowUp } from '@/components/core-values-snapshot/CvsFollowUpCards';
import { buildLscExperimentTheoryCopy, lscDailyPromptCopy, lscDay3ReflectionText, LSC_EXPERIMENT_INTRO } from '@/lib/life-signal-check/copy';
import type { LscScoring } from '@/lib/life-signal-check/types';
import {
  logLscExperimentDayAction,
  startLscExperimentAction,
  submitLscDay3ResponseAction,
  acknowledgeLscDay7Action,
  type LscExperimentStatus,
} from '@/app/actions/lifeSignalCheck';
import type { Signal } from '@/lib/life-signal-check/constants';

type Props = {
  sessionId: string;
  chosenSignal: Signal;
  scoring: LscScoring | null;
  initialStatus: LscExperimentStatus | null;
};

/** The offer/theory screen when no experiment is running yet, plus the daily/day-3/day-7 active states — exact mirror of Core Values Snapshot's own CvsExperimentPanel, reusing the same CvsFollowUpCards components with Life Signal Check's own server actions. Shared between the in-flow taker and the standalone /assessments/life-signal-check/experiment page. */
export function LscExperimentPanel({ sessionId, chosenSignal, scoring, initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!status) {
    if (!scoring) return null;
    const theory = buildLscExperimentTheoryCopy(scoring);
    return (
      <div className={`${CVS_CARD} mef-animate-in p-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{LSC_EXPERIMENT_INTRO}</p>
        <p className={`${CVS_DISPLAY_FONT} mt-3 text-xl leading-snug text-[#1B3A2D]`}>{theory.theory}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{theory.body}</p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await startLscExperimentAction(sessionId, chosenSignal);
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

  const signalLabelText = status.experiment.title;
  const day3Log = status.logs.find((l) => l.day3Response !== null) ?? null;

  function logDay(completed: boolean) {
    if (!status) return;
    setError(null);
    startTransition(async () => {
      const result = await logLscExperimentDayAction(status.experiment.id, completed);
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
        <p className={`${CVS_DISPLAY_FONT} mt-2 text-xl text-[#1B3A2D]`}>{lscDailyPromptCopy(signalLabelText)}</p>

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

      {status.isDay3Eligible &&
        (day3Log ? (
          <div className={`${CVS_CARD} mef-animate-in p-7`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">From Root</p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{lscDay3ReflectionText(day3Log.day3Response!)}</p>
          </div>
        ) : (
          <CvsDay3FollowUp
            experimentId={status.experiment.id}
            topLabelText={signalLabelText}
            experience="life-signal-check"
            onSubmit={submitLscDay3ResponseAction}
          />
        ))}

      {status.isDay7Eligible && !status.experiment.day7AcknowledgedAt && (
        <CvsDay7FollowUp
          experimentId={status.experiment.id}
          topLabelText={signalLabelText}
          logs={status.logs}
          durationDays={status.experiment.durationDays}
          experience="life-signal-check"
          onAcknowledge={acknowledgeLscDay7Action}
        />
      )}
    </div>
  );
}
