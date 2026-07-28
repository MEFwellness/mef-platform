/**
 * Forecast & Calibration Loop — orchestration. Two entry points:
 *   - recordForecastsFromEveningReflection: called once from
 *     submitEveningReflection, writes her forecast (if she gave one) and
 *     attempts Root's (always, independent of her choice).
 *   - buildEndingScreenView: called from the ending screen
 *     (app/checkin/result), scores whichever forecasts are outstanding
 *     for the day just submitted and returns the view model.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysToLocalDate, daysBetweenLocalDates } from '../feed/dateMath';
import { MIN_SPAN_DAYS } from '../correlation-engine/evidence';
import { ACCURACY_TOLERANCE, ROOT_FORECAST_MIN_HISTORY_DAYS } from './constants';
import { computeRootForecast } from './rootForecast';
import { scoreForecast, accuracyPercent, meetsCalibrationThreshold } from './scoring';
import {
  describeGap,
  describeRootGap,
  describeRootNotReady,
  describeRootTooVolatile,
  describeTimeline,
  ROOT_NO_ATTEMPT_SENTENCE,
} from './copy';
import { energyLevelLabel, moodLabel, stressLabel, sleepQualityLabel, painLabel } from './scaleLabels';
import {
  getForecastForDate,
  getRootForecastForDate,
  insertForecastIfAbsent,
  insertRootForecastIfAbsent,
  scoreForecastOnce,
  scoreRootForecastOnce,
  listScoredForecasts,
  listScoredRootForecasts,
  listRecentEnergyLevels,
  listUnscoredForecasts,
  listUnscoredRootForecasts,
  getActualEnergyLevelForDate,
  getEnergyDriverBasis,
  hasEarnedFinding,
} from './data';
import { listRecentCheckinsForMember } from '../coaching-engine/data';
import type { DailyCheckin, EnergyForecast, RootEnergyForecast } from '@mef/shared-types-contracts';
import type {
  CalibrationPoint,
  CalibrationView,
  EndingScreenView,
  ReadbackView,
  RootStatusView,
  ScoredForecastView,
  TimelineView,
} from './types';

/**
 * Called from submitEveningReflection. `predictedEnergyLevel` is null
 * when she skipped the question — in that case her forecast is simply
 * never written (no default substituted), but Root still attempts its
 * own, independent of her choice.
 */
export async function recordForecastsFromEveningReflection(
  supabase: SupabaseClient,
  memberId: string,
  eveningLocalDate: string,
  predictedEnergyLevel: number | null
): Promise<void> {
  const forecastDate = addDaysToLocalDate(eveningLocalDate, 1);

  if (predictedEnergyLevel !== null) {
    await insertForecastIfAbsent(supabase, memberId, forecastDate, eveningLocalDate, predictedEnergyLevel);
  }

  const [history, driverNudge] = await Promise.all([
    listRecentEnergyLevels(supabase, memberId, eveningLocalDate),
    getEnergyDriverBasis(supabase, memberId, eveningLocalDate),
  ]);
  const result = computeRootForecast(history, driverNudge);
  if (result.kind === 'forecast') {
    await insertRootForecastIfAbsent(
      supabase,
      memberId,
      forecastDate,
      result.predictedEnergyLevel,
      result.basisObservationCount,
      result.method
    );
  }
}

function toScoredView(predictedLevel: number, actualLevel: number, gap: number, forRoot: boolean): ScoredForecastView {
  return {
    predictedLevel,
    predictedLabel: energyLevelLabel(predictedLevel),
    actualLevel,
    actualLabel: energyLevelLabel(actualLevel),
    gap,
    sentence: forRoot ? describeRootGap(predictedLevel, actualLevel, gap) : describeGap(predictedLevel, actualLevel, gap),
  };
}

/**
 * Off-by-one fix (2026-07-28): both cards on "Today's forecast" could
 * show a gap one point off from what their own labels said — e.g.
 * "predicted Exhausted, came in Low" (a genuine one-step gap) captioned
 * as "2 points higher," or two identical "Low" labels captioned as
 * "1 point higher" instead of an exact match. `scoreForecast` itself
 * (actual - predicted) was never wrong. The real defect: once a forecast
 * is scored, its `gap` column is frozen by DB trigger (by design, so
 * historical calibration accuracy never retroactively changes) — but
 * `todaysEnergyLevel` is re-read fresh on every visit to this screen. A
 * member can reach /checkin/result again for the same day by using
 * "Update check-in" to revise an already-submitted answer; the labels
 * then reflect her NEW answer while the frozen `gap` still reflects the
 * OLD one, so the visible labels and the printed gap silently disagreed.
 * Both buildEndingScreenView (her forecast) and resolveRootStatus
 * (Root's) had this exact same pattern independently — this one function
 * is now the only place either builds a scored view, so both are fixed
 * by the one change: the frozen `gap` column still gets written once
 * (untouched — it's what calibration history reads), but the NUMBER
 * SHOWN is always recomputed fresh against the same actualLevel the
 * labels use, so they can never disagree.
 */
