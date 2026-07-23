/**
 * Lifestyle Experiments — read-time overdue derivation. No cron: an
 * 'active' experiment past its own start_date + duration_days with no
 * reflection is presented as 'expired_no_reflection' at read time only,
 * the stored status column is never rewritten by this function — same
 * "recompute on read, never a background job" discipline as
 * lib/recommendation-engine/lifecycle.ts and Root Score/Root Map.
 */

import type { LifestyleExperiment, LifestyleExperimentStatus } from './types';

export function isExperimentOverdue(
  experiment: Pick<LifestyleExperiment, 'status' | 'startDate' | 'durationDays'>,
  asOfDate: Date
): boolean {
  if (experiment.status !== 'active') return false;
  const start = new Date(experiment.startDate);
  const dueBy = new Date(start.getTime() + experiment.durationDays * 24 * 60 * 60 * 1000);
  return asOfDate > dueBy;
}

export function deriveEffectiveStatus(
  experiment: Pick<LifestyleExperiment, 'status' | 'startDate' | 'durationDays'>,
  asOfDate: Date
): LifestyleExperimentStatus {
  return isExperimentOverdue(experiment, asOfDate) ? 'expired_no_reflection' : experiment.status;
}
