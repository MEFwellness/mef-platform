/**
 * Root Map — real per-domain coverage counts (Root Map redesign,
 * 2026-07-28, Part 3). Replaces the "Building confidence"/"Quiet" chips
 * (real signals, but evidence-strength based, not day-count based, so
 * every domain reads identically for a member without much registry
 * evidence yet — see BUILD_STATUS.md for the full finding) with the same
 * "N of M days logged" phrasing CaseEmptyState.tsx already uses
 * (lib/case-view/emptyState.ts), computed from `daily_checkins_current`
 * over a trailing window — same fetch shape as
 * lib/scoring/fetchInputs.ts's fetchCheckinsForScoring, a narrower column
 * selection.
 *
 * 7 of the 12 Coaching Domains have a real per-day check-in column to
 * count (COACHING_DOMAIN_TO_WELLNESS_METRIC already draws this exact
 * line — reused here rather than re-derived); `computeDomainCoverage`
 * returns null for a domain with no such column, never a fabricated zero.
 *
 * Nutrition & Metabolic Health is the 8th (2026-07-29 follow-up):
 * `daily_checkins_current` has no nutrition column, but the driver
 * library (migration 106/109) DOES already collect real per-day nutrition
 * evidence — the "Fuel and nutrition" (`FUE`) driver domain's rotating
 * check-in probes (last meal timing, hydration, cravings, protein, etc.),
 * answered into `daily_checkin_probe_answers`. That table simply predates
 * this file and was never wired in. `fetchNutritionCoverage` below reuses
 * the same reference data (`listActiveDrivers`/`listActiveDriverProbeQuestions`,
 * lib/driver-library, lib/daily-checkin-adaptive) the adaptive check-in
 * picker itself already reads, rather than hardcoding a second, soon-stale
 * list of FUE question keys — a coach retiring/adding a FUE question via
 * /coach/questions changes this count automatically, the same way it
 * already changes what the check-in asks. The four uninstrumented domains
 * still have no trackable per-day source at all and still get null.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysToLocalDate } from '../feed/dateMath';
import type { CoachingDomain } from '../investigation-engine/domains';
import { listActiveDrivers } from '../driver-library/data';
import { listActiveDriverProbeQuestions } from '../daily-checkin-adaptive/data';

/** driver_domains.key for "Fuel and nutrition" (migration 106) — the only Coaching Domain it reconciles to is nutrition_metabolic_health. */
const NUTRITION_DRIVER_DOMAIN_KEY = 'FUE';

export const COVERAGE_WINDOW_DAYS = 21;

/** The subset of daily_checkins columns any Coaching Domain maps to. */
export type CheckinCoverageRow = {
  sleep_quality: number | null;
  movement_today: string | null;
  energy_level: number | null;
  pain_discomfort_level: number | null;
  digestion_rating: number | null;
  stress_level: number | null;
  mood_level: number | null;
};

const CHECKIN_COVERAGE_COLUMNS =
  'sleep_quality, movement_today, energy_level, pain_discomfort_level, digestion_rating, stress_level, mood_level';

/** Coaching Domain -> the one daily_checkins column that is real, per-day evidence of activity in that domain. Domains absent here (nutrition_metabolic_health and the four uninstrumented domains) have no trackable per-day source. */
const COVERAGE_FIELD_BY_DOMAIN: Partial<Record<CoachingDomain, keyof CheckinCoverageRow>> = {
  sleep_circadian_rhythm: 'sleep_quality',
  movement_physical_capacity: 'movement_today',
  recovery_energy_regulation: 'energy_level',
  pain_structural_integrity: 'pain_discomfort_level',
  digestion_gut_health: 'digestion_rating',
  stress_nervous_system: 'stress_level',
  emotional_resilience_mood: 'mood_level',
};

export type DomainCoverage = {
  count: number;
  windowDays: number;
};

/** Pure — the only place that knows how to turn a window of raw check-in rows into a per-domain coverage count. Null (never 0) for a domain with no trackable per-day source. */
export function computeDomainCoverage(
  domain: CoachingDomain,
  rows: CheckinCoverageRow[]
): DomainCoverage | null {
  const field = COVERAGE_FIELD_BY_DOMAIN[domain];
  if (!field) return null;
  const count = rows.filter((r) => r[field] !== null && r[field] !== undefined).length;
  return { count, windowDays: COVERAGE_WINDOW_DAYS };
}