async function resolveScoredView(
  predictedLevel: number,
  actualLevel: number,
  alreadyScored: boolean,
  persistOnce: () => Promise<void>,
  forRoot: boolean
): Promise<ScoredForecastView> {
  if (!alreadyScored) {
    await persistOnce();
  }
  const { gap } = scoreForecast(predictedLevel, actualLevel);
  return toScoredView(predictedLevel, actualLevel, gap, forRoot);
}

async function resolveRootStatus(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  todaysEnergyLevel: number
): Promise<RootStatusView> {
  const rootRow = await getRootForecastForDate(supabase, memberId, localDate);

  if (rootRow) {
    const forecast = await resolveScoredView(
      rootRow.predicted_energy_level,
      todaysEnergyLevel,
      rootRow.scored_at !== null,
      () => scoreRootForecastOnce(supabase, memberId, localDate, todaysEnergyLevel),
      true
    );
    return { kind: 'scored', forecast };
  }

  // No row — either Root never had a genuine basis, it abstained as too
  // erratic to call, or she skipped Evening Reflection that night so Root
  // never got a chance. History is checked as of the night before,
  // mirroring what Root could have known.
  const nightBefore = addDaysToLocalDate(localDate, -1);
  const historyAsOfLastNight = await listRecentEnergyLevels(supabase, memberId, nightBefore);
  const driverNudge = await getEnergyDriverBasis(supabase, memberId, nightBefore);
  const result = computeRootForecast(historyAsOfLastNight, driverNudge);

  if (result.kind === 'insufficient_history') {
    return {
      kind: 'not_ready',
      basisObservationCount: result.basisObservationCount,
      minRequired: ROOT_FORECAST_MIN_HISTORY_DAYS,
      sentence: describeRootNotReady(result.basisObservationCount, ROOT_FORECAST_MIN_HISTORY_DAYS),
    };
  }

  if (result.kind === 'too_volatile') {
    return {
      kind: 'too_volatile',
      basisObservationCount: result.basisObservationCount,
      sentence: describeRootTooVolatile(result.basisObservationCount),
    };
  }

  // result.kind === 'forecast' but no row exists — Root had a genuine
  // basis, it just never got written (no Evening Reflection that night).
  return { kind: 'no_attempt', sentence: ROOT_NO_ATTEMPT_SENTENCE };
}

/**
 * Grades every one of a member's outstanding (unscored, past-dated)
 * forecasts against her real check-in history — the safety net for
 * predictions that were made but never graded because she never
 * revisited /checkin/result for that date (grading there is otherwise
 * purely view-triggered). Also the mechanism that backfills accounts
 * that already had forecasts stored before this cron existed. Idempotent
 * via scoreForecastOnce/scoreRootForecastOnce's own `.is('scored_at',
 * null)` guard, so running it twice for the same member is harmless.
 */
