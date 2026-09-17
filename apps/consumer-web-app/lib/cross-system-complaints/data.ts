/**
 * Reading and writing complaints, and turning what the classifier found
 * into ordinary signal rows.
 *
 * THE SECOND HALF OF THIS FILE IS THE IMPORTANT ONE. `signalDraftsFor`
 * is what keeps the promise that there is NO SECOND SIGNAL STORE: a
 * classified complaint becomes a SignalDraft, the same shape the five
 * ingestion adapters produce, written by the same `insertSignals` through
 * the same fingerprint guard into the same table. The coach's Signals list
 * shows it beside a questionnaire answer without knowing it arrived from a
 * sentence, and the matching engine reads it as an ordinary row.
 *
 * THE LABELS COME FROM THE LIBRARY, NEVER FROM THE TEXT. A classification
 * carries a canonical slug; the display name, the category and the symptom
 * word are all read out of cross_system_signal_names. There is no string
 * transform anywhere below that turns a phrase into a name.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRowsInChunks } from '@/lib/data/pagedSelect';
import type { SignalDraft, SignalLibrary } from '@/lib/cross-system-signals/types';
import { SOURCE_MEMBER_REPORTED, SOURCE_COACH_REPORTED } from './constants';
import type {
  ComplaintClassificationDraft,
  ComplaintClassificationRecord,
  ComplaintReportDraft,
  ComplaintReportRecord,
} from './types';

/**
 * Writes the report, or finds the one already there.
 *
 * RE-READING A CHECK-IN MUST NOT WRITE THE COMPLAINT TWICE. The fingerprint
 * names the surface, the record and the field, so a second pass over the
 * same note returns the first report's id and changes nothing. Same
 * discipline, and the same reason, as the signal library's own
 * re-ingestion guard.
 */
export async function upsertComplaintReport(
  supabase: SupabaseClient,
  draft: ComplaintReportDraft
): Promise<{ id: string; alreadyExisted: boolean } | null> {
  const row = {
    member_id: draft.memberId,
    surface_key: draft.surfaceKey,
    surface_label: draft.surfaceLabel,
    raw_text: draft.rawText,
    field_ref: draft.fieldRef,
    field_prompt: draft.fieldPrompt,
    source_record_id: draft.sourceRecordId,
    reported_on: draft.reportedOn,
    reported_at: draft.reportedAt,
    author_role: draft.authorRole,
    authored_by: draft.authoredBy,
    classifier_kind: draft.classifierKind,
    classifier_revision: draft.classifierRevision,
    ingest_fingerprint: draft.ingestFingerprint,
  };

  const inserted = await supabase
    .from('cross_system_complaint_reports')
    .upsert(row, { onConflict: 'member_id, ingest_fingerprint', ignoreDuplicates: true })
    .select('id');

  if (inserted.error) {
    console.error('upsertComplaintReport failed', inserted.error);
    return null;
  }
  const first = (inserted.data ?? [])[0] as { id: string } | undefined;
  if (first) return { id: first.id, alreadyExisted: false };

  // ignoreDuplicates returns nothing when the row was already there, so ask
  // for it by the same fingerprint rather than guessing.
  if (draft.ingestFingerprint === null) return null;
  const existing = await supabase
    .from('cross_system_complaint_reports')
    .select('id')
    .eq('member_id', draft.memberId)
    .eq('ingest_fingerprint', draft.ingestFingerprint)
    .maybeSingle();
  if (existing.error || !existing.data) return null;
  return { id: (existing.data as { id: string }).id, alreadyExisted: true };
}

