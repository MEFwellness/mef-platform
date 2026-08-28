/**
 * Root Movement, Level 1 — database access.
 *
 * Pure functions taking a SupabaseClient, same shape as
 * lib/movement/data.ts and lib/exercise-library/*: RLS (migration 153)
 * decides who may read and write what, and nothing here re-implements an
 * authorization check that the database already makes.
 *
 * Reads fail CLOSED. Every function below returns an empty list, a null,
 * or false when its query errors, and never throws. Before migration 153
 * is applied to an environment, the tables do not exist, every query
 * errors, and the whole feature renders as "no sessions available"
 * instead of crashing a screen. That is deliberate: it is what lets this
 * ship dormant.
 *
 * The exercise itself is NOT duplicated here. A slot carries only
 * (provider, external_id), and the name, poster and cues are read from
 * the catalog this product already has, through the same helpers the
 * Exercise Library uses.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  MemberMovementSessionRun,
  MovementSessionDetail,
  MovementSessionSlotWithExercise,
  MovementSessionSummary,
  MovementSessionTemplate,
  MovementSessionTemplateSlot,
} from '@mef/shared-types-contracts';
import { getExercisesByExternalIds } from '../your-move/catalog';
import { getMemberExerciseCues } from '../exercise-library/metadata';
import { getExtractedPosterMap, toPublicMediaUrl } from '../your-move/posters';
import { estimateSessionSeconds } from './duration';

const TEMPLATE_COLUMNS =
  'id, session_key, name, description, target_duration_min_minutes, target_duration_max_minutes, sort_order, is_active';

const SLOT_COLUMNS =
  'id, slot_order, provider, external_id, prescription_type, prescription_seconds, prescription_reps, rest_seconds';

/** The six, in the order they are shown. Retired templates are never offered. */
export async function listActiveSessionTemplates(
  supabase: SupabaseClient
): Promise<MovementSessionTemplate[]> {
  const { data, error } = await supabase
    .from('movement_session_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('listActiveSessionTemplates failed', error);
    return [];
  }
  return (data as MovementSessionTemplate[]) ?? [];
}

export async function getSessionTemplate(
  supabase: SupabaseClient,
  sessionKey: string
): Promise<MovementSessionTemplate | null> {
  const { data, error } = await supabase
    .from('movement_session_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('session_key', sessionKey)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('getSessionTemplate failed', error);
    return null;
  }
  return (data as MovementSessionTemplate | null) ?? null;
}

export async function listTemplateSlots(
  supabase: SupabaseClient,
  templateId: string
): Promise<MovementSessionTemplateSlot[]> {
  const { data, error } = await supabase
    .from('movement_session_template_slots')
    .select(SLOT_COLUMNS)
    .eq('template_id', templateId)
    .order('slot_order', { ascending: true });

  if (error) {
    console.error('listTemplateSlots failed', error);
    return [];
  }
  return (data as MovementSessionTemplateSlot[]) ?? [];
}

/**
 * The list screen: each of the six with how many exercises it holds.
 *
 * ONE round trip, not two. It used to read the templates, wait, and then
 * read the slots with `.in('template_id', ...)` built from the first
 * answer, so the second query could not start until the first came back.
 * The slots are embedded on the templates query instead, over the real
 * foreign key (`movement_session_template_slots_template_id_fkey`), which
 * is the same two tables and the same rows in one request. C7
 * (2026-08-27), the cheap half: this is not what made a cold load slow,
 * but a dependent round trip on the way to a six-row screen is not worth
 * keeping either.
 *
 * Still fails closed. Before migration 153 is applied the tables do not
 * exist, the query errors, and the screen renders its honest empty state.
 */
export async function listSessionSummaries(
  supabase: SupabaseClient
): Promise<MovementSessionSummary[]> {
  const { data, error } = await supabase
    .from('movement_session_templates')
    .select(`${TEMPLATE_COLUMNS}, movement_session_template_slots(id)`)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('listSessionSummaries failed', error);
    return [];
  }

  const rows =
    (data as (MovementSessionTemplate & {
      movement_session_template_slots: { id: string }[] | null;
    })[]) ?? [];

  return rows.map((row) => {
    const { movement_session_template_slots: slots, ...template } = row;
    return { template, exerciseCount: slots?.length ?? 0 };
  });
}

/**
 * One session, with every slot resolved to the catalog fields the player
 * renders. Returns null when the session key is unknown or retired, and
 * when the template exists but has no slots at all (an empty session is
 * not something to hand a member).
 *
 * A slot whose exercise has vanished from the catalog is DROPPED rather
 * than rendered as a blank card. That can only happen after a catalog
 * refresh removes an exercise a template still points at, which the
 * integrity test exists to catch first.
 */
