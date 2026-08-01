'use client';

import { useEffect, useState, useTransition } from 'react';
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
import { getMyLifestyleExperiments, reflectAndCloseMyExperiment, abandonMyExperiment } from '@/app/actions/lifestyleExperiments';
import { MAX_ACTIVE_EXPERIMENTS, type LifestyleExperiment } from '@/lib/lifestyle-experiments';
import type { Signal } from '@/lib/life-signal-check/constants';

type Props = {
  sessionId: string;
  chosenSignal: Signal;
  scoring: LscScoring | null;
  initialStatus: LscExperimentStatus | null;
  onStatusChange?: (status: LscExperimentStatus | null) => void;
};

/** One already-active experiment (any source: Recommendation Engine, Core Values Snapshot, or this same Life Signal Check) shown on the cap-blocked offer screen, with a real, immediate way to close it out without leaving the page — reuses the exact same server actions the standalone /recommendations page's own close flow uses (app/actions/lifestyleExperiments.ts), not a second close mechanism. */
function ActiveExperimentCloseRow({ experiment, onClosed }: { experiment: LifestyleExperiment; onClosed: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function closeWithReflection() {
    if (!text.trim()) {
      setError('Add a short reflection before closing this out.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reflectAndCloseMyExperiment(experiment.id, text, 'inconclusive');
      if (result.error) {
        setError(result.error);
        return;
      }
      onClosed();
    });
  }

  function stopEarly() {
    setError(null);
    startTransition(async () => {
      const result = await abandonMyExperiment(experiment.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClosed();
    });
  }

  return (
    <div className="rounded-2xl border border-[#1B3A2D]/10 bg-[#FAFAF8] p-4">
      <p className="text-sm font-medium text-[#1B3A2D]">{experiment.title}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">{experiment.protocol}</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {!open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setOpen(true)}
            className="mef-focus-ring rounded-full bg-[#1B3A2D] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
          >
            Close this out
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={stopEarly}
            className="mef-focus-ring rounded-full px-3 py-2 text-xs font-medium text-[#1B3A2D]/70 transition hover:bg-[#1B3A2D]/[0.06] disabled:opacity-50"
          >
            {isPending ? 'Working…' : 'Stop early'}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="How did it go?"
            rows={2}
            className="w-full resize-none rounded-2xl border border-[#1B3A2D]/10 bg-white p-2.5 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={closeWithReflection}
            className="mef-focus-ring mt-2 rounded-full bg-[#1B3A2D] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
          >
            {isPending && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" />}
            Save and close
          </button>
        </div>
      )}
    </div>
  );
}

/** The offer/theory screen when no experiment is running yet, plus the daily/day-3/day-7 active states — exact mirror of Core Values Snapshot's own CvsExperimentPanel, reusing the same CvsFollowUpCards components with Life Signal Check's own server actions. Shared between the in-flow taker, the dashboard's own "start it later" offer, and the standalone /assessments/life-signal-check/experiment page. */
export function LscExperimentPanel({ sessionId, chosenSignal, scoring, initialStatus, onStatusChange }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [activeExperiments, setActiveExperiments] = useState<LifestyleExperiment[] | null>(null);

  // Bubbles this panel's own status up to a parent that needs to know
  // (LifeSignalCheckTaker.tsx, so the closing screen's copy can honestly
  // reflect whether an experiment actually started) — done as its own
  // effect, not inside setStatus's updater function, since calling a
  // parent's setState from inside a child's state updater triggers React's
  // "Cannot update a component while rendering a different component"
  // warning (the updater can run during React's render phase).
  useEffect(() => {
    onStatusChange?.(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Only relevant on the offer screen (no Life Signal Check experiment yet)
  // — this is where a member can be blocked by the two-active-experiment
  // cap, regardless of which experience(s) those other experiments came
  // from.
  useEffect(() => {
    if (status) return;
    let cancelled = false;
    (async () => {
      const experiments = await getMyLifestyleExperiments();
      if (!cancelled) setActiveExperiments(experiments.filter((e) => e.status === 'active'));
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (!status) {
    if (!scoring) return null;
    const theory = buildLscExperimentTheoryCopy(scoring);
    const atCap = (activeExperiments?.length ?? 0) >= MAX_ACTIVE_EXPERIMENTS;

    return (
      <div className={`${CVS_CARD} mef-animate-in p-7`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{LSC_EXPERIMENT_INTRO}</p>
        <p className={`${CVS_DISPLAY_FONT} mt-3 text-xl leading-snug text-[#1B3A2D]`}>{theory.theory}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{theory.body}</p>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          disabled={isPending || atCap}
          aria-disabled={atCap}
          title={atCap ? `You're already working on ${MAX_ACTIVE_EXPERIMENTS} experiments. Close one out below to start this one.` : undefined}
          onClick={() => {
            if (atCap) return;
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
          className={`mef-focus-ring mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition ${
            atCap
              ? 'cursor-not-allowed bg-[#1B3A2D]/35 text-white/80 shadow-none'
              : 'bg-[#1B3A2D] text-white hover:bg-[#163025] disabled:opacity-50'
          }`}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {theory.button}
        </button>
        <p className="mt-3 text-center text-xs leading-relaxed text-[#6B7A72]">{theory.followUpNote}</p>

        {atCap && activeExperiments && (
          <div className="mt-5 space-y-3 border-t border-[#1B3A2D]/10 pt-5">
            <p className="text-sm font-medium text-[#1B3A2D]">
              You&apos;re already working on {activeExperiments.length} experiments. Close one out to start this one, right here.
            </p>
            {activeExperiments.map((experiment) => (
              <ActiveExperimentCloseRow
                key={experiment.id}
                experiment={experiment}
                onClosed={() => setActiveExperiments((prev) => (prev ? prev.filter((e) => e.id !== experiment.id) : prev))}
              />
            ))}
          </div>
        )}
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
