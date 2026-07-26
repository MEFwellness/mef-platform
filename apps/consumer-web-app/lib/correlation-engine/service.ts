/**
 * Correlation Engine — orchestration. Computes every relevant candidate
 * pair for one member and persists both this run's evidence
 * (member_correlation_findings) and the promoted three-tier signal
 * (member_pattern_states, via the existing, untouched
 * upsertMemberPatternState write path). Called from the scheduled cron
 * route (app/api/cron/correlation-engine) — never on a member's page
 * load, per requirement 8.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { listRecentCheckinsForMember } from '../coaching-engine/data';
import { listWearableMetricHistory } from '../wearables/data';
import { fetchLatestMemberGoalSelection } from '../member-goals/data';
import { listMemberPatternStates, upsertMemberPatternState } from '../longitudinal-intelligence/data';
import { candidatePairsForGoals, listActiveCandidatePairs, upsertMemberCorrelationFinding } from './data';
import { classifyCorrelationFindingSignal, type PriorCorrelationState } from './classify';
import { evaluatePair } from './evidence';
import { extractDailySeries, wearableMetricCodesFor, type WearableDayValues } from './variables';
import type { CandidatePair, CorrelationFindingRow } from './types';
import type { LongitudinalSignalRow } from '../longitudinal-intelligence/types';

/**
 * Wide enough to comfortably clear both the 21-paired-observation and
 * 21-day-span base gates (evidence.ts) plus give the split-window check
 * two real halves, even accounting for a member who misses a meaningful
 * fraction of days.
 */
const HISTORY_WINDOW_DAYS = 180;

async function buildCheckinsByDate(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<Map<string, DailyCheckin>> {
  const checkins = await listRecentCheckinsForMember(supabase, memberId, asOfLocalDate, HISTORY_WINDOW_DAYS);
  return new Map(checkins.map((c) => [c.local_date, c]));
}

async function buildWearableByDate(
  supabase: SupabaseClient,
  memberId: string,
  metricCodes: string[]
): Promise<Map<string, WearableDayValues>> {
  const byDate = new Map<string, WearableDayValues>();
  if (metricCodes.length === 0) return byDate;

  const histories = await Promise.all(
    metricCodes.map((code) =>
      listWearableMetricHistory(
        supabase,
        memberId,
        code as Parameters<typeof listWearableMetricHistory>[2],
        { limit: HISTORY_WINDOW_DAYS }
      )
    )
  );

  for (const history of histories) {
    for (const row of history) {
      const dayValues = byDate.get(row.local_date) ?? new Map<string, number>();
      dayValues.set(row.metric_code, row.numeric_value);
      byDate.set(row.local_date, dayValues);
    }
  }
  return byDate;
}

function priorStateFor(
  priorSignals: Map<string, LongitudinalSignalRow>,
  pairKey: string
): PriorCorrelationState | null {
  const row = priorSignals.get(`correlation::${pairKey}`);
  if (!row) return null;
  const direction = row.evidenceSummary?.direction;
  return {
    state: row.state,
    occurrenceCount: row.occurrenceCount,
    firstObservedAt: row.firstObservedAt,
    direction: direction === 'positive' || direction === 'negative' ? direction : null,
  };
}

export type CorrelationEngineResult = {
  memberId: string;
  pairsEvaluated: number;
  findings: CorrelationFindingRow[];
};

/**
 * Runs every goal-relevant candidate pair for one member, persists both
 * tables, and returns what it computed (for the cron route's summary
 * response and for tests — this function itself does no HTTP/auth, the
 * route wraps it).
 */
export async function runCorrelationEngineForMember(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<CorrelationEngineResult> {
  const [allPairs, goalSelection, checkinsByDate, priorSignals] = await Promise.all([
    listActiveCandidatePairs(supabase),
    fetchLatestMemberGoalSelection(supabase, memberId),
    buildCheckinsByDate(supabase, memberId, asOfLocalDate),
    listMemberPatternStates(supabase, memberId),
  ]);

  const pairs = candidatePairsForGoals(allPairs, goalSelection?.goals ?? []);
  if (pairs.length === 0) return { memberId, pairsEvaluated: 0, findings: [] };

  const variableKeys = [...new Set(pairs.flatMap((p) => [p.outcomeVariable, p.driverVariable]))];
  const wearableByDate = await buildWearableByDate(supabase, memberId, wearableMetricCodesFor(variableKeys));

  const nowIso = new Date().toISOString();
  const findings: CorrelationFindingRow[] = [];

  await Promise.all(
    pairs.map(async (pair: CandidatePair) => {
      const outcomeSeries = extractDailySeries(pair.outcomeVariable, checkinsByDate, wearableByDate);
      const driverSeries = extractDailySeries(pair.driverVariable, checkinsByDate, wearableByDate);
      const evidence = evaluatePair(outcomeSeries, driverSeries);

      const prior = priorStateFor(priorSignals, pair.pairKey);
      const { findingRow, signal } = classifyCorrelationFindingSignal(pair, evidence, prior, nowIso);
      findingRow.memberId = memberId;

      await Promise.all([
        upsertMemberCorrelationFinding(supabase, findingRow),
        upsertMemberPatternState(supabase, memberId, signal),
      ]);

      findings.push(findingRow);
    })
  );

  return { memberId, pairsEvaluated: pairs.length, findings };
}
