/**
 * Driver State Engine — orchestration. Reads the correlation engine's own
 * persisted output (member_correlation_findings, migration 105) plus an
 * independent data-sufficiency check (dataSufficiency.ts, built from that
 * engine's exported pure functions) and classifies every driver a member
 * has candidate pairs for. Computes no correlations itself — it is a
 * downstream consumer of lib/correlation-engine/, exactly like
 * lib/intelligence-engine/correlationPatterns.ts already is, never an
 * edit to that engine. Scheduled separately
 * (app/api/cron/driver-state-engine), staggered after the correlation
 * engine's own daily run.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { listRecentCheckinsForMember } from '../coaching-engine/data';
import { listWearableMetricHistory } from '../wearables/data';
import { listActiveCandidatePairs, listMemberCorrelationFindings } from '../correlation-engine/data';
import { extractDailySeries, wearableMetricCodesFor, type WearableDayValues } from '../correlation-engine/variables';
import type { CandidatePair, CorrelationFindingRow } from '../correlation-engine/types';
import { hasSufficientPairedData } from './dataSufficiency';
import { classifyDriverState, type DriverPairVerdict } from './classify';
import { listActiveDrivers, upsertMemberDriverState } from '../driver-library/data';

/** Same window the correlation engine itself uses (lib/correlation-engine/service.ts) — comfortably wide enough for both base gates plus a real split-window test. */
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

function groupPairsByDriver(pairs: readonly CandidatePair[]): Map<string, CandidatePair[]> {
  const byDriver = new Map<string, CandidatePair[]>();
  for (const pair of pairs) {
    const bucket = byDriver.get(pair.driverId);
    if (bucket) bucket.push(pair);
    else byDriver.set(pair.driverId, [pair]);
  }
  return byDriver;
}

export type DriverStateEngineResult = {
  memberId: string;
  driversEvaluated: number;
};

export async function runDriverStateEngineForMember(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<DriverStateEngineResult> {
  const [drivers, allPairs, findingsByPair, checkinsByDate] = await Promise.all([
    listActiveDrivers(supabase),
    listActiveCandidatePairs(supabase),
    listMemberCorrelationFindings(supabase, memberId),
    buildCheckinsByDate(supabase, memberId, asOfLocalDate),
  ]);

  if (drivers.length === 0) return { memberId, driversEvaluated: 0 };

  const variableKeys = [...new Set(allPairs.flatMap((p) => [p.outcomeVariable, p.driverVariable]))];
  const wearableByDate = await buildWearableByDate(supabase, memberId, wearableMetricCodesFor(variableKeys));

  const pairsByDriver = groupPairsByDriver(allPairs);
  const nowIso = new Date().toISOString();

  await Promise.all(
    drivers.map(async (driver) => {
      const pairs = pairsByDriver.get(driver.id) ?? [];

      const verdicts: DriverPairVerdict[] = pairs.map((pair) => {
        const outcomeSeries = extractDailySeries(pair.outcomeVariable, checkinsByDate, wearableByDate);
        const driverSeries = extractDailySeries(pair.driverVariable, checkinsByDate, wearableByDate);
        const finding: CorrelationFindingRow | null = findingsByPair.get(pair.pairKey) ?? null;
        return {
          pairKey: pair.pairKey,
          finding,
          hasSufficientData: hasSufficientPairedData(outcomeSeries, driverSeries),
        };
      });

      const classified = classifyDriverState(verdicts);

      await upsertMemberDriverState(supabase, {
        memberId,
        driverId: driver.id,
        state: classified.state,
        evidenceSummary: classified.evidenceSummary,
        updatedAt: nowIso,
      });
    })
  );

  return { memberId, driversEvaluated: drivers.length };
}
