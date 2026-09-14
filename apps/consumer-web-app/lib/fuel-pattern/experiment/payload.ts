/**
 * The shape of the experiment payload, and the pure functions that read
 * it.
 *
 * =====================================================================
 * WHY THIS IS SPLIT FROM memberPayload.ts.
 * =====================================================================
 *
 * The same split Build 3 made, for the same reason and after the same
 * build failure: her experiment section is a client component, so it
 * imports these types and these functions. memberPayload.ts BUILDS the
 * payload, which means it reaches the Supabase client and the data layer.
 * A client component importing from there drags all of that into the
 * browser bundle. A type import would have been erased; a function is a
 * value and values are not. See lib/fuel-pattern/meals/payload.ts.
 *
 * =====================================================================
 * EVERYTHING HER SCREEN NEEDS CAME DOWN WITH THE PAGE.
 * =====================================================================
 *
 * Including her checks, so that logging one can recompute the standing
 * insight in her browser with the SERVER'S OWN ENGINE rather than asking
 * for it. That is what lets the result page hold: a tap writes a row over
 * a route handler and nothing re-renders the route underneath her.
 *
 * `todayLocalDate` is her calendar day, resolved on the server from her
 * own timezone and handed down as a prop, never decided while rendering.
 */

import { fpaExperimentDayNumber, fpaExperimentStatus } from './days';
import { fpaStandingInsight, type FpaInsight } from './insights';
import type { FpaExperimentCheck, FpaExperimentStatus } from './types';
import type { FuelPattern } from '../types';

/** One meal she can tag a check with in one tap, because she is looking at it. */
export type FpaTaggableMeal = {
  id: string;
  name: string;
  type: string;
};

/** One run of the experiment, as every member surface reads it. */
export type FpaExperimentRun = {
  id: string;
  pattern: FuelPattern;
  startedOn: string;
  /** Counting the start day as day 1. Can exceed seven, which is how completion is known. */
  dayNumber: number;
  status: FpaExperimentStatus;
  /** True once she has pressed DONE on the completion screen. */
  acknowledged: boolean;
  /** Her checks, oldest first, which is the order the insight engine replays them in. */
  checks: FpaExperimentCheck[];
};

export type FpaExperimentPayload = {
  /** Her calendar day, from the server. Nothing on a screen computes this. */
  todayLocalDate: string;
  /** Her one live run, or null when she has never started one or archived the last. */
  run: FpaExperimentRun | null;
  /** Meals she is looking at right now, offered as a one tap tag on the sheet. */
  taggableMeals: FpaTaggableMeal[];
};

/** The run's own standing insight. One function, called by both screens and by the coach. */
export function fpaRunInsight(run: FpaExperimentRun | null): FpaInsight | null {
  return run ? fpaStandingInsight(run.checks) : null;
}

/**
 * A run rebuilt around a newly logged check, without a round trip.
 *
 * Her browser appends the row it just wrote and everything downstream
 * (the count, the standing insight) is recomputed from the same pure
 * functions the server uses, so a screen that has not reloaded cannot
 * disagree with one that has.
 */
export function fpaRunWithCheck(
  run: FpaExperimentRun,
  check: FpaExperimentCheck
): FpaExperimentRun {
  return { ...run, checks: [...run.checks, check] };
}

/** Where a run stands, recomputed from a day that came from the server. */
export function fpaRunStatus(run: FpaExperimentRun, todayLocalDate: string): FpaExperimentStatus {
  if (run.status === 'archived') return 'archived';
  return fpaExperimentStatus(run.startedOn, todayLocalDate, null);
}

export { fpaExperimentDayNumber };