export function computeAllDomainCoverage(
  rows: CheckinCoverageRow[]
): Partial<Record<CoachingDomain, DomainCoverage>> {
  const result: Partial<Record<CoachingDomain, DomainCoverage>> = {};
  for (const domain of Object.keys(COVERAGE_FIELD_BY_DOMAIN) as CoachingDomain[]) {
    // Every key here came from COVERAGE_FIELD_BY_DOMAIN itself, so
    // computeDomainCoverage always resolves a mapped field and never
    // returns null for it.
    result[domain] = computeDomainCoverage(domain, rows)!;
  }
  return result;
}

/** "4 of 21 days logged" — the exact phrasing CaseEmptyState.tsx already uses for coverage. */
export function formatCoverageLabel(coverage: DomainCoverage): string {
  return `${coverage.count} of ${coverage.windowDays} days logged`;
}

/** Pure — a raw list of local_dates (one entry per FUE-domain probe answered that day; a day with several answered probes appears more than once) collapsed into a distinct-day count. A real, non-fabricated zero when the list is empty — the caller only omits this entirely when the reference data itself couldn't be read. */
export function computeNutritionCoverage(localDates: string[]): DomainCoverage {
  return { count: new Set(localDates).size, windowDays: COVERAGE_WINDOW_DAYS };
}

/**
 * Real per-day nutrition evidence, sourced from the driver library rather
 * than a `daily_checkins` column: which active "Fuel and nutrition" (FUE)
 * probe questions exist right now (`listActiveDrivers`/
 * `listActiveDriverProbeQuestions` — the exact same reference data the
 * adaptive check-in picker itself reads, so a coach editing FUE questions
 * via /coach/questions changes this count the same day, with no separate
 * list to fall out of sync), then how many distinct days this member
 * answered one of them (`daily_checkin_probe_answers`). Null only when the
 * reference data can't be read at all — not when a member has genuinely
 * never answered one (that's a real `{ count: 0, ... }`, same discipline
 * `computeDomainCoverage` uses for its own domains).
 */
async function fetchNutritionCoverage(
  supabase: SupabaseClient,
  memberId: string,
  since: string,
  asOfLocalDate: string
): Promise<DomainCoverage | null> {
  const [drivers, questions] = await Promise.all([
    listActiveDrivers(supabase),
    listActiveDriverProbeQuestions(supabase),
  ]);

  const nutritionDriverIds = new Set(
    drivers.filter((d) => d.domainKey === NUTRITION_DRIVER_DOMAIN_KEY).map((d) => d.id)
  );
  const nutritionQuestionKeys = questions
    .filter((q) => q.driverId && nutritionDriverIds.has(q.driverId))
    .map((q) => q.questionKey);

  if (nutritionQuestionKeys.length === 0) return null;

  const { data, error } = await supabase
    .from('daily_checkin_probe_answers')
    .select('local_date')
    .eq('member_id', memberId)
    .in('question_key', nutritionQuestionKeys)
    .gte('local_date', since)
    .lte('local_date', asOfLocalDate);

  if (error) {
    console.error('fetchNutritionCoverage failed', error);
    return null;
  }

  return computeNutritionCoverage((data ?? []).map((row) => (row as { local_date: string }).local_date));
}

export async function fetchDomainCoverage(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<Partial<Record<CoachingDomain, DomainCoverage>>> {
  const since = addDaysToLocalDate(asOfLocalDate, -(COVERAGE_WINDOW_DAYS - 1));

  const [checkinResult, nutritionCoverage] = await Promise.all([
    supabase
      .from('daily_checkins_current')
      .select(CHECKIN_COVERAGE_COLUMNS)
      .eq('user_id', memberId)
      .gte('local_date', since)
      .lte('local_date', asOfLocalDate),
    fetchNutritionCoverage(supabase, memberId, since, asOfLocalDate),
  ]);

  let result: Partial<Record<CoachingDomain, DomainCoverage>>;
  if (checkinResult.error) {
    console.error('fetchDomainCoverage failed', checkinResult.error);
    result = {};
  } else {
    result = computeAllDomainCoverage((checkinResult.data ?? []) as CheckinCoverageRow[]);
  }

  if (nutritionCoverage) result.nutrition_metabolic_health = nutritionCoverage;
  return result;
}
