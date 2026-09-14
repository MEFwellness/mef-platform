'use client';

/**
 * The one piece of state the 7 Day Fuel Experiment has on a screen, and
 * the four things she can do to it.
 *
 * =====================================================================
 * IT CANNOT BOUNCE THE PAGE IT SITS ON.
 * =====================================================================
 *
 * The result page holds a reveal that survives only because nothing on
 * it can re-render its own route. So every one of the four actions below
 * is a POST to app/api/fuel-pattern/experiment/route.ts, which answers
 * with a few bytes of JSON. There is no Server Action here, no
 * router.refresh, and no revalidation of any kind.
 *
 * =====================================================================
 * THE COUNT AND THE INSIGHT ARE RECOMPUTED, NEVER FETCHED.
 * =====================================================================
 *
 * A logged check is folded into the list that came down with the page,
 * and the standing insight is recomputed from it by the SERVER'S OWN
 * ENGINE (lib/fuel-pattern/experiment/insights.ts), so a screen that has
 * not reloaded cannot disagree with one that has. That is the same
 * decision Build 3 made with the meal picker, for the same reason.
 *
 * A CHECK IS COUNTED ONLY ONCE IT EXISTS. The round trip is awaited and
 * the row the server wrote is what joins the list, rather than an
 * optimistic copy that a failed write would leave standing as a lie. She
 * never waits on it: the sheet is showing its own confirmation line for
 * longer than the request takes.
 *
 * NOTHING RUNS ON MOUNT. There is no effect in this file. A member who
 * opens the page and touches nothing leaves no row behind.
 */

import { useCallback, useMemo, useState } from 'react';
import { fpaExperimentDayNumber } from '@/lib/fuel-pattern/experiment/days';
import { fpaRunInsight, fpaRunStatus, fpaRunWithCheck } from '@/lib/fuel-pattern/experiment/payload';
import type {
  FpaExperimentPayload,
  FpaExperimentRun,
} from '@/lib/fuel-pattern/experiment/payload';
import type { FpaExperimentCheck, FpaExperimentStatus } from '@/lib/fuel-pattern/experiment/types';
import type { FpaInsight } from '@/lib/fuel-pattern/experiment/insights';
import type { FpaQuickCheckAnswer } from './QuickCheckSheet';

const ENDPOINT = '/api/fuel-pattern/experiment';

/** Said once, quietly, when a tap did not land. Never a modal, never a red banner. */
export const FPA_EXPERIMENT_RETRY_LINE = 'That did not save. Tap it again in a moment.';

type StartResponse = {
  ok?: boolean;
  run?: { id?: string; pattern?: string; startedOn?: string };
};

export type FuelExperimentState = {
  run: FpaExperimentRun | null;
  /** Where the run stands today, recomputed from the day the server handed down. */
  status: FpaExperimentStatus | null;
  dayNumber: number;
  checkCount: number;
  insight: FpaInsight | null;
  busy: boolean;
  error: string | null;
  start: () => void;
  restart: () => void;
  acknowledge: () => void;
  logCheck: (answer: FpaQuickCheckAnswer) => void;
};

export function useFuelExperiment(payload: FpaExperimentPayload): FuelExperimentState {
  const [run, setRun] = useState<FpaExperimentRun | null>(payload.run);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = payload.todayLocalDate;

  const status = run ? fpaRunStatus(run, today) : null;
  const dayNumber = run ? fpaExperimentDayNumber(run.startedOn, today) : 0;
  const checkCount = run?.checks.length ?? 0;
  const insight = useMemo(() => fpaRunInsight(run), [run]);

  const begin = useCallback(
    async (action: 'start' | 'restart') => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const json = (await response.json()) as StartResponse;
        if (!response.ok || !json.ok || !json.run?.id || !json.run.startedOn) {
          setError(FPA_EXPERIMENT_RETRY_LINE);
          return;
        }
        setRun({
          id: json.run.id,
          pattern: (json.run.pattern ?? payload.run?.pattern ?? 'balanced_fuel') as
            FpaExperimentRun['pattern'],
          startedOn: json.run.startedOn,
          dayNumber: fpaExperimentDayNumber(json.run.startedOn, today),
          status: 'active',
          acknowledged: false,
          // A fresh run starts with nothing in it, and a restarted one
          // starts with nothing in it either: the previous run keeps its
          // own checks, archived, where the coach can still read them.
          checks: [],
        });
      } catch {
        setError(FPA_EXPERIMENT_RETRY_LINE);
      } finally {
        setBusy(false);
      }
    },
    [payload.run?.pattern, today]
  );

  const start = useCallback(() => void begin('start'), [begin]);
  const restart = useCallback(() => void begin('restart'), [begin]);

  const acknowledge = useCallback(() => {
    if (!run) return;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'acknowledge' }),
        });
        const json = (await response.json()) as { ok?: boolean };
        if (!response.ok || !json.ok) {
          setError(FPA_EXPERIMENT_RETRY_LINE);
          return;
        }
        setRun((current) => (current ? { ...current, acknowledged: true } : current));
      } catch {
        setError(FPA_EXPERIMENT_RETRY_LINE);
      } finally {
        setBusy(false);
      }
    })();
  }, [run]);

  const logCheck = useCallback(
    (answer: FpaQuickCheckAnswer) => {
      if (!run) return;
      setError(null);
      void (async () => {
        try {
          const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'check', ...answer }),
          });
          const json = (await response.json()) as { ok?: boolean; check?: FpaExperimentCheck };
          if (!response.ok || !json.ok || !json.check) {
            setError(FPA_EXPERIMENT_RETRY_LINE);
            return;
          }
          const stored = json.check;
          setRun((current) => (current ? fpaRunWithCheck(current, stored) : current));
        } catch {
          setError(FPA_EXPERIMENT_RETRY_LINE);
        }
      })();
    },
    [run]
  );

  return {
    run,
    status,
    dayNumber,
    checkCount,
    insight,
    busy,
    error,
    start,
    restart,
    acknowledge,
    logCheck,
  };
}
