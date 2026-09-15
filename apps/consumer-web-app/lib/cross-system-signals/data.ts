/**
 * The store's reads and writes.
 *
 * WHO CAN CALL WHAT. Every function here takes the client it should use,
 * and the caller decides which:
 *
 *   the coach's panel and the coach's own entry pass her session, so
 *     migration 240's coach policies decide what she may see and write,
 *     which is exactly the members she is actively assigned to;
 *   ingestion passes the trusted service role connection, because
 *     cross_system_signals has NO member insert policy on purpose, so a
 *     member's own submit cannot write about herself and a hand made POST
 *     from her browser cannot manufacture a signal.
 *
 * NOTHING HERE UPDATES A SIGNAL. There is no update function and there is
 * no update policy, because a stored signal is a record of what was true
 * on the day it was captured.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignalDraft, SignalRecord, SignalSide, SignalValueKind, SignalEntryMode } from './types';

const SIGNAL_COLUMNS = `
  id, member_id, signal_slug, signal_name, category_key, body_area_key, symptom_key, side,
  value_kind, value_label, value_key, value_numeric,
  source_key, source_label, source_session_id, source_question_ref, source_question_prompt, source_record_id,
  captured_on, captured_at, note, entered_by, entry_mode
`;

type SignalRow = {
  id: string;
  member_id: string;
  signal_slug: string;
  signal_name: string;
  category_key: string;
  body_area_key: string | null;
  symptom_key: string | null;
  side: string | null;
  value_kind: string;
  value_label: string;
  value_key: string | null;
  value_numeric: number | string | null;
  source_key: string;
  source_label: string;
  source_session_id: string | null;
  source_question_ref: string | null;
  source_question_prompt: string | null;
  source_record_id: string | null;
  captured_on: string;
  captured_at: string;
  note: string | null;
  entered_by: string | null;
  entry_mode: string;
};

function fromRow(row: SignalRow): SignalRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    signalSlug: row.signal_slug,
    signalName: row.signal_name,
    categoryKey: row.category_key,
    bodyAreaKey: row.body_area_key,
    symptomKey: row.symptom_key,
    side: (row.side as SignalSide | null) ?? null,
    valueKind: row.value_kind as SignalValueKind,
    valueLabel: row.value_label,
    valueKey: row.value_key,
    // Postgres numeric arrives as a string through PostgREST. Parsed once,
    // here, so no caller has to remember it.
    valueNumeric:
      row.value_numeric === null || row.value_numeric === undefined
        ? null
        : Number(row.value_numeric),
    sourceKey: row.source_key,
    sourceLabel: row.source_label,
    sourceSessionId: row.source_session_id,
    sourceQuestionRef: row.source_question_ref,
    sourceQuestionPrompt: row.source_question_prompt,
    sourceRecordId: row.source_record_id,
    capturedOn: row.captured_on,
    capturedAt: row.captured_at,
    note: row.note,
    enteredBy: row.entered_by,
    entryMode: row.entry_mode as SignalEntryMode,
  };
}

/**
 * Every signal for one member, newest day first.
 *
 * The limit is high because this is a timeline rather than a feed: the
 * coach's panel groups them and shows the latest per signal, and the older
 * rows are what the per signal history opens onto.
 */
export async function listSignalsForMember(
  supabase: SupabaseClient,
  memberId: string,
  limit = 1000
): Promise<{ ok: boolean; records: SignalRecord[] }> {
  const { data, error } = await supabase
    .from('cross_system_signals')
    .select(SIGNAL_COLUMNS)
    .eq('member_id', memberId)
    .order('captured_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listSignalsForMember failed', error);
    return { ok: false, records: [] };
  }
  return { ok: true, records: ((data ?? []) as unknown as SignalRow[]).map(fromRow) };
}

/**
 * The standardized names this member already has at least one signal for.
 *
 * Handed to every adapter as `knownSlugs`, so one that has settled can be
 * written as settled rather than quietly disappearing off her timeline.
 */
export async function knownSignalSlugs(
  supabase: SupabaseClient,
  memberId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('cross_system_signals')
    .select('signal_slug')
    .eq('member_id', memberId);
  if (error) {
    // Fail towards writing fewer rows rather than towards writing rows for
    // things she has never reported: an unreadable history is not evidence
    // that a signal exists.
    console.error('knownSignalSlugs failed', error);
    return new Set();
  }
  return new Set((data ?? []).map((row: { signal_slug: string }) => row.signal_slug));
}