export async function insertClassifications(
  supabase: SupabaseClient,
  reportId: string,
  drafts: readonly ComplaintClassificationDraft[]
): Promise<boolean> {
  if (drafts.length === 0) return true;
  const rows = drafts.map((draft) => ({
    report_id: reportId,
    position: draft.position,
    signal_slug: draft.signalSlug,
    body_area_key: draft.bodyAreaKey,
    side: draft.side,
    matched_phrase: draft.matchedPhrase,
    is_resolution: draft.isResolution,
    context_key: draft.contextKey,
    frequency_key: draft.frequencyKey,
    frequency_label: draft.frequencyLabel,
    frequency_numeric: draft.frequencyNumeric,
  }));
  // scale-exempt: the classifications of one report, which the only caller caps at MAX_CLASSIFICATIONS_PER_REPORT (24), written all-or-nothing
  const { error } = await supabase
    .from('cross_system_complaint_classifications')
    .upsert(rows, { onConflict: 'report_id, position', ignoreDuplicates: true });
  if (error) {
    console.error('insertClassifications failed', error);
    return false;
  }
  return true;
}

/**
 * The fingerprint one classified complaint's signal carries.
 *
 * It names the report and the exact thing found inside it, so re-running
 * classification over one note writes nothing the second time, and two
 * different notes on the same day about the same hip each write their own
 * row. That is the behaviour the library wants: append over time.
 */
export function complaintSignalFingerprint(
  reportId: string,
  draft: ComplaintClassificationDraft
): string {
  return [
    'complaint',
    reportId,
    draft.signalSlug,
    draft.bodyAreaKey ?? 'none',
    draft.side ?? 'none',
    // A REPORT AND A RESOLUTION OF ONE SIGNAL IN ONE SENTENCE ARE TWO
    // ROWS, so they cannot share a fingerprint. Without this, "the left
    // one has settled but the right one is still sore" would write one row
    // and lose whichever half arrived second.
    draft.isResolution ? 'resolved' : 'reported',
  ].join('::');
}

/**
 * What the classifier found, as ordinary signal drafts.
 *
 * PURE. Handed a literal report, literal classifications and a literal
 * library, it returns drafts, so every case can be driven with no database
 * at all, exactly as the five adapters' own `build` halves are.
 *
 * A SLUG WITH NO LIBRARY ROW IS SKIPPED, NOT GUESSED AT. The lexicon has a
 * foreign key onto the names table so this should be unreachable, and it is
 * still handled, because the alternative is a signal labelled with its own
 * slug.
 */
