/**
 * Rooted Reset Fuel Pattern Assessment, Build 4 — the one place the
 * experiment's rows are read and written.
 *
 * SAME DISCIPLINE AS lib/fuel-pattern/meals/data.ts. Pure functions
 * taking a SupabaseClient, RLS as the real authorization boundary, and
 * every write reads its row back, because a write matching no policy
 * returns zero rows and no error, and a silent success is worse than a
 * failure.
 *
 * STARTING A RUN IS A READ THEN INSERT, WITH AN INDEX UNDERNEATH IT.
 * A member tapping START twice on a slow connection is a race rather than
 * a mistake, so migration 238 carries a partial unique index on
 * (member_id) where archived_at is null, and the duplicate case is
 * treated as the success it is rather than reported as a failure.
 *
 * NOTHING HERE DECIDES A DATE. Every calendar day this file stores comes
 * in as an argument, resolved by the caller from her own timezone through
 * lib/time/memberToday.ts. A data layer that called new Date() would
 * store UTC's day for a member who is not living in it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FPA_CLARITY_ANSWERS,
  FPA_ENERGY_ANSWERS,
  FPA_HUNGER_ANSWERS,
  type FpaClarityAnswer,
  type FpaEnergyAnswer,
  type FpaExperimentArchiveReason,
  type FpaExperimentCheck,
  type FpaHungerAnswer,
} from './types';
import { FPA_MEAL_TYPES } from '../meals/types';
import type { FuelPattern } from '../types';

/** One run, exactly as the row stores it. Status is derived, never read from here. */
export type FpaExperimentRow = {
  id: string;
  memberId: string;
  sessionId: string | null;
  pattern: FuelPattern;
  startedOn: string;
  acknowledgedAt: string | null;
  archivedAt: string | null;
  archivedReason: FpaExperimentArchiveReason | null;
  createdAt: string;
};

const RUN_COLUMNS =
  'id, member_id, session_id, pattern, started_on, acknowledged_at, archived_at, archived_reason, created_at';

const CHECK_COLUMNS =
  'id, logged_on, energy, hunger, clarity, meal_type, meal_id, created_at';

