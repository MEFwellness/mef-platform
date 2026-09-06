/**
 * How a Lifestyle Experiment's outcome and status are named, wherever they
 * are read.
 *
 * Moved out of components/recommendations/RecommendationsClient.tsx on
 * 2026-09-05, when the coach's This Week band needed the identical answer.
 * One name per thing: the member reading "It partially worked" on her own
 * recommendations screen and her coach reading the same experiment on the
 * band must not be shown two different words for one stored value.
 *
 * A plain module rather than a const inside a client component, so a
 * server surface can import the labels without pulling a client boundary
 * in with them.
 */

import type { LifestyleExperimentOutcome, LifestyleExperimentStatus } from './types';

export const EXPERIMENT_OUTCOME_LABEL: Record<LifestyleExperimentOutcome, string> = {
  worked: 'It worked',
  partially_worked: 'It partially worked',
  didnt_work: "It didn't work",
  inconclusive: 'Inconclusive',
};

export const EXPERIMENT_STATUS_LABEL: Record<LifestyleExperimentStatus, string> = {
  active: 'In progress',
  completed: 'Completed',
  abandoned: 'Stopped early',
  expired_no_reflection: 'Tracking period ended, add a reflection',
};