export function signalDraftsFor(
  report: { id: string; rawText: string; fieldRef: string | null; fieldPrompt: string | null; surfaceKey: string; surfaceLabel: string; reportedOn: string; reportedAt: string; authorRole: 'member' | 'coach' },
  drafts: readonly ComplaintClassificationDraft[],
  library: SignalLibrary
): SignalDraft[] {
  const out: SignalDraft[] = [];
  const sourceKey = report.authorRole === 'coach' ? SOURCE_COACH_REPORTED : SOURCE_MEMBER_REPORTED;
  const source = library.sources.get(sourceKey);
  if (!source) return out;

  for (const draft of drafts) {
    const name = library.names.get(draft.signalSlug);
    if (!name) continue;

    // HER OWN AREA WINS where the sentence carried one, and the reviewed
    // name's default stands in where it did not.
    const bodyAreaKey = draft.bodyAreaKey ?? name.defaultBodyAreaKey;

    // A side is only meaningful where the area takes one. "Right bloating"
    // is not a thing, and a stray "right" in a sentence about digestion
    // must not become one.
    const area = bodyAreaKey ? library.bodyAreas.get(bodyAreaKey) : undefined;
    const side = area && area.takesSide ? draft.side : null;

    // SHE SAID HOW OFTEN, OR SHE DID NOT. A frequency word gives the row
    // the survey's own scale and its own point value, which is what makes
    // it comparable with a questionnaire answer. Without one the row is a
    // presence: the thing was reported, and there is nothing to compare.
    const hasFrequency = draft.frequencyKey !== null && draft.frequencyNumeric !== null;

    // A RESOLUTION IS WRITTEN AT NOUGHT, and that is the whole mechanism.
    // Nothing downstream needs a new concept: lib/cross-system-root/
    // evidence.ts already reads a latest row of nought behind an earlier
    // present one as RESOLVED, and lib/cross-system-patterns/match.ts
    // already refuses to count a nought as support. A resolution she has
    // never reported before produces a row that says so and no state at
    // all, which is correct: consistently saying no is not a symptom.
    //
    // The scale is the Body Systems Survey's own (migration 221), where
    // nought is Never, so this row sits on one timeline with her
    // questionnaire answers rather than on a second one.
    //
    // THE LABEL IS WRITTEN HERE AND NOT IMPORTED FROM THE COACH'S COPY
    // FILE, on purpose. This module runs inside a member's own submit, and
    // lib/cross-system-root/copy.ts holds the finding's narrative wording,
    // which no member surface may be able to reach. A stored value label is
    // a different thing from narrative copy: it is the answer itself, the
    // same way 'Reported' below is, and it has to be written where the row
    // is written. The fence test scans this file for the narrative strings
    // and finds none of them.
    const value = draft.isResolution
      ? { kind: 'scale' as const, label: 'No longer reported', key: 'never', numeric: 0 }
      : hasFrequency
        ? {
            kind: 'scale' as const,
            label: draft.frequencyLabel!,
            key: draft.frequencyKey,
            numeric: draft.frequencyNumeric,
          }
        : { kind: 'presence' as const, label: 'Reported', key: null, numeric: null };

    out.push({
      signalSlug: draft.signalSlug,
      signalName: name.displayName,
      categoryKey: name.categoryKey,
      bodyAreaKey: bodyAreaKey ?? null,
      symptomKey: name.defaultSymptomKey,
      side: side ?? null,
      valueKind: value.kind,
      valueLabel: value.label,
      valueKey: value.key,
      valueNumeric: value.numeric,
      sourceKey,
      sourceLabel: source.displayName,
      // WHERE SHE SAID IT. Copied in at capture time rather than joined at
      // read time, the same discipline as sourceLabel beside it: renaming
      // a surface next year must not rewrite what a coach was told last
      // year about where a complaint came from.
      complaintSurfaceKey: report.surfaceKey,
      complaintSurfaceLabel: report.surfaceLabel,
      sourceSessionId: null,
      sourceQuestionRef: report.fieldRef,
      // WHAT SHE WAS ANSWERING, so the coach's Signals list can print the
      // prompt above the answer exactly as it does for a questionnaire.
      sourceQuestionPrompt: report.fieldPrompt,
      // THE REPORT, so every signal points back at the sentence it came out
      // of and the coach can always read the one against the other.
      sourceRecordId: report.id,
      capturedOn: report.reportedOn,
      capturedAt: report.reportedAt,
      // HER WORDS, on the row itself. The whole sentence lives on the
      // report; this is the span that produced this particular signal.
      note: draft.matchedPhrase.slice(0, 200),
      ingestFingerprint: complaintSignalFingerprint(report.id, draft),
    });
  }
  return out;
}

/** Joins each classification to the signal row it was written into. */
export async function linkClassificationSignals(
  supabase: SupabaseClient,
  memberId: string,
  reportId: string,
  drafts: readonly ComplaintClassificationDraft[]
): Promise<void> {
  if (drafts.length === 0) return;

  const fingerprints = drafts.map((draft) => complaintSignalFingerprint(reportId, draft));
  // scale-exempt: one fingerprint per draft of one report (the only caller caps drafts at MAX_CLASSIFICATIONS_PER_REPORT, 24), unique (member_id, ingest_fingerprint)
  const { data, error } = await supabase
    .from('cross_system_signals')
    .select('id, ingest_fingerprint')
    .eq('member_id', memberId)
    .in('ingest_fingerprint', fingerprints);
  if (error || !data) return;

  const byFingerprint = new Map(
    (data as Array<{ id: string; ingest_fingerprint: string }>).map((row) => [
      row.ingest_fingerprint,
      row.id,
    ])
  );

  for (const draft of drafts) {
    const signalId = byFingerprint.get(complaintSignalFingerprint(reportId, draft));
    if (!signalId) continue;
    await supabase
      .from('cross_system_complaint_classifications')
      .update({ signal_id: signalId })
      .eq('report_id', reportId)
      .eq('position', draft.position);
  }
}