export async function getSessionDetail(
  supabase: SupabaseClient,
  sessionKey: string
): Promise<MovementSessionDetail | null> {
  const template = await getSessionTemplate(supabase, sessionKey);
  if (!template) return null;

  const slots = await listTemplateSlots(supabase, template.id);
  if (slots.length === 0) return null;

  const externalIds = slots.map((slot) => slot.external_id);

  // None of these three depends on the others' results.
  const [catalog, cues, posters] = await Promise.all([
    getExercisesByExternalIds(supabase, externalIds),
    // The member-facing cue read (migration 170's view), not the full
    // curation layer — this runs under the member's own session and she
    // has no row of mef_exercise_metadata.
    getMemberExerciseCues(supabase, externalIds),
    getExtractedPosterMap(supabase, externalIds),
  ]);

  const resolved: MovementSessionSlotWithExercise[] = [];
  for (const slot of slots) {
    const exercise = catalog.get(slot.external_id);
    if (!exercise) continue;
    const poster = posters.get(slot.external_id);
    resolved.push({
      ...slot,
      name: exercise.name,
      primaryMuscle: exercise.primary_muscle,
      category: exercise.category,
      posterUrl: poster ? toPublicMediaUrl(poster.storage_path) : null,
      // Unlike the Exercise Library's normalizer, cues are carried even
      // when the exercise HAS video. Here they are the fallback the
      // player shows if a video will not load mid-session, which is
      // exactly the moment a member most needs to be told what to do.
      cues: cues.get(slot.external_id) ?? [],
    });
  }

  if (resolved.length === 0) return null;

  return {
    template,
    slots: resolved,
    estimatedSeconds: estimateSessionSeconds(resolved),
  };
}

/**
 * Starts a run. Every start is its own row: a member may repeat any
 * session any day, as many times as she likes, and nothing here looks
 * for or cares about a previous one.
 */
export async function insertSessionRun(
  supabase: SupabaseClient,
  memberId: string,
  sessionKey: string
): Promise<MemberMovementSessionRun | null> {
  const { data, error } = await supabase
    .from('member_movement_session_runs')
    .insert({ member_id: memberId, session_key: sessionKey })
    .select('id, member_id, session_key, started_at, completed_at, skipped_exercise_ids')
    .single();

  if (error) {
    console.error('insertSessionRun failed', error);
    return null;
  }
  return data as MemberMovementSessionRun;
}

export async function getSessionRun(
  supabase: SupabaseClient,
  memberId: string,
  runId: string
): Promise<MemberMovementSessionRun | null> {
  const { data, error } = await supabase
    .from('member_movement_session_runs')
    .select('id, member_id, session_key, started_at, completed_at, skipped_exercise_ids')
    .eq('id', runId)
    .eq('member_id', memberId)
    .maybeSingle();

  if (error) {
    console.error('getSessionRun failed', error);
    return null;
  }
  return (data as MemberMovementSessionRun | null) ?? null;
}

/**
 * Records one skip. Idempotent by exercise id: tapping skip twice on the
 * same exercise (a double tap, a back-and-forward) leaves one entry, so
 * the skip count on a completion is a count of exercises and not of
 * taps.
 */
export async function appendSessionRunSkip(
  supabase: SupabaseClient,
  memberId: string,
  runId: string,
  externalId: string
): Promise<string[] | null> {
  const run = await getSessionRun(supabase, memberId, runId);
  if (!run) return null;
  if (run.skipped_exercise_ids.includes(externalId)) return run.skipped_exercise_ids;

  const next = [...run.skipped_exercise_ids, externalId];
  const { error } = await supabase
    .from('member_movement_session_runs')
    .update({ skipped_exercise_ids: next, updated_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('member_id', memberId);

  if (error) {
    console.error('appendSessionRunSkip failed', error);
    return null;
  }
  return next;
}

/**
 * Her most recent COMPLETION of each session, as an ISO timestamp, keyed by
 * session key. Sessions she has never finished are simply absent.
 *
 * Read by the coaching engine's enriched fallback, which offers the
 * least-recently-completed session. A started-and-abandoned run is not a
 * completion and does not count, which is why this filters on completed_at
 * rather than reading every run.
 *
 * Fails closed to an empty map like every other read in this file. An empty
 * map means every session looks never-completed, and the fallback then
 * offers the first in the seeded order, which is a fine answer rather than
 * a broken one.
 */
export async function getSessionLastCompletedMap(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('member_movement_session_runs')
    .select('session_key, completed_at')
    .eq('member_id', memberId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false });

  if (error) {
    console.error('getSessionLastCompletedMap failed', error);
    return new Map();
  }

  const latest = new Map<string, string>();
  for (const row of (data as { session_key: string; completed_at: string }[]) ?? []) {
    // Newest first, so the first sighting of a key is its latest completion.
    if (!latest.has(row.session_key)) latest.set(row.session_key, row.completed_at);
  }
  return latest;
}

/**
 * Marks a run finished. Only ever sets completed_at when it is still
 * null, so a re-submitted completion cannot move the timestamp or fire a
 * second completion event.
 */
export async function completeSessionRun(
  supabase: SupabaseClient,
  memberId: string,
  runId: string
): Promise<MemberMovementSessionRun | null> {
  const { data, error } = await supabase
    .from('member_movement_session_runs')
    .update({ completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('member_id', memberId)
    .is('completed_at', null)
    .select('id, member_id, session_key, started_at, completed_at, skipped_exercise_ids')
    .maybeSingle();

  if (error) {
    console.error('completeSessionRun failed', error);
    return null;
  }
  return (data as MemberMovementSessionRun | null) ?? null;
}