function toRun(row: Record<string, unknown>): FpaExperimentRow {
  return {
    id: row.id as string,
    memberId: row.member_id as string,
    sessionId: (row.session_id as string | null) ?? null,
    pattern: row.pattern as FuelPattern,
    // A `date` column comes back as YYYY-MM-DD already. Sliced anyway so
    // a driver that ever widened it to a timestamp cannot quietly turn
    // the day counter into a string comparison against a longer string.
    startedOn: String(row.started_on).slice(0, 10),
    acknowledgedAt: (row.acknowledged_at as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    archivedReason: (row.archived_reason as FpaExperimentArchiveReason | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function toCheck(row: Record<string, unknown>): FpaExperimentCheck {
  return {
    id: row.id as string,
    loggedOn: String(row.logged_on).slice(0, 10),
    energy: row.energy as FpaEnergyAnswer,
    hunger: row.hunger as FpaHungerAnswer,
    clarity: row.clarity as FpaClarityAnswer,
    mealType: (row.meal_type as string | null) ?? null,
    mealId: (row.meal_id as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export function isFpaEnergyAnswer(value: unknown): value is FpaEnergyAnswer {
  return typeof value === 'string' && (FPA_ENERGY_ANSWERS as readonly string[]).includes(value);
}

export function isFpaHungerAnswer(value: unknown): value is FpaHungerAnswer {
  return typeof value === 'string' && (FPA_HUNGER_ANSWERS as readonly string[]).includes(value);
}

export function isFpaClarityAnswer(value: unknown): value is FpaClarityAnswer {
  return typeof value === 'string' && (FPA_CLARITY_ANSWERS as readonly string[]).includes(value);
}

export function isFpaCheckMealType(value: unknown): value is string {
  return typeof value === 'string' && (FPA_MEAL_TYPES as readonly string[]).includes(value);
}

/** Her one live run, or null. A read, and only ever a read. */
export async function findLiveFpaExperiment(
  supabase: SupabaseClient,
  memberId: string
): Promise<FpaExperimentRow | null> {
  const { data, error } = await supabase
    .from('fuel_experiments')
    .select(RUN_COLUMNS)
    .eq('member_id', memberId)
    .is('archived_at', null)
    .order('started_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('findLiveFpaExperiment failed', error);
    return null;
  }
  return data ? toRun(data as Record<string, unknown>) : null;
}

/** Every run she has ever had, newest first. The coach's list. */
export async function listFpaExperiments(
  supabase: SupabaseClient,
  memberId: string
): Promise<FpaExperimentRow[]> {
  const { data, error } = await supabase
    .from('fuel_experiments')
    .select(RUN_COLUMNS)
    .eq('member_id', memberId)
    .order('started_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listFpaExperiments failed', error);
    return [];
  }
  return (data ?? []).map((row) => toRun(row as Record<string, unknown>));
}

/** One run's checks, oldest first, which is the order the insight engine replays them in. */
export async function listFpaExperimentChecks(
  supabase: SupabaseClient,
  experimentId: string
): Promise<FpaExperimentCheck[]> {
  const { data, error } = await supabase
    .from('fuel_experiment_checks')
    .select(CHECK_COLUMNS)
    .eq('experiment_id', experimentId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('listFpaExperimentChecks failed', error);
    return [];
  }
  return (data ?? []).map((row) => toCheck(row as Record<string, unknown>));
}

/** Every check across a set of runs, in one round trip. The coach reads them all. */
export async function listFpaExperimentChecksForRuns(
  supabase: SupabaseClient,
  experimentIds: readonly string[]
): Promise<Map<string, FpaExperimentCheck[]>> {
  const grouped = new Map<string, FpaExperimentCheck[]>();
  if (experimentIds.length === 0) return grouped;

  const { data, error } = await supabase
    .from('fuel_experiment_checks')
    .select(`experiment_id, ${CHECK_COLUMNS}`)
    .in('experiment_id', [...experimentIds])
    .order('created_at', { ascending: true });

  if (error) {
    console.error('listFpaExperimentChecksForRuns failed', error);
    return grouped;
  }
  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const key = record.experiment_id as string;
    const list = grouped.get(key) ?? [];
    list.push(toCheck(record));
    grouped.set(key, list);
  }
  return grouped;
}

/**
 * Start a run on a given calendar day.
 *
 * The caller archives anything live first when that is what it means to
 * do; this refuses to create a second live run rather than deciding on
 * its own that an existing one should end. If the insert loses a race
 * against her own second tap, the run that did land is returned, because
 * that is the outcome she asked for either way.
 */
export async function startFpaExperiment(
  supabase: SupabaseClient,
  memberId: string,
  input: { pattern: FuelPattern; startedOn: string; sessionId: string | null }
): Promise<FpaExperimentRow | null> {
  const live = await findLiveFpaExperiment(supabase, memberId);
  if (live) return live;

  const { data, error } = await supabase
    .from('fuel_experiments')
    .insert({
      member_id: memberId,
      session_id: input.sessionId,
      pattern: input.pattern,
      started_on: input.startedOn,
    })
    .select(RUN_COLUMNS)
    .maybeSingle();

  if (error) {
    const settled = await findLiveFpaExperiment(supabase, memberId);
    if (settled) return settled;
    console.error('startFpaExperiment failed', error);
    return null;
  }
  if (!data) {
    console.error('startFpaExperiment wrote no row', { memberId });
    return null;
  }
  return toRun(data as Record<string, unknown>);
}

/** She pressed DONE. Idempotent: a second press finds the stamp already there. */
export async function acknowledgeFpaExperiment(
  supabase: SupabaseClient,
  memberId: string,
  experimentId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('fuel_experiments')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', experimentId)
    .eq('member_id', memberId)
    .is('acknowledged_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('acknowledgeFpaExperiment failed', error);
    return false;
  }
  if (data) return true;

  // No row came back, which is either "already acknowledged" or "not
  // hers". Those are not the same answer, so the difference is read
  // rather than assumed.
  const { data: existing } = await supabase
    .from('fuel_experiments')
    .select('acknowledged_at')
    .eq('id', experimentId)
    .eq('member_id', memberId)
    .maybeSingle();
  return Boolean(existing?.acknowledged_at);
}

/**
 * Put a run away. Its checks are never deleted and the coach still sees
 * every one of them; archiving is what makes room for the next run.
 */
export async function archiveFpaExperiment(
  supabase: SupabaseClient,
  memberId: string,
  experimentId: string,
  reason: FpaExperimentArchiveReason
): Promise<boolean> {
  const { data, error } = await supabase
    .from('fuel_experiments')
    .update({ archived_at: new Date().toISOString(), archived_reason: reason })
    .eq('id', experimentId)
    .eq('member_id', memberId)
    .is('archived_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('archiveFpaExperiment failed', error);
    return false;
  }
  if (data) return true;

  const { data: existing } = await supabase
    .from('fuel_experiments')
    .select('archived_at')
    .eq('id', experimentId)
    .eq('member_id', memberId)
    .maybeSingle();
  return Boolean(existing?.archived_at);
}

/** One quick check. Three answers, and the tag when she gave one. */
export async function recordFpaExperimentCheck(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    experimentId: string;
    loggedOn: string;
    energy: FpaEnergyAnswer;
    hunger: FpaHungerAnswer;
    clarity: FpaClarityAnswer;
    mealType: string | null;
    mealId: string | null;
  }
): Promise<FpaExperimentCheck | null> {
  const { data, error } = await supabase
    .from('fuel_experiment_checks')
    .insert({
      experiment_id: input.experimentId,
      member_id: memberId,
      logged_on: input.loggedOn,
      energy: input.energy,
      hunger: input.hunger,
      clarity: input.clarity,
      meal_type: input.mealType,
      meal_id: input.mealId,
    })
    .select(CHECK_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('recordFpaExperimentCheck failed', error);
    return null;
  }
  if (!data) {
    console.error('recordFpaExperimentCheck wrote no row', { memberId });
    return null;
  }
  return toCheck(data as Record<string, unknown>);
}

/**
 * THE RETAKE RULE, AT THE DATABASE.
 *
 * A run belongs to the sitting she started it from. When she FINISHES a
 * new sitting, the run belonging to any other sitting has been overtaken
 * by a reading it was not testing, so it is put away with everything in
 * it and her new result page offers a fresh start. Nothing is deleted.
 *
 * It is keyed on the session rather than on a timestamp so that it is
 * idempotent: completing the same sitting twice, which a Server Action
 * re-render makes ordinary, finds nothing left to archive the second
 * time. A run started from THIS sitting is left exactly alone.
 */
export async function archiveFpaExperimentsFromOtherSittings(
  supabase: SupabaseClient,
  memberId: string,
  currentSessionId: string
): Promise<boolean> {
  const live = await findLiveFpaExperiment(supabase, memberId);
  if (!live || live.sessionId === currentSessionId) return true;
  return archiveFpaExperiment(supabase, memberId, live.id, 'retake');
}
