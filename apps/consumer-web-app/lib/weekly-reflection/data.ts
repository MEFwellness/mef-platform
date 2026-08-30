/**
 * The Weekly Reflection's one table (member_weekly_reflections, migration
 * 189), plus the one extra read Part 1 needs.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what,
 * and a failed read returns a safe empty value rather than throwing, since
 * every caller is on a page render the member is already waiting on.
 *
 * NO ROW EXISTS UNTIL SHE FINISHES. There is deliberately no "start"
 * write and no draft row. A page render may read; it may not insert,
 * claim, upsert or schedule (the standing rule, and the reason the
 * take-page-inserts-on-render bug was worth a whole build to remove). So
 * the recap is recomputed on every render from data that was already
 * there, and the only write in this feature happens inside the server
 * action she triggers by pressing the final button.
 *
 * THE DELIVERY RECEIPT AT THE BOTTOM OF THIS FILE IS NOT AN EXCEPTION TO
 * THAT. It writes a different table (member_weekly_reflection_deliveries,
 * migration 191), it is fired from a mounted effect on the surface that
 * genuinely displayed the reflection rather than from any render, and it
 * creates no reflection row and no draft. Nothing above it reads it, so
 * "has she completed this week" is still decided by one table.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LongitudinalSignal } from '../longitudinal-intelligence/types';
import { listMemberPatternStates } from '../longitudinal-intelligence/data';
import { readReflectionAnswers, type ReflectionAnswers } from './questions';
import { sanitizeRecap, type WeeklyReflectionRecap } from './recap';
import { recapRangeFor } from './week';

const REFLECTION_COLUMNS =
  'id, week_start, questions_version, recap, answers, completed_at, created_at';

export type WeeklyReflectionRecord = {
  id: string;
  weekStart: string;
  questionsVersion: number;
  /** Null when the stored recap could not be read under the current vocabulary. Never half a recap. */
  recap: WeeklyReflectionRecap | null;
  /** Null when the stored answers are not a complete, in-range set. Never half an answer sheet. */
  answers: ReflectionAnswers | null;
  completedAt: string | null;
  createdAt: string;
};

type ReflectionRow = {
  id: string;
  week_start: string;
  questions_version: number;
  recap: unknown;
  answers: unknown;
  completed_at: string | null;
  created_at: string;
};

