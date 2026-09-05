/**
 * WHAT THE ARC MAKES OF HER SEVEN DAY EXPERIMENT, IN ONE PLACE.
 *
 * WHY THIS FILE EXISTS. "She declined an experiment" is a rule with two
 * halves and a failure direction, and it was written inline in
 * ./engine.ts's fact gathering. Day 6's recap needs the same answer (a
 * declined experiment is never mentioned on the recap, which is a rule of
 * this build), and a second reading of the same rows would be a second
 * definition of the word declined. One source of truth per number: the
 * engine and the recap now both read this.
 *
 * NOTHING HERE READS. It is a pure function over rows the caller already
 * has, so the whole rule is testable with no database anywhere near it.
 *
 * A DECLINE, IN THE TWO SHAPES THE APP ACTUALLY RECORDS ONE. She was shown
 * the seven day offer and left without starting it (a dismissal row on an
 * offer key with no experiment started from that same session), or she
 * started one and explicitly stopped it (status 'abandoned'). Nothing else
 * counts.
 *
 * A FAILED READ COUNTS AS A DECLINE, NOT AS PERMISSION. `offersReadable`
 * is false when the dismissal read failed, and that resolves to declined,
 * because the wrong direction here is re-pitching to somebody who already
 * said no.
 */

import { deriveEffectiveStatus, type LifestyleExperiment } from '../lifestyle-experiments';

/** The columns of a lifestyle experiment this rule actually reads. */
export type TrialArcExperimentRow = Pick<
  LifestyleExperiment,
  'status' | 'startDate' | 'durationDays' | 'sourceSessionId'
>;

export interface TrialArcExperimentInput {
  experiments: readonly TrialArcExperimentRow[];
  /** The session ids of every experiment offer she has already been shown. */
  offerSessionIds: ReadonlySet<string>;
  /** False when that read failed. Fails towards "declined". */
  offersReadable: boolean;
  /** The instant the question is asked at. Passed in, never read from the clock here. */
  now: Date;
}

export interface TrialArcExperimentFacts {
  /** An experiment exists that she started, whatever its status today. */
  started: boolean;
  /** One is running right now. */
  active: boolean;
  /** She has said no, in one of the two ways the app records one. */
  declined: boolean;
  /** The newest start_date, already a plain calendar date chosen on the day she started it. */
  startedLocalDate: string | null;
  /** The newest experiment's own declared length, or null when there is none. */
  durationDays: number | null;
}

export function deriveTrialArcExperimentFacts(
  input: TrialArcExperimentInput
): TrialArcExperimentFacts {
  const { experiments, offerSessionIds, offersReadable, now } = input;

  // Newest last, by the calendar date she chose when she started it.
  const byStart = [...experiments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const newest = byStart[byStart.length - 1] ?? null;

  const active = experiments.some((experiment) => deriveEffectiveStatus(experiment, now) === 'active');

  const startedSessionIds = new Set(
    experiments
      .map((experiment) => experiment.sourceSessionId)
      .filter((id): id is string => id !== null)
  );
  const declinedAnOffer = [...offerSessionIds].some((id) => !startedSessionIds.has(id));

  return {
    started: newest !== null,
    active,
    declined:
      !offersReadable || declinedAnOffer || experiments.some((e) => e.status === 'abandoned'),
    startedLocalDate: newest?.startDate ?? null,
    durationDays: newest?.durationDays ?? null,
  };
}