export async function backfillOutstandingForecastsForMember(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<{ herScored: number; rootScored: number }> {
  const [herOutstanding, rootOutstanding] = await Promise.all([
    listUnscoredForecasts(supabase, memberId, asOfLocalDate),
    listUnscoredRootForecasts(supabase, memberId, asOfLocalDate),
  ]);

  let herScored = 0;
  for (const row of herOutstanding) {
    const actual = await getActualEnergyLevelForDate(supabase, memberId, row.forecast_date);
    if (actual != null) {
      await scoreForecastOnce(supabase, memberId, row.forecast_date, actual);
      herScored += 1;
    }
  }

  let rootScored = 0;
  for (const row of rootOutstanding) {
    const actual = await getActualEnergyLevelForDate(supabase, memberId, row.forecast_date);
    if (actual != null) {
      await scoreRootForecastOnce(supabase, memberId, row.forecast_date, actual);
      rootScored += 1;
    }
  }

  return { herScored, rootScored };
}

function buildReadback(checkin: DailyCheckin): ReadbackView {
  return {
    moodLabel: checkin.mood_level != null ? moodLabel(checkin.mood_level) : null,
    energyLabel: checkin.energy_level != null ? energyLevelLabel(checkin.energy_level) : null,
    stressLabel: checkin.stress_level != null ? stressLabel(checkin.stress_level) : null,
    sleepQualityLabel: checkin.sleep_quality != null ? sleepQualityLabel(checkin.sleep_quality) : null,
    painLabel: checkin.pain_discomfort_level != null ? painLabel(checkin.pain_discomfort_level) : null,
  };
}

async function buildTimeline(supabase: SupabaseClient, memberId: string, localDate: string): Promise<TimelineView> {
  const checkins = await listRecentCheckinsForMember(supabase, memberId, localDate, 400);
  const checkinCount = checkins.length;
  const daysSinceFirstCheckin = checkinCount > 0 ? daysBetweenLocalDates(checkins[0]!.local_date, localDate) : null;

  return {
    checkinCount,
    daysSinceFirstCheckin,
    targetDays: MIN_SPAN_DAYS,
    sentence: describeTimeline(checkinCount, daysSinceFirstCheckin, MIN_SPAN_DAYS),
  };
}

function buildCalibrationSeries(her: EnergyForecast[], root: RootEnergyForecast[]): CalibrationPoint[] {
  const dates = [...new Set([...her.map((f) => f.forecast_date), ...root.map((f) => f.forecast_date)])].sort();
  const herByDate = new Map(her.map((f) => [f.forecast_date, f]));
  const rootByDate = new Map(root.map((f) => [f.forecast_date, f]));

  let herHits = 0;
  let herTotal = 0;
  let rootHits = 0;
  let rootTotal = 0;
  const points: CalibrationPoint[] = [];

  for (const date of dates) {
    const hf = herByDate.get(date);
    if (hf && hf.gap !== null) {
      herTotal += 1;
      if (Math.abs(hf.gap) <= ACCURACY_TOLERANCE) herHits += 1;
    }
    const rf = rootByDate.get(date);
    if (rf && rf.gap !== null) {
      rootTotal += 1;
      if (Math.abs(rf.gap) <= ACCURACY_TOLERANCE) rootHits += 1;
    }
    points.push({
      date,
      herAccuracyPct: herTotal > 0 ? Math.round((herHits / herTotal) * 100) : 0,
      rootAccuracyPct: rootTotal > 0 ? Math.round((rootHits / rootTotal) * 100) : 0,
    });
  }
  return points;
}

/**
 * The ending screen's full view model, for the day just submitted
 * (`localDate` — the check-in's own local_date, not necessarily "today"
 * if she logged for yesterday). Scores any outstanding forecast for this
 * date as a side effect; safe to call repeatedly (see scoreForecastOnce's
 * own idempotency).
 */
export async function buildEndingScreenView(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  todaysCheckin: DailyCheckin
): Promise<EndingScreenView> {
  const todaysEnergyLevel = todaysCheckin.energy_level!;

  const herForecastRow = await getForecastForDate(supabase, memberId, localDate);

  if (!herForecastRow) {
    const [readback, timeline, rootStatus] = await Promise.all([
      Promise.resolve(buildReadback(todaysCheckin)),
      buildTimeline(supabase, memberId, localDate),
      resolveRootStatus(supabase, memberId, localDate, todaysEnergyLevel),
    ]);
    return { kind: 'no_forecast', readback, timeline, rootStatus };
  }

  const her = await resolveScoredView(
    herForecastRow.predicted_energy_level,
    todaysEnergyLevel,
    herForecastRow.scored_at !== null,
    () => scoreForecastOnce(supabase, memberId, localDate, todaysEnergyLevel),
    false
  );

  const [rootStatus, handoffToCase] = await Promise.all([
    resolveRootStatus(supabase, memberId, localDate, todaysEnergyLevel),
    hasEarnedFinding(supabase, memberId),
  ]);

  // Calibration (her/Root accuracy over time) is a distinct claim from
  // Case View's driver findings — one is "how well do predictions land,"
  // the other is "which drivers are earned" — so it renders independently
  // of handoffToCase now; the two sections can both show at once rather
  // than the calibration section being replaced by the case-view link.
  let calibration: CalibrationView | null = null;
  const [herScored, rootScored] = await Promise.all([
    listScoredForecasts(supabase, memberId),
    listScoredRootForecasts(supabase, memberId),
  ]);
  if (meetsCalibrationThreshold(herScored.length) && meetsCalibrationThreshold(rootScored.length)) {
    calibration = {
      scoredCount: herScored.length,
      herAccuracyPct: accuracyPercent(herScored.map((f) => f.gap!)),
      rootAccuracyPct: accuracyPercent(rootScored.map((f) => f.gap!)),
      series: buildCalibrationSeries(herScored, rootScored),
    };
  }

  return { kind: 'scored', her, rootStatus, calibration, handoffToCase };
}