function fromRow(row: ReflectionRow): WeeklyReflectionRecord {
  return {
    id: row.id,
    weekStart: row.week_start,
    questionsVersion: row.questions_version,
    recap: sanitizeRecap(row.recap),
    answers: readReflectionAnswers(row.answers),
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

/**
 * This week's reflection, with "no row" and "the read did not work" kept
 * apart.
 *
 * They are genuinely different facts and collapsing them is not safe,
 * because a failed read that looked like "not done yet" would put the
 * pop-up back in front of a member who has already finished, every login,
 * for as long as the read stayed broken. `ok: false` means: offer nothing
 * this render.
 */
export async function fetchWeeklyReflection(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<{ ok: boolean; record: WeeklyReflectionRecord | null }> {
  const { data, error } = await supabase
    .from('member_weekly_reflections')
    .select(REFLECTION_COLUMNS)
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) {
    console.error('fetchWeeklyReflection failed', error);
    return { ok: false, record: null };
  }
  if (!data) return { ok: true, record: null };
  return { ok: true, record: fromRow(data as unknown as ReflectionRow) };
}

/**
 * Every reflection this member has, newest week first. The coach panel's
 * whole data source, and the member's own history if a later build wants
 * one.
 */
export async function listWeeklyReflections(
  supabase: SupabaseClient,
  memberId: string,
  limit = 26
): Promise<WeeklyReflectionRecord[]> {
  const { data, error } = await supabase
    .from('member_weekly_reflections')
    .select(REFLECTION_COLUMNS)
    .eq('member_id', memberId)
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listWeeklyReflections failed', error);
    return [];
  }
  return ((data ?? []) as unknown as ReflectionRow[]).map(fromRow);
}

/**
 * Writes her finished reflection, if this week has no row yet.
 *
 * An insert-if-absent, matching claimWeeklyReview's and claimDailyPriority's
 * own discipline for the same reason: one reflection per week is the rule,
 * and a double submit (a slow network, a second tab, a double tap) must
 * not be able to produce a second row or overwrite the first. The unique
 * constraint on (member_id, week_start) is what actually enforces it; this
 * just turns losing the race into a normal, quiet outcome.
 *
 * "NO ERROR" IS NOT "IT WORKED". The insert returns the row it wrote, and
 * a caller that gets no row back is told so rather than being allowed to
 * assume a silent success. A write that matches no RLS policy returns zero
 * rows and no error, which is exactly the shape this guards against.
 */
export async function claimWeeklyReflection(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  questionsVersion: number,
  recap: WeeklyReflectionRecap,
  answers: ReflectionAnswers
): Promise<{ record: WeeklyReflectionRecord | null; created: boolean }> {
  const { data, error } = await supabase
    .from('member_weekly_reflections')
    .insert({
      member_id: memberId,
      week_start: weekStart,
      questions_version: questionsVersion,
      recap,
      answers,
      completed_at: new Date().toISOString(),
    })
    .select(REFLECTION_COLUMNS)
    .maybeSingle();

  if (!error && data) {
    return { record: fromRow(data as unknown as ReflectionRow), created: true };
  }

  // Either the unique constraint rejected a second submission for this
  // week, or the insert wrote nothing. Both resolve the same way: read
  // back whatever is actually there and hand that to the caller, so a
  // member who lost the race still sees the reflection that won it.
  if (error) console.error('claimWeeklyReflection insert failed', error);
  const existing = await fetchWeeklyReflection(supabase, memberId, weekStart);
  return { record: existing.record, created: false };
}

/**
 * The Daily Reset days inside the recap's seven day window.
 *
 * Scoped in the query rather than fetched wholesale and filtered, because
 * this runs on every Home render for a program member during her window.
 * `daily_checkins_current` is the same view every other consistency count
 * in the app reads, and `local_date` is already stamped in her own
 * timezone at write time, so counting these needs no date maths on read.
 */
export async function listCheckinDatesForRecap(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<string[]> {
  const range = recapRangeFor(weekStart);
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('local_date')
    .eq('user_id', memberId)
    .gte('local_date', range.from)
    .lte('local_date', range.to);

  if (error) {
    console.error('listCheckinDatesForRecap failed', error);
    return [];
  }
  return ((data ?? []) as Array<{ local_date: string }>).map((row) => row.local_date);
}

/**
 * Her already-classified signals. A pure read of member_pattern_states
 * through the module that owns it, never a recompute: this feature reads
 * conclusions, it does not draw them.
 */
export async function listPatternStatesForRecap(
  supabase: SupabaseClient,
  memberId: string
): Promise<LongitudinalSignal[]> {
  const states = await listMemberPatternStates(supabase, memberId);
  return [...states.values()];
}

// ---------------------------------------------------------------------
// The delivery receipt (migration 191).
//
// A SEPARATE RECORD, NOT PART OF THE REFLECTION. Everything above obeys
// "no row exists until she finishes". These three functions do not touch
// that table at all: they read and write
// member_weekly_reflection_deliveries, which records that something
// reached her screen and never that she attempted anything. No draft is
// created, no reflection row is created, and no read above changes its
// answer because a receipt exists.
// ---------------------------------------------------------------------

/** Which surface actually put it in front of her. Mirrors the CHECK constraint on the column. */
export const REFLECTION_PRESENTATIONS = ['popup', 'home_card'] as const;
export type ReflectionPresentation = (typeof REFLECTION_PRESENTATIONS)[number];

export function isReflectionPresentation(value: unknown): value is ReflectionPresentation {
  return (
    typeof value === 'string' && (REFLECTION_PRESENTATIONS as readonly string[]).includes(value)
  );
}

export type ReflectionDeliveryRecord = {
  weekStart: string;
  deliveredAt: string;
  presentation: string;
};

const DELIVERY_COLUMNS = 'week_start, delivered_at, presentation';

type DeliveryRow = { week_start: string; delivered_at: string; presentation: string };

function fromDeliveryRow(row: DeliveryRow): ReflectionDeliveryRecord {
  return {
    weekStart: row.week_start,
    deliveredAt: row.delivered_at,
    presentation: row.presentation,
  };
}

/**
 * This week's receipt, with "no receipt" and "the read did not work" kept
 * apart, for the same reason fetchWeeklyReflection keeps them apart.
 *
 * Collapsing them here would be worse than it is there, because the whole
 * product of this read is a sentence a coach believes: a failed read
 * reported as "no receipt" becomes "they have not opened the app since
 * Friday" on a screen, about a member who may well have.
 */
export async function fetchReflectionDelivery(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string
): Promise<{ ok: boolean; record: ReflectionDeliveryRecord | null }> {
  const { data, error } = await supabase
    .from('member_weekly_reflection_deliveries')
    .select(DELIVERY_COLUMNS)
    .eq('member_id', memberId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) {
    console.error('fetchReflectionDelivery failed', error);
    return { ok: false, record: null };
  }
  if (!data) return { ok: true, record: null };
  return { ok: true, record: fromDeliveryRow(data as unknown as DeliveryRow) };
}

/**
 * Records that the reflection reached her, if this week has no receipt
 * yet.
 *
 * ONCE PER WEEK, AND THE DATABASE IS WHAT ENFORCES IT. Home renders the
 * pop-up and the persistent card in the same pass, so two trackers fire
 * for one showing, and she can reopen the app on Saturday having seen it
 * on Friday. All of those are the same (member_id, week_start), so all of
 * them resolve to the one row that already exists. This is an
 * insert-if-absent for exactly that reason: never an upsert, because an
 * upsert would move delivered_at forward on the second showing and the
 * receipt would stop meaning "the first time it reached her".
 *
 * "NO ERROR" IS NOT "IT WORKED", so the insert returns what it wrote and a
 * caller that gets nothing back is told so rather than assuming success.
 */
export async function claimReflectionDelivery(
  supabase: SupabaseClient,
  memberId: string,
  weekStart: string,
  presentation: ReflectionPresentation
): Promise<{ record: ReflectionDeliveryRecord | null; created: boolean }> {
  const { data, error } = await supabase
    .from('member_weekly_reflection_deliveries')
    .insert({
      member_id: memberId,
      week_start: weekStart,
      presentation,
      delivered_at: new Date().toISOString(),
    })
    .select(DELIVERY_COLUMNS)
    .maybeSingle();

  if (!error && data) {
    return { record: fromDeliveryRow(data as unknown as DeliveryRow), created: true };
  }

  // Either the unique constraint rejected a second showing of the same
  // week, which is the ordinary and expected outcome, or the insert wrote
  // nothing. Both resolve the same way: read back whatever is actually
  // there, so the caller learns the truth rather than an assumption.
  const existing = await fetchReflectionDelivery(supabase, memberId, weekStart);
  if (error && !existing.record) console.error('claimReflectionDelivery insert failed', error);
  return { record: existing.record, created: false };
}
