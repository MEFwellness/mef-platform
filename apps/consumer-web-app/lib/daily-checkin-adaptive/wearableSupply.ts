/**
 * Daily check-in adaptive picker — "a connected wearable already supplies
 * this answer" check (requirement 6). None of today's seeded rotating
 * probes have a wearable_metric_code set (no direct wearable equivalent
 * exists yet for night-waking count, night sweats, bowel status,
 * digestion rating, or the coarse movement-today bucket — see migration
 * 106's own seed comment), so this is a real, exercised mechanism with no
 * live row triggering it today; it activates the moment a future probe
 * sets wearableMetricCode.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listWearableConnections, listWearableMetricsForDate } from '../wearables/data';
import type { DriverProbeQuestion } from './types';

export async function wearableSuppliedQuestionKeys(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  questions: readonly DriverProbeQuestion[]
): Promise<Set<string>> {
  const withWearableCode = questions.filter((q) => q.wearableMetricCode !== null);
  if (withWearableCode.length === 0) return new Set();

  const connections = await listWearableConnections(supabase, memberId);
  const hasConnectedWearable = connections.some((c) => c.status === 'connected');
  if (!hasConnectedWearable) return new Set();

  const todaysMetrics = await listWearableMetricsForDate(supabase, memberId, localDate);
  const metricCodesPresent = new Set<string>(todaysMetrics.map((m) => m.metric_code));

  return new Set(
    withWearableCode
      .filter((q) => metricCodesPresent.has(q.wearableMetricCode as string))
      .map((q) => q.questionKey)
  );
}
