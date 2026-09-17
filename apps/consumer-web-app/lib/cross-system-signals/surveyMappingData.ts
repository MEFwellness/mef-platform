/**
 * Reading and revising the Body Systems Survey question to signal mapping.
 *
 * COACH ONLY, THROUGH HER OWN SESSION. Every write here runs under the
 * coach's session, so migration 258's policies decide: she may append a
 * revision signed by herself and move the head of a survey question's
 * mapping, and nothing else. There is no service role anywhere in this
 * file, so every revision has an author.
 *
 * AN EDIT IS A NEW REVISION, AND THE ORDER IS THE SAFETY. The revision is
 * written first and the head moved last, so a head update that fails leaves
 * the head describing the last revision it really reflects, with the newer
 * revision stored beside it for a retry. "No error" is not "it worked": both
 * writes read their row back, because a write that matched no policy returns
 * no row and no error.
 *
 * EVERY READ IS PAGED. The dictionary and its revisions both grow with the
 * library, and a full read of either is the read the thousand row cap cuts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '../data/pagedSelect';
import { SOURCE_BODY_SYSTEMS } from './constants';
import type { SurveyMappingEdit, SurveyMappingHead, SurveyMappingRevision } from './surveyMapping';

export async function listSurveyMappingHeads(
  supabase: SupabaseClient
): Promise<{ ok: boolean; heads: SurveyMappingHead[] }> {
  const { ok, rows, error } = await selectAllRows<Record<string, unknown>>(() =>
    supabase
      .from('cross_system_signal_source_map')
      .select('external_key, signal_slug, body_area_key, is_active, revision_number, updated_at')
      .eq('source_key', SOURCE_BODY_SYSTEMS)
      .eq('external_kind', 'question')
      .order('external_key', { ascending: true })
  );
  if (!ok) {
    console.error('listSurveyMappingHeads failed', error);
    return { ok: false, heads: [] };
  }
  return {
    ok: true,
    heads: rows.map((row) => ({
      questionRef: row.external_key as string,
      signalSlug: row.signal_slug as string,
      bodyAreaKey: (row.body_area_key as string | null) ?? null,
      isActive: Boolean(row.is_active),
      revisionNumber: Number(row.revision_number ?? 1),
      updatedAt: (row.updated_at as string | null) ?? null,
    })),
  };
}

export async function listSurveyMappingRevisions(
  supabase: SupabaseClient
): Promise<{ ok: boolean; revisions: SurveyMappingRevision[] }> {
  const { ok, rows, error } = await selectAllRows<Record<string, unknown>>(() =>
    supabase
      .from('cross_system_signal_source_map_revisions')
      .select(
        'external_key, revision_number, signal_slug, body_area_key, is_active, change_note, changed_by, changed_at'
      )
      .eq('source_key', SOURCE_BODY_SYSTEMS)
      .eq('external_kind', 'question')
      .order('external_key', { ascending: true })
      .order('revision_number', { ascending: true })
  );
  if (!ok) {
    console.error('listSurveyMappingRevisions failed', error);
    return { ok: false, revisions: [] };
  }
  return {
    ok: true,
    revisions: rows.map((row) => ({
      questionRef: row.external_key as string,
      revisionNumber: Number(row.revision_number),
      signalSlug: row.signal_slug as string,
      bodyAreaKey: (row.body_area_key as string | null) ?? null,
      isActive: Boolean(row.is_active),
      changeNote: (row.change_note as string | null) ?? null,
      changedBy: (row.changed_by as string | null) ?? null,
      changedAt: row.changed_at as string,
    })),
  };
}

/** The one head a revision is about, read fresh so the next number is the stored one. */
export async function readSurveyMappingHead(
  supabase: SupabaseClient,
  questionRef: string
): Promise<SurveyMappingHead | null> {
  const { data, error } = await supabase
    .from('cross_system_signal_source_map')
    .select('external_key, signal_slug, body_area_key, is_active, revision_number, updated_at')
    .eq('source_key', SOURCE_BODY_SYSTEMS)
    .eq('external_kind', 'question')
    .eq('external_key', questionRef)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('readSurveyMappingHead failed', error);
    return null;
  }
  return {
    questionRef: data.external_key as string,
    signalSlug: data.signal_slug as string,
    bodyAreaKey: (data.body_area_key as string | null) ?? null,
    isActive: Boolean(data.is_active),
    revisionNumber: Number(data.revision_number ?? 1),
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

export async function writeSurveyMappingRevision(
  supabase: SupabaseClient,
  input: { edit: SurveyMappingEdit; revisionNumber: number; coachId: string; at: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const revision = await supabase
    .from('cross_system_signal_source_map_revisions')
    .insert({
      source_key: SOURCE_BODY_SYSTEMS,
      external_kind: 'question',
      external_key: input.edit.questionRef,
      revision_number: input.revisionNumber,
      signal_slug: input.edit.signalSlug,
      body_area_key: input.edit.bodyAreaKey,
      is_active: input.edit.isActive,
      change_note: input.edit.note,
      changed_by: input.coachId,
      changed_at: input.at,
    })
    .select('id')
    .maybeSingle();
  if (revision.error || !revision.data) {
    console.error('writeSurveyMappingRevision revision insert failed', revision.error);
    return {
      ok: false,
      error: 'That version could not be saved. Somebody may have changed this mapping at the same moment. Reload and try again.',
    };
  }

  const head = await supabase
    .from('cross_system_signal_source_map')
    .update({
      signal_slug: input.edit.signalSlug,
      body_area_key: input.edit.bodyAreaKey,
      is_active: input.edit.isActive,
      revision_number: input.revisionNumber,
      updated_by: input.coachId,
      updated_at: input.at,
    })
    .eq('source_key', SOURCE_BODY_SYSTEMS)
    .eq('external_kind', 'question')
    .eq('external_key', input.edit.questionRef)
    .eq('revision_number', input.revisionNumber - 1)
    .select('external_key')
    .maybeSingle();
  if (head.error || !head.data) {
    console.error('writeSurveyMappingRevision head update failed', head.error);
    return {
      ok: false,
      error: 'The new version was stored but the mapping in use did not move. Reload and try again.',
    };
  }
  return { ok: true };
}
