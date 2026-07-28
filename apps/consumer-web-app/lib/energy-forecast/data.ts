/**
 * Forecast & Calibration Loop — I/O layer. RLS decides who may read/write
 * what, same shape as every other data.ts in this codebase. Inserts use
 * `on conflict do nothing` as a second line of defense alongside the
 * database trigger (migration 111) — a forecast is a permanent record,
 * so a resubmission for a date that already has one is always a silent
 * no-op, never an overwrite.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EnergyForecast, RootEnergyForecast } from '@mef/shared-types-contracts';
import { fetchLatestMemberGoalSelection } from '../member-goals/data';
import { listActiveCandidatePairs, listMemberCorrelationFindings } from '../correlation-engine/data';
import { extractDailySeries } from '../correlation-engine/variables';
import type { CandidatePair, CorrelationFindingRow } from '../correlation-engine/types';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import { buildFindings } from '../case-view/findings';
import { listRecentCheckinsForMember } from '../coaching-engine/data';
import { ROOT_FORECAST_MIN_HISTORY_DAYS } from './constants';
import type { DriverNudgeInput } from './rootForecast';

export async function getForecastForDate(
  supabase: SupabaseClient,
  memberId: string,
  forecastDate: string
): Promise<EnergyForecast | null> {
  const { data, error } = await supabase
    .from('energy_forecasts')
    .select('*')
    .eq('member_id', memberId)
    .eq('forecast_date', forecastDate)
    .maybeSingle();

  if (error) {
    console.error('getForecastForDate failed', error);
    return null;
  }
  return data as EnergyForecast | null;
}

export async function getRootForecastForDate(
  supabase: SupabaseClient,
  memberId: string,
  forecastDate: string
): Promise<RootEnergyForecast | null> {
  const { data, error } = await supabase
    .from('root_energy_forecasts')
    .select('*')
    .eq('member_id', memberId)
    .eq('forecast_date', forecastDate)
    .maybeSingle();

  if (error) {
    console.error('getRootForecastForDate failed', error);
    return null;
  }
  return data as RootEnergyForecast | null;
}

/** No-op (not an update) if a forecast for this date already exists — see module comment. */
export async function insertForecastIfAbsent(
  supabase: SupabaseClient,
  memberId: string,
  forecastDate: string,
  madeFromLocalDate: string,
  predictedEnergyLevel: number
): Promise<void> {
  const { error } = await supabase
    .from('energy_forecasts')
    .insert({
      member_id: memberId,
      forecast_date: forecastDate,
      made_from_local_date: madeFromLocalDate,
      predicted_energy_level: predictedEnergyLevel,
    })
    .select('id');

  // Unique-violation on (member_id, forecast_date) means one already
  // exists — expected and fine, not an error worth surfacing.
  if (error && error.code !== '23505') {
    console.error('insertForecastIfAbsent failed', error);
  }
}

export async function insertRootForecastIfAbsent(
  supabase: SupabaseClient,
  memberId: string,
  forecastDate: string,
  predictedEnergyLevel: number,
  basisObservationCount: number,
  method: 'recent_average' | 'recent_average_with_driver_nudge' = 'recent_average'
): Promise<void> {
  const { error } = await supabase
    .from('root_energy_forecasts')
    .insert({
      member_id: memberId,
      forecast_date: forecastDate,
      predicted_energy_level: predictedEnergyLevel,
      basis_observation_count: basisObservationCount,
      method,
    })
    .select('id');

  if (error && error.code !== '23505') {
    console.error('insertRootForecastIfAbsent failed', error);
  }
}

/**
 * Scores a forecast exactly once. The `.is('scored_at', null)` filter
 * means a second call (e.g. revisiting the ending screen) matches zero
 * rows and is a harmless no-op — it never reaches the immutability
 * trigger's exception path, and never overwrites a real result.
 */
