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
 * Only 7 of the 12 Coaching Domains have a real per-day check-in column to
 * count (COACHING_DOMAIN_TO_WELLNESS_METRIC already draws this exact
 * line — reused here rather than re-derived). Nutrition (no check-in
 * column of its own) and the four uninstrumented domains have no
 * trackable per-day source at all: `computeDomainCoverage` returns null
 * for those, never a fabricated zero.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysToLocalDate } from '../feed/dateMath';
import type { CoachingDomain } from '../investigation-engine/domains';

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

export async function fetchDomainCoverage(
  supabase: SupabaseClient,
  memberId: string,
  asOfLocalDate: string
): Promise<Partial<Record<CoachingDomain, DomainCoverage>>> {
  const since = addDaysToLocalDate(asOfLocalDate, -(COVERAGE_WINDOW_DAYS - 1));
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select(CHECKIN_COVERAGE_COLUMNS)
    .eq('user_id', memberId)
    .gte('local_date', since)
    .lte('local_date', asOfLocalDate);

  if (error) {
    console.error('fetchDomainCoverage failed', error);
    return {};
  }

  return computeAllDomainCoverage((data ?? []) as CheckinCoverageRow[]);
}