/** Marks a report as read, so a later pass does not reconsider it forever. */
export async function markLookupComplete(
  supabase: SupabaseClient,
  reportId: string,
  at: string
): Promise<void> {
  await supabase
    .from('cross_system_complaint_reports')
    .update({ lookup_completed_at: at })
    .eq('id', reportId);
}

type ReportRow = {
  id: string;
  member_id: string;
  surface_key: string;
  surface_label: string;
  raw_text: string;
  field_ref: string | null;
  field_prompt: string | null;
  source_record_id: string | null;
  reported_on: string;
  reported_at: string;
  author_role: string;
  authored_by: string | null;
  classifier_kind: string;
  classifier_revision: string;
  lookup_completed_at: string | null;
  ingest_fingerprint: string | null;
  created_at: string;
};

function toReport(row: ReportRow): ComplaintReportRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    surfaceKey: row.surface_key,
    surfaceLabel: row.surface_label,
    rawText: row.raw_text,
    fieldRef: row.field_ref,
    fieldPrompt: row.field_prompt,
    sourceRecordId: row.source_record_id,
    reportedOn: row.reported_on,
    reportedAt: row.reported_at,
    authorRole: row.author_role as 'member' | 'coach',
    authoredBy: row.authored_by,
    classifierKind: row.classifier_kind as ComplaintReportRecord['classifierKind'],
    classifierRevision: row.classifier_revision,
    lookupCompletedAt: row.lookup_completed_at,
    ingestFingerprint: row.ingest_fingerprint,
    createdAt: row.created_at,
  };
}

/** One report by id, with everything the classifier found in it. */
export async function loadComplaint(
  supabase: SupabaseClient,
  reportId: string
): Promise<{ report: ComplaintReportRecord; classifications: ComplaintClassificationRecord[] } | null> {
  const { data, error } = await supabase
    .from('cross_system_complaint_reports')
    .select('*')
    .eq('id', reportId)
    .maybeSingle();
  if (error || !data) return null;

  const classifications = await loadClassifications(supabase, [reportId]);
  return { report: toReport(data as ReportRow), classifications: classifications.get(reportId) ?? [] };
}

export async function loadClassifications(
  supabase: SupabaseClient,
  reportIds: readonly string[]
): Promise<Map<string, ComplaintClassificationRecord[]>> {
  const out = new Map<string, ComplaintClassificationRecord[]>();
  if (reportIds.length === 0) return out;
  const { rows: data, error } = await selectAllRowsInChunks<Record<string, unknown>>(reportIds, (chunk) =>
    supabase
      .from('cross_system_complaint_classifications')
      .select('*')
      .in('report_id', chunk)
      .order('position')
      .order('id', { ascending: true })
  );
  if (error) return out;

  for (const raw of data) {
    const record: ComplaintClassificationRecord = {
      id: raw.id as string,
      reportId: raw.report_id as string,
      position: raw.position as number,
      signalSlug: raw.signal_slug as string,
      bodyAreaKey: (raw.body_area_key as string | null) ?? null,
      side: (raw.side as ComplaintClassificationRecord['side']) ?? null,
      matchedPhrase: raw.matched_phrase as string,
      isResolution: (raw.is_resolution as boolean | null) ?? false,
      contextKey: (raw.context_key as string | null) ?? null,
      frequencyKey: (raw.frequency_key as string | null) ?? null,
      frequencyLabel: (raw.frequency_label as string | null) ?? null,
      frequencyNumeric: (raw.frequency_numeric as number | null) ?? null,
      signalId: (raw.signal_id as string | null) ?? null,
    };
    const held = out.get(record.reportId);
    if (held) held.push(record);
    else out.set(record.reportId, [record]);
  }
  return out;
}

/** Her recent complaints, newest first. What the coach's panel reads. */
export async function loadRecentComplaints(
  supabase: SupabaseClient,
  memberId: string,
  limit = 40
): Promise<ComplaintReportRecord[]> {
  const { data, error } = await supabase
    .from('cross_system_complaint_reports')
    .select('*')
    .eq('member_id', memberId)
    .order('reported_on', { ascending: false })
    .order('reported_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as ReportRow[]).map(toReport);
}
