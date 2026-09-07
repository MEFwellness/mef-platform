'use client';

/**
 * The dashboard card for What You Put Down's seven day experiment.
 *
 * THE QUESTION IS THE ONE SHE AGREED TO, word for word. A member on day 4
 * should not have to remember what she signed up for, and a card that
 * paraphrased it would quietly become a second version of the experiment.
 *
 * BOTH ANSWERS ARE REAL ANSWERS HERE. "Not today" means she did not touch
 * it, which is worth noticing rather than worth hiding, so neither button
 * is the failure button and the logged line says so.
 *
 * ONE ROW PER CALENDAR DAY, on cvs_experiment_daily_logs (migration 134),
 * the same table every other daily experiment in this app logs into. No new
 * table and no new column.
 *
 * NO DAY 3 OR DAY 7 FOLLOW-UP, deliberately. This experiment closes itself
 * at seven days by the existing read-time expiry rule, and inventing a
 * reflection prompt nobody asked for would be a second thing to answer.
 */

import { useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { WYPD_EXPERIMENT_DAILY_QUESTION } from '@/lib/what-you-put-down/experiment';
import {
  logWhatYouPutDownDayAction,
  type WypdExperimentStatus,
} from '@/app/actions/whatYouPutDown';

export function WhatYouPutDownExperimentPanel({ status }: { status: WypdExperimentStatus }) {
  const [todayCompleted, setTodayCompleted] = useState<boolean | null>(status.todayCompleted);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const day = Math.min(status.daysSinceStart + 1, status.experiment.durationDays);

  function logDay(completed: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await logWhatYouPutDownDayAction(status.experiment.id, completed);
      if (!result.ok) {
        setError(result.error ?? 'Could not save that.');
        return;
      }
      setTodayCompleted(completed);
    });
  }

  return (
    <div className={`${CVS_CARD} mef-animate-in p-7`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
        {`Day ${day} of ${status.experiment.durationDays}`}
      </p>
      <p className={`${CVS_DISPLAY_FONT} mt-2 text-xl leading-snug text-[#1B3A2D]`}>
        {WYPD_EXPERIMENT_DAILY_QUESTION}
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {todayCompleted !== null ? (
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-[#4F7A63]">
          <CheckCircle2 className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          {todayCompleted ? 'Logged: you touched it.' : 'Logged: not today.'}
        </div>
      ) : (
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => logDay(true)}
            className="mef-focus-ring mef-press flex-1 rounded-2xl bg-[#1B3A2D] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#163025] disabled:opacity-50"
          >
            Yes
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => logDay(false)}
            className="mef-focus-ring mef-press flex-1 rounded-2xl border border-[#1B3A2D]/15 px-5 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] disabled:opacity-50"
          >
            Not today
          </button>
        </div>
      )}
    </div>
  );
}
