/**
 * Which Daily Wellness Index metric a published signal is about.
 *
 * ONE FUNCTION, AND IT LIVES HERE BECAUSE TWO FEATURES READ IT. The Weekly
 * Reflection's recap has used it since 2026-08-28 to decide which
 * member_pattern_states rows it may read back and what to call them; the
 * trial arc's day 6 recap now needs the identical answer. It was moved out
 * of lib/weekly-reflection/recap.ts rather than copied, so "a check-in
 * metric signal" cannot come to mean two different things on two screens.
 * That module still exports it, unchanged, for every existing caller.
 *
 * PURE, AND DELIBERATELY IMPORTING NOTHING THAT READS. The day 6 recap's
 * whole read path has to render from a stored plan without touching a
 * database client, an entitlement or an assessment gate, and it renders
 * through this. `lib/weekly-reflection/recap.ts` reaches a data module
 * transitively through its own week arithmetic, which is fine for the
 * Friday sit-down and is exactly what the recap's read path may not do.
 */

import { WELLNESS_METRIC_LABEL, type WellnessMetricKey } from '../wellness/wellness-index';

const PREFIX = 'checkin_metric::';

/** The metric a check-in signal is about, or null for a signal that is not one. */
export function metricKeyFromSignalKey(signalKey: string): WellnessMetricKey | null {
  if (!signalKey.startsWith(PREFIX)) return null;
  const metric = signalKey.slice(PREFIX.length);
  return metric in WELLNESS_METRIC_LABEL ? (metric as WellnessMetricKey) : null;
}
