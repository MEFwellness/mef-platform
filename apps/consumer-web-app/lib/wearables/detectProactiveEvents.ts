/**
 * Turns a member's real wearable metric history into the specific
 * proactive AiEvents this milestone defines — the one place that decides
 * "does today's synced data warrant the coach reaching out," called by
 * both the manual sync action and the daily cron job so the two never
 * diverge. Every threshold here is exactly what lib/wearables/trends.ts's
 * pure classifiers already decided; this module only turns that
 * classification into an event + a small, real payload, never a second
 * detection pass.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiEventType } from '@mef/shared-types-contracts';
import { listWearableMetricHistory } from './data';
import {
  classifyTrend,
  detectHrvTrend,
  detectSleepTrend,
  detectActivityTrend,
  detectRecoveryLevel,
} from './trends';

export type ProactiveWearableEvent = {
  eventType: AiEventType;
  payload: Record<string, unknown>;
};

const HISTORY_LIMIT = 3;

export async function detectProactiveWearableEvents(
  supabase: SupabaseClient,
  memberId: string
): Promise<ProactiveWearableEvent[]> {
  const [hrvHistory, sleepHistory, stepsHistory, stressHistory, readinessHistory] =
    await Promise.all([
      listWearableMetricHistory(supabase, memberId, 'hrv_ms', { limit: HISTORY_LIMIT }),
      listWearableMetricHistory(supabase, memberId, 'sleep_duration_minutes', {
        limit: HISTORY_LIMIT,
      }),
      listWearableMetricHistory(supabase, memberId, 'steps', { limit: HISTORY_LIMIT }),
      listWearableMetricHistory(supabase, memberId, 'stress_score', { limit: HISTORY_LIMIT }),
      listWearableMetricHistory(supabase, memberId, 'readiness_score', { limit: 1 }),
    ]);

  const events: ProactiveWearableEvent[] = [];

  if (detectHrvTrend(hrvHistory) === 'declining') {
    events.push({
      eventType: 'hrv_declining',
      payload: {
        values: hrvHistory.map((m) => m.numeric_value),
        unit: hrvHistory.at(-1)?.unit ?? 'ms',
      },
    });
  }

  if (detectSleepTrend(sleepHistory) === 'declining') {
    events.push({
      eventType: 'sleep_declined',
      payload: { source: 'wearable', values: sleepHistory.map((m) => m.numeric_value) },
    });
  }

  if (detectActivityTrend(stepsHistory) === 'declining') {
    events.push({
      eventType: 'activity_declined',
      payload: { values: stepsHistory.map((m) => m.numeric_value) },
    });
  }

  // stress_score is "higher = more stressed," so a rising trend is the
  // concerning direction and a falling trend is the encouraging one —
  // opposite of every other metric above, called out explicitly here
  // rather than left implicit.
  const stressTrend = classifyTrend(stressHistory);
  if (stressTrend === 'improving') {
    events.push({
      eventType: 'stress_increased',
      payload: { source: 'wearable', values: stressHistory.map((m) => m.numeric_value) },
    });
  } else if (stressTrend === 'declining') {
    events.push({
      eventType: 'stress_decreased',
      payload: { source: 'wearable', values: stressHistory.map((m) => m.numeric_value) },
    });
  }

  const latestReadiness = readinessHistory.at(-1)?.numeric_value ?? null;
  if (detectRecoveryLevel(latestReadiness) === 'excellent') {
    events.push({
      eventType: 'recovery_excellent',
      payload: { readinessScore: latestReadiness },
    });
  }

  return events;
}
