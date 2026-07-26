/**
 * Case View — orchestration. Assembles CaseView entirely from data every
 * other system already produces: member_goal_selections (welcome flow),
 * drivers/driver_goal_weights/member_driver_states (driver library +
 * driver-state engine), member_pattern_states (correlation engine, via
 * its own existing write path), daily_checkins/wearable_daily_metrics
 * (check-in + wearables), and member_goal_progress_checkins (this
 * feature's one new, un-scored table). Computes no correlation, no
 * trend, no driver state — every classification decision was already
 * made elsewhere; this only reads and formats it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { fetchLatestMemberGoalSelection } from '../member-goals/data';
import {
  listActiveDrivers,
  listDriverDomains,
  listDriverGoalWeights,
  listMemberDriverStates,
} from '../driver-library/data';
import { listActiveCandidatePairs, candidatePairsForGoals } from '../correlation-engine/data';
import { wearableMetricCodesFor, type WearableDayValues } from '../correlation-engine/variables';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import { listRecentCheckinsForMember } from '../coaching-engine/data';
import { listWearableMetricHistory } from '../wearables/data';
import { buildCaseHeader } from './header';
import { buildInvestigationPanel } from './investigation';
import { buildFindings } from './findings';
import { buildOverlaySeries } from './overlay';
import { buildCaseEmptyState, buildStillGatheringRows } from './emptyState';
import { buildGoalProgressView } from './goalProgress';
import { listGoalProgressCheckins } from './data';
import { labelForVariable } from './variableLabels';
import type { CaseView } from './types';

/** Same window the correlation engine and driver-state engine already use — comfortably wide enough for the overlay chart and the evidence-progress readout. */
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

export async function buildCaseView(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string
): Promise<CaseView> {
  const [goalSelection, drivers, domains, goalWeights, driverStates, candidatePairs, patternStates, goalProgressRows] =
    await Promise.all([
      fetchLatestMemberGoalSelection(supabase, memberId),
      listActiveDrivers(supabase),
      listDriverDomains(supabase),
      listDriverGoalWeights(supabase),
      listMemberDriverStates(supabase, memberId),
      listActiveCandidatePairs(supabase),
      listMemberPatternStates(supabase, memberId),
      listGoalProgressCheckins(supabase, memberId),
    ]);

  const memberGoalKeys = goalSelection?.goals ?? [];
  const header = buildCaseHeader(goalSelection);

  const domainLabelByKey = new Map(domains.map((d) => [d.key, d.label]));
  const investigation = buildInvestigationPanel(
    drivers,
    domainLabelByKey,
    goalWeights,
    memberGoalKeys,
    driverStates,
    candidatePairs
  );

  const patternStateRows = [...patternStates.values()];
  const findings = buildFindings(patternStateRows, candidatePairs, memberGoalKeys);

  const relevantPairs = candidatePairsForGoals(candidatePairs, memberGoalKeys);
  const variableKeys = [...new Set(relevantPairs.flatMap((p) => [p.outcomeVariable, p.driverVariable]))];

  const [checkinsByDate, wearableByDate] = await Promise.all([
    buildCheckinsByDate(supabase, memberId, todayLocalDate),
    (async () => {
      const codes = wearableMetricCodesFor(variableKeys);
      return buildWearableByDate(supabase, memberId, codes);
    })(),
  ]);

  const pairByKey = new Map(relevantPairs.map((p) => [p.pairKey, p]));
  for (const finding of findings) {
    if (!finding.showOverlay) continue;
    const pair = pairByKey.get(finding.pairKey);
    if (!pair) continue;
    finding.overlay = buildOverlaySeries(
      finding,
      pair,
      labelForVariable(pair.outcomeVariable),
      labelForVariable(pair.driverVariable),
      checkinsByDate,
      wearableByDate
    );
  }

  const goalProgress = buildGoalProgressView(header, goalProgressRows, todayLocalDate);

  const emptyState =
    findings.length === 0
      ? buildCaseEmptyState(
          buildStillGatheringRows(relevantPairs, checkinsByDate, wearableByDate),
          checkinsByDate,
          todayLocalDate
        )
      : null;

  return { header, goalProgress, investigation, findings, emptyState };
}
