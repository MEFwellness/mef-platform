/**
 * Every read and write the member side of the Health Appraisal makes.
 *
 * THROUGH HER OWN SESSION, AND NOTHING NUMERIC. Every function takes the
 * signed in member's own client, so row level security decides what exists
 * for her. The tables it touches are the assignment ledger, the shared
 * runtime's session and answer rows (which hold the response names and no
 * values) and the body map. The tables holding values and cutoffs have no
 * member policy (migration 262) and are never named here.
 *
 * "NO ERROR" IS NOT "IT WORKED". A write that matches no policy returns no
 * row and no error, so every write is read back, and a read that failed is
 * kept apart from a read that found nothing.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnifiedAssessmentDefinitionByKey } from '@/lib/assessment-foundation/repository';
import { findInProgressSession } from '@/lib/assessment-runtime';
import { HAQ_DEFINITION_ID, HAQ_KEY } from './constants';
import { sanitizeHaqAnswers, type HaqAnswers } from './walk';
import {
  HAQ_BODY_MAP_MARK_LIMIT,
  findHaqBodyRegion,
  isHaqBodyIssueType,
  isHaqBodySide,
  type HaqBodyIssueType,
  type HaqBodyMark,
  type HaqBodySide,
} from './bodyMap';

export type HaqAssignment = { id: string; createdAt: string; dueAt: string | null };

export type HaqInstanceRow = { id: string; startedAt: string; completedAt: string | null };

export type Read<T> = { ok: true; value: T } | { ok: false };

/** The runtime definition's own id, which every session row points at. */
export async function haqRuntimeDefinitionId(supabase: SupabaseClient): Promise<string | null> {
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, HAQ_KEY);
  return definition?.id ?? null;
}

/** Her open coach assignment for the HAQ, if she has one. */
export async function fetchPendingHaqAssignment(
  supabase: SupabaseClient,
  memberId: string
): Promise<Read<HaqAssignment | null>> {
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, created_at, due_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', HAQ_DEFINITION_ID)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchPendingHaqAssignment failed', error);
    return { ok: false };
  }
  if (!data) return { ok: true, value: null };
  const row = data as { id: string; created_at: string; due_at: string | null };
  return { ok: true, value: { id: row.id, createdAt: row.created_at, dueAt: row.due_at } };
}

async function fetchInstance(
  supabase: SupabaseClient,
  memberId: string,
  definitionId: string,
  status: 'in_progress' | 'completed'
): Promise<Read<HaqInstanceRow | null>> {
  const { data, error } = await supabase
    .from('unified_assessment_sessions')
    .select('id, started_at, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definitionId)
    .eq('status', status)
    .order(status === 'completed' ? 'completed_at' : 'started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchInstance failed', error);
    return { ok: false };
  }
  if (!data) return { ok: true, value: null };
  const row = data as { id: string; started_at: string; completed_at: string | null };
  return { ok: true, value: { id: row.id, startedAt: row.started_at, completedAt: row.completed_at } };
}

/** Her open instance. At most one exists, by migration 99's partial unique index. */
export function fetchOpenHaqInstance(supabase: SupabaseClient, memberId: string, definitionId: string) {
  return fetchInstance(supabase, memberId, definitionId, 'in_progress');
}

/** Her most recently completed instance. A retake is a new instance, so older ones stay exactly as they were. */
export function fetchLatestCompletedHaqInstance(
  supabase: SupabaseClient,
  memberId: string,
  definitionId: string
) {
  return fetchInstance(supabase, memberId, definitionId, 'completed');
}

/** Her answers on her open instance, as response names, keyed by question id. */
export async function readOpenHaqAnswers(
  supabase: SupabaseClient,
  memberId: string,
  definitionId: string
): Promise<HaqAnswers> {
  const session = await findInProgressSession(supabase, memberId, definitionId);
  return session ? sanitizeHaqAnswers(session.answers) : {};
}

type MarkRow = { id: string; body_location: string; body_side: string; issue_type: string };

function toMark(row: MarkRow): HaqBodyMark | null {
  if (!isHaqBodySide(row.body_side) || !isHaqBodyIssueType(row.issue_type)) return null;
  return { id: row.id, location: row.body_location, side: row.body_side, issueType: row.issue_type };
}

/** The marks on one of her instances, oldest first, so the list reads in the order she made them. */
export async function listHaqBodyMarks(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string
): Promise<HaqBodyMark[]> {
  const { data, error } = await supabase
    .from('haq_body_map_entries')
    .select('id, body_location, body_side, issue_type')
    .eq('member_id', memberId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(HAQ_BODY_MAP_MARK_LIMIT);

  if (error) {
    console.error('listHaqBodyMarks failed', error);
    return [];
  }
  return ((data ?? []) as MarkRow[]).map(toMark).filter((mark): mark is HaqBodyMark => mark !== null);
}

export type HaqMarkInput = { location: unknown; side: unknown; issueType: unknown };

export type HaqMarkWrite = { ok: true; mark: HaqBodyMark } | { ok: false; error: string };

/**
 * Adds one mark to her open instance.
 *
 * A location the view does not carry, or a category that is not one of the
 * four, is refused before anything is written. The same mark twice (same
 * area, same view, same category) hands back the one already there, so a
 * double tap never makes two. The insert policy is what refuses a closed or
 * somebody else's instance.
 */
export async function addHaqBodyMark(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  input: HaqMarkInput
): Promise<HaqMarkWrite> {
  const { location, side, issueType } = input;
  if (!isHaqBodySide(side)) return { ok: false, error: 'Unknown view.' };
  if (typeof location !== 'string' || !findHaqBodyRegion(side, location)) {
    return { ok: false, error: 'Unknown area.' };
  }
  if (!isHaqBodyIssueType(issueType)) return { ok: false, error: 'Unknown category.' };

  const existing = await listHaqBodyMarks(supabase, memberId, sessionId);
  const same = existing.find((m) => m.location === location && m.side === side && m.issueType === issueType);
  if (same) return { ok: true, mark: same };
  if (existing.length >= HAQ_BODY_MAP_MARK_LIMIT) return { ok: false, error: 'That is as many marks as the map holds.' };

  const { data, error } = await supabase
    .from('haq_body_map_entries')
    .insert({
      session_id: sessionId,
      member_id: memberId,
      body_location: location,
      body_side: side satisfies HaqBodySide,
      issue_type: issueType satisfies HaqBodyIssueType,
    })
    .select('id, body_location, body_side, issue_type')
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('addHaqBodyMark failed', error);
    return { ok: false, error: 'That mark could not be saved.' };
  }
  const mark = toMark(data as MarkRow);
  return mark ? { ok: true, mark } : { ok: false, error: 'That mark could not be saved.' };
}

/** Removes one of her marks from her open instance. The delete policy refuses a completed instance. */
export async function removeHaqBodyMark(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  markId: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof markId !== 'string' || markId.length === 0) return { ok: false, error: 'Unknown mark.' };

  const { error } = await supabase
    .from('haq_body_map_entries')
    .delete()
    .eq('id', markId)
    .eq('member_id', memberId)
    .eq('session_id', sessionId);

  if (error) {
    console.error('removeHaqBodyMark failed', error);
    return { ok: false, error: 'That mark could not be removed.' };
  }

  // Read back: a delete that matched no policy reports success and removes nothing.
  const { data: still, error: readError } = await supabase
    .from('haq_body_map_entries')
    .select('id')
    .eq('id', markId)
    .maybeSingle();
  if (readError) return { ok: false, error: 'That mark could not be removed.' };
  return still ? { ok: false, error: 'That mark could not be removed.' } : { ok: true };
}