export async function scoreForecastOnce(
  supabase: SupabaseClient,
  memberId: string,
  forecastDate: string,
  actualEnergyLevel: number
): Promise<void> {
  const forecast = await getForecastForDate(supabase, memberId, forecastDate);
  if (!forecast || forecast.scored_at) return;

  const gap = actualEnergyLevel - forecast.predicted_energy_level;
  const { error } = await supabase
    .from('energy_forecasts')
    .update({ actual_energy_level: actualEnergyLevel, gap, scored_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('forecast_date', forecastDate)
    .is('scored_at', null);

  if (error) console.error('scoreForecastOnce failed', error);
}

export async function scoreRootForecastOnce(
  supabase: SupabaseClient,
  memberId: string,
  forecastDate: string,
  actualEnergyLevel: number
): Promise<void> {
  const forecast = await getRootForecastForDate(supabase, memberId, forecastDate);
  if (!forecast || forecast.scored_at) return;

  const gap = actualEnergyLevel - forecast.predicted_energy_level;
  const { error } = await supabase
    .from('root_energy_forecasts')
    .update({ actual_energy_level: actualEnergyLevel, gap, scored_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('forecast_date', forecastDate)
    .is('scored_at', null);

  if (error) console.error('scoreRootForecastOnce failed', error);
}

/** Every scored forecast, oldest first — for the calibration chart/percentage. Callers gate on MIN_SCORED_FORECASTS_FOR_CALIBRATION themselves. */
export async function listScoredForecasts(
  supabase: SupabaseClient,
  memberId: string,
  limit = 60
): Promise<EnergyForecast[]> {
  const { data, error } = await supabase
    .from('energy_forecasts')
    .select('*')
    .eq('member_id', memberId)
    .not('scored_at', 'is', null)
    .order('forecast_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('listScoredForecasts failed', error);
    return [];
  }
  return data as EnergyForecast[];
}

export async function listScoredRootForecasts(
  supabase: SupabaseClient,
  memberId: string,
  limit = 60
): Promise<RootEnergyForecast[]> {
  const { data, error } = await supabase
    .from('root_energy_forecasts')
    .select('*')
    .eq('member_id', memberId)
    .not('scored_at', 'is', null)
    .order('forecast_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('listScoredRootForecasts failed', error);
    return [];
  }
  return data as RootEnergyForecast[];
}

/** Her real (non-null) energy_level values up to and including asOfLocalDate, oldest first — the same daily_checkins_current view every other reader in this codebase uses, so an edited day is never counted twice. Feeds Root's rolling-average forecast (rootForecast.ts). */
export async function listRecentEnergyLevels(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string,
  limit = 30
): Promise<number[]> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('energy_level')
    .eq('user_id', memberId)
    .lte('local_date', asOfLocalDate)
    .not('energy_level', 'is', null)
    .order('local_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listRecentEnergyLevels failed', error);
    return [];
  }
  return (data as { energy_level: number }[]).map((row) => row.energy_level).reverse();
}

/**
 * The same "genuinely earned" bar Case View's buildFindings uses
 * (EARNED_STATES there) — everything except 'insufficient_data' and
 * 'stale'. Kept as its own copy rather than importing a private const,
 * but intentionally identical so "earned" never means two different
 * things in two places.
 */
const EARNED_CORRELATION_STATES = new Set([
  'one_time_observation',
  'repeated_signal',
  'emerging_pattern',
  'established_pattern',
]);

/**
 * Root's optional driver-informed nudge basis: the single most-confident
 * genuinely-earned check-in-sourced driver relationship this member has
 * for next-day energy, plus her own recent real values of that driver
 * variable. Restricted to `checkin.*` drivers only (never a wearable
 * metric) so the forecast loop works identically for a member with no
 * wearable connected — the task's own constraint, not just a shortcut.
 * Returns null whenever there's no earned relationship yet, or not enough
 * real driver-variable history to judge "high" or "low" against her own
 * norm — Root then simply forecasts from her energy history alone.
 */
export async function getEnergyDriverBasis(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<DriverNudgeInput | null> {
  const [pairs, findings] = await Promise.all([
    listActiveCandidatePairs(supabase),
    listMemberCorrelationFindings(supabase, memberId),
  ]);

  const candidates: { pair: CandidatePair; finding: CorrelationFindingRow }[] = [];
  for (const pair of pairs) {
    if (pair.outcomeVariable !== 'checkin.energy') continue;
    if (pair.driverVariable === 'checkin.energy') continue;
    if (!pair.driverVariable.startsWith('checkin.')) continue; // no-wearable-required constraint

    const finding = findings.get(pair.pairKey);
    if (!finding) continue;
    if (!EARNED_CORRELATION_STATES.has(finding.state)) continue;
    if (finding.tier === null || finding.direction === null || finding.rho === null) continue;

    candidates.push({ pair, finding });
  }

  if (candidates.length === 0) return null;

  // Most confident (largest-magnitude rho) earned relationship wins —
  // Root makes exactly one call, never averages several driver opinions.
  candidates.sort((a, b) => Math.abs(b.finding.rho!) - Math.abs(a.finding.rho!));
  const best = candidates[0]!;

  const checkins = await listRecentCheckinsForMember(supabase, memberId, asOfLocalDate, 60);
  const checkinsByDate = new Map(checkins.map((c) => [c.local_date, c]));
  const series = extractDailySeries(best.pair.driverVariable, checkinsByDate, new Map());
  const values = [...series.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);

  if (values.length < ROOT_FORECAST_MIN_HISTORY_DAYS) return null;

  return { driverLabel: best.pair.label, direction: best.finding.direction!, values };
}

/** Every one of her unscored forecasts whose date has already passed today — the backfill/cron's candidate set. */
export async function listUnscoredForecasts(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<EnergyForecast[]> {
  const { data, error } = await supabase
    .from('energy_forecasts')
    .select('*')
    .eq('member_id', memberId)
    .is('scored_at', null)
    .lt('forecast_date', asOfLocalDate);

  if (error) {
    console.error('listUnscoredForecasts failed', error);
    return [];
  }
  return data as EnergyForecast[];
}

export async function listUnscoredRootForecasts(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<RootEnergyForecast[]> {
  const { data, error } = await supabase
    .from('root_energy_forecasts')
    .select('*')
    .eq('member_id', memberId)
    .is('scored_at', null)
    .lt('forecast_date', asOfLocalDate);

  if (error) {
    console.error('listUnscoredRootForecasts failed', error);
    return [];
  }
  return data as RootEnergyForecast[];
}

/** Her real energy_level for one exact local_date, or null if she never checked in (or hasn't yet) that day — the "actual" a backfill grades an outstanding forecast against. */
export async function getActualEnergyLevelForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('energy_level')
    .eq('user_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error) {
    console.error('getActualEnergyLevelForDate failed', error);
    return null;
  }
  return (data as { energy_level: number | null } | null)?.energy_level ?? null;
}

/**
 * Whether the correlation engine (via Case View's own, unmodified
 * buildFindings) has an earned finding for this member — reused exactly
 * as Case View itself decides it, so the ending screen's handoff to
 * /case can never disagree with what /case actually shows.
 */
export async function hasEarnedFinding(supabase: SupabaseClient, memberId: string): Promise<boolean> {
  const [goalSelection, candidatePairs, patternStates] = await Promise.all([
    fetchLatestMemberGoalSelection(supabase, memberId),
    listActiveCandidatePairs(supabase),
    listMemberPatternStates(supabase, memberId),
  ]);

  const findings = buildFindings([...patternStates.values()], candidatePairs, goalSelection?.goals ?? []);
  return findings.length > 0;
}
