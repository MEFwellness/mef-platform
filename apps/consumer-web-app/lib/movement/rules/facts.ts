/**
 * Turns real member data into the named "facts" the Movement Intelligence
 * decision engine (engine.ts) composes a session from. Same discipline as
 * lib/ai/rules/facts.ts: every fact traces back to an actual row —
 * check-ins, Universal Registry entries (posture/movement/breathing
 * findings and wearable metrics all already flow through this one read
 * path, see lib/registry/data.ts), and this member's own movement-session
 * history. Nothing here is invented; a signal with no real data behind it
 * is null, never guessed at.
 *
 * `equipmentAvailable` and `goals` are included now, deliberately null,
 * because the decision engine's shape already anticipates them — there is
 * no equipment-preference or goal-capture UI yet. When one ships, this is
 * the only file that needs to start populating them; nothing in engine.ts
 * needs to change to start honoring real values instead of the
 * conservative defaults it currently falls back to.
 */

import type { DailyCheckin, RegistryDomain, RegistryEntry } from '@mef/shared-types-contracts';
import type { MovementEquipment, MovementSession } from '@mef/shared-types-contracts';
import { detectInsights, type WellnessInsight } from '../../wellness/insights';
import { buildWearableSnapshot, type WearableDailySnapshot } from '../../wearables/snapshot';
import { daysBetweenLocalDates } from '../dates';

export type TrendDirection = 'improving' | 'declining' | 'stable' | null;

export type MovementActiveFinding = {
  code: string;
  label: string;
  domain: RegistryDomain;
  severity: string | null;
};

export type MovementFacts = {
  painLevel: number | null;
  painTrend: TrendDirection;
  stressLevel: number | null;
  stressTrend: TrendDirection;
  sleepQuality: number | null;
  sleepDuration: DailyCheckin['sleep_duration'];
  sleepTrend: TrendDirection;
  energyLevel: number | null;
  energyTrend: TrendDirection;
  selfReportedMovementToday: DailyCheckin['movement_today'] | null;
  /** Active posture/movement/breathing findings from the Universal Registry — the Guided Posture & Movement Assessment's real output once coach-confirmed. */
  activeFindings: MovementActiveFinding[];
  wearableSnapshot: WearableDailySnapshot | null;
  daysSinceLastSession: number | null;
  sessionsCompletedLast7Days: number;
  sessionsCompletedLast30Days: number;
  /** Exercise ids the member's most recent session included — used to rotate variety rather than repeat the same picks two sessions running. */
  lastSessionExerciseIds: string[];
  /** Always null today — no equipment-preference capture exists yet. The engine treats null as "assume bodyweight only." */
  equipmentAvailable: MovementEquipment[] | null;
  /** Always null today — no goal-capture UI exists yet. */
  goals: string[] | null;
};

function trendFor(
  insights: WellnessInsight[],
  key: WellnessInsight['key'],
  hasAnyData: boolean
): TrendDirection {
  if (!hasAnyData) return null;
  const match = insights.find((i) => i.key === key);
  return match ? match.direction : 'stable';
}

export function buildMovementFacts(params: {
  checkinsOldestFirst: DailyCheckin[];
  registryEntries: RegistryEntry[];
  recentSessionsNewestFirst: MovementSession[];
  lastSessionExerciseIds: string[];
  asOfLocalDate: string;
}): MovementFacts {
  const {
    checkinsOldestFirst,
    registryEntries,
    recentSessionsNewestFirst,
    lastSessionExerciseIds,
    asOfLocalDate,
  } = params;

  const latestCheckin = checkinsOldestFirst[checkinsOldestFirst.length - 1] ?? null;
  const insights = detectInsights(checkinsOldestFirst);
  const hasAnyData = checkinsOldestFirst.length > 0;

  const activeFindings: MovementActiveFinding[] = registryEntries
    .filter(
      (e) =>
        e.status === 'active' &&
        (e.domain === 'posture' || e.domain === 'movement' || e.domain === 'breathing') &&
        e.entry_kind === 'finding'
    )
    .map((e) => ({ code: e.code, label: e.label, domain: e.domain, severity: e.severity }));

  const completedSessions = recentSessionsNewestFirst.filter((s) => s.status === 'completed');
  const lastCompleted = completedSessions[0] ?? null;

  const sessionsCompletedLast7Days = completedSessions.filter(
    (s) => daysBetweenLocalDates(s.local_date, asOfLocalDate) <= 6
  ).length;
  const sessionsCompletedLast30Days = completedSessions.filter(
    (s) => daysBetweenLocalDates(s.local_date, asOfLocalDate) <= 29
  ).length;

  return {
    painLevel: latestCheckin?.pain_discomfort_level ?? null,
    painTrend: trendFor(insights, 'pain', hasAnyData),
    stressLevel: latestCheckin?.stress_level ?? null,
    stressTrend: trendFor(insights, 'stress', hasAnyData),
    sleepQuality: latestCheckin?.sleep_quality ?? null,
    sleepDuration: latestCheckin?.sleep_duration ?? null,
    sleepTrend: trendFor(insights, 'sleep', hasAnyData),
    energyLevel: latestCheckin?.energy_level ?? null,
    energyTrend: trendFor(insights, 'energy', hasAnyData),
    selfReportedMovementToday: latestCheckin?.movement_today ?? null,
    activeFindings,
    wearableSnapshot: buildWearableSnapshot(registryEntries),
    daysSinceLastSession: lastCompleted
      ? daysBetweenLocalDates(lastCompleted.local_date, asOfLocalDate)
      : null,
    sessionsCompletedLast7Days,
    sessionsCompletedLast30Days,
    lastSessionExerciseIds,
    equipmentAvailable: null,
    goals: null,
  };
}