/**
 * Writes drafts, skipping any whose fingerprint this member already has.
 *
 * TWO GUARDS, AND BOTH ARE NEEDED. The unique index in migration 240 is
 * the real one, and `ignoreDuplicates` on the upsert is what turns a
 * collision into a skipped row rather than a failed batch. A re-run over
 * one completed sitting therefore writes nothing and reports nothing
 * written, which is what makes the backfill safe to run twice.
 */
export async function insertSignals(
  supabase: SupabaseClient,
  memberId: string,
  drafts: readonly SignalDraft[]
): Promise<{ ok: boolean; written: number }> {
  if (drafts.length === 0) return { ok: true, written: 0 };

  const rows = drafts.map((draft) => ({
    member_id: memberId,
    signal_slug: draft.signalSlug,
    signal_name: draft.signalName,
    category_key: draft.categoryKey,
    body_area_key: draft.bodyAreaKey,
    symptom_key: draft.symptomKey,
    side: draft.side,
    value_kind: draft.valueKind,
    value_label: draft.valueLabel,
    value_key: draft.valueKey,
    value_numeric: draft.valueNumeric,
    source_key: draft.sourceKey,
    source_label: draft.sourceLabel,
    source_session_id: draft.sourceSessionId,
    source_question_ref: draft.sourceQuestionRef,
    source_question_prompt: draft.sourceQuestionPrompt,
    source_record_id: draft.sourceRecordId,
    captured_on: draft.capturedOn,
    captured_at: draft.capturedAt,
    note: draft.note,
    entered_by: null,
    entry_mode: 'ingested' as const,
    ingest_fingerprint: draft.ingestFingerprint,
  }));

  const { data, error } = await supabase
    .from('cross_system_signals')
    .upsert(rows, {
      onConflict: 'member_id, ingest_fingerprint',
      ignoreDuplicates: true,
    })
    .select('id');
  if (error) {
    console.error('insertSignals failed', error);
    return { ok: false, written: 0 };
  }
  return { ok: true, written: (data ?? []).length };
}

/** One signal a coach typed. Written through HER session, so her own policies decide. */
export type CoachSignalInsert = {
  memberId: string;
  coachId: string;
  signalSlug: string;
  signalName: string;
  categoryKey: string;
  bodyAreaKey: string | null;
  symptomKey: string | null;
  side: SignalSide;
  valueKey: string;
  valueLabel: string;
  valueNumeric: number | null;
  sourceLabel: string;
  capturedOn: string;
  capturedAt: string;
  note: string | null;
};

export async function insertCoachSignal(
  supabase: SupabaseClient,
  input: CoachSignalInsert
): Promise<{ ok: boolean; id: string | null }> {
  const { data, error } = await supabase
    .from('cross_system_signals')
    .insert({
      member_id: input.memberId,
      signal_slug: input.signalSlug,
      signal_name: input.signalName,
      category_key: input.categoryKey,
      body_area_key: input.bodyAreaKey,
      symptom_key: input.symptomKey,
      side: input.side,
      value_kind: 'coach_tap',
      value_label: input.valueLabel,
      value_key: input.valueKey,
      value_numeric: input.valueNumeric,
      source_key: 'coach_entered',
      source_label: input.sourceLabel,
      source_session_id: null,
      source_question_ref: null,
      source_question_prompt: null,
      source_record_id: null,
      captured_on: input.capturedOn,
      captured_at: input.capturedAt,
      note: input.note,
      entered_by: input.coachId,
      entry_mode: 'coach_entered',
      ingest_fingerprint: null,
    })
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('insertCoachSignal failed', error);
    return { ok: false, id: null };
  }
  return { ok: true, id: (data?.id as string | undefined) ?? null };
}

/**
 * Adds a standardized name the library did not hold yet, or leaves the
 * existing one alone.
 *
 * This is the one place the library grows from a coach's own tap. It is an
 * insert that ignores a conflict rather than an upsert, because a coach
 * composing a name that already exists must NOT rewrite its category: the
 * existing row is the reviewed one.
 */
export async function ensureSignalName(
  supabase: SupabaseClient,
  input: {
    signalSlug: string;
    displayName: string;
    categoryKey: string;
    bodyAreaKey: string | null;
    symptomKey: string | null;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('cross_system_signal_names')
    .upsert(
      {
        signal_slug: input.signalSlug,
        display_name: input.displayName,
        category_key: input.categoryKey,
        default_body_area_key: input.bodyAreaKey,
        default_symptom_key: input.symptomKey,
        search_terms: '',
        is_coach_addable: true,
      },
      { onConflict: 'signal_slug', ignoreDuplicates: true }
    );
  if (error) {
    console.error('ensureSignalName failed', error);
    return false;
  }
  return true;
}
