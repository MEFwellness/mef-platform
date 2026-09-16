/**
 * INGESTION FOR SENTENCES. The one entry point every surface calls.
 *
 * THE SHAPE OF ONE RUN.
 *   1. build the trusted connection, or do nothing at all;
 *   2. load the lexicon and the Signal Library once;
 *   3. classify her words into canonical signals;
 *   4. write the report, the classifications and the ordinary signal rows;
 *   5. run the complaint-driven lookup against the Association Map;
 *   6. store what Root noticed.
 *
 * EVERY RUN IS BEST EFFORT AND NEVER THROWS. Her check-in is already saved
 * and already returned to her by the time any of this is called. Nothing
 * here may turn a failure to understand a sentence into a failure to
 * finish a check-in, so this file catches, logs and returns a count.
 *
 * A COMPLAINT WITH NOTHING IN IT IS STILL RECORDED. A note Root could not
 * classify is written as a report with no classifications and marked read,
 * because a coach scrolling her complaints should see what the member
 * actually wrote, including the sentences Root had no vocabulary for. That
 * is also how a missing phrase becomes visible enough to add.
 *
 * EVERY DATE NAMES ITS TIMEZONE. `reportedOn` is resolved from the MEMBER'S
 * own zone by lib/time/localDate.ts. Nothing here calls `new Date()` to
 * mean today.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { localDateStringFor } from '../time/localDate';
import { memberTimezone } from '../time/memberToday';
import { loadSignalLibrary } from '../cross-system-signals/contentData';
import { insertSignals } from '../cross-system-signals/data';
import { signalLibraryServiceRoleClient } from '../cross-system-signals/serviceRole';
import { runComplaintLookup } from '../cross-system-root/engine';
import { CLASSIFIER_REVISION, classifyComplaint } from './classify';
import { COMPLAINT_TEXT_MAX_SCAN, MAX_CLASSIFICATIONS_PER_REPORT } from './constants';
import {
  complaintSignalFingerprint,
  insertClassifications,
  linkClassificationSignals,
  markLookupComplete,
  signalDraftsFor,
  upsertComplaintReport,
} from './data';
import { loadComplaintLexicon } from './lexiconData';

export type ComplaintIngestOutcome = {
  /** The report row, when one exists. */
  reportId: string | null;
  /** How many canonical signals the classifier recognized. */
  classified: number;
  /** How many ordinary signal rows this run wrote. Zero on a re-run. */
  signalsWritten: number;
  /** How many map entries the complaint triggered. */
  findings: number;
  skipped:
    | null
    | 'no_service_role'
    | 'empty_text'
    | 'unknown_surface'
    | 'already_ingested'
    | 'write_failed';
};

const NOTHING: ComplaintIngestOutcome = {
  reportId: null,
  classified: 0,
  signalsWritten: 0,
  findings: 0,
  skipped: 'no_service_role',
};

/**
 * One piece of free text, from anywhere in the app.
 *
 * ADDING A SURFACE IS ONE CALL. A journal, a pain flow or a future
 * check-in passes its own surface key, its own record id and its own field
 * prompt, and needs nothing else: no adapter, no engine change and no new
 * table. That is the architecture requirement the brief names, and it is
 * met by this signature rather than by a promise.
 */
export async function ingestComplaint(input: {
  memberId: string;
  surfaceKey: string;
  rawText: string;
  /** The row this text lives on in its own feature's table. */
  sourceRecordId?: string | null;
  /** Which field, and the exact prompt she was answering. */
  fieldRef?: string | null;
  fieldPrompt?: string | null;
  /** The instant it was written. Her local day is resolved from it. */
  reportedAt: string;
  authorRole?: 'member' | 'coach';
  /** The coach, when she is the one who wrote it down. */
  authoredBy?: string | null;
  client?: SupabaseClient;
  /** Overridden only by tests, so a run can be driven at a known instant. */
  now?: string;
}): Promise<ComplaintIngestOutcome> {
  const supabase = input.client ?? signalLibraryServiceRoleClient();
  if (!supabase) return NOTHING;

  const text = (input.rawText ?? '').trim();
  if (text.length === 0) {
    return { ...NOTHING, skipped: 'empty_text' };
  }

  try {
    const [lexicon, library, timezone] = await Promise.all([
      loadComplaintLexicon(supabase),
      loadSignalLibrary(supabase),
      memberTimezone(supabase, input.memberId),
    ]);

    const surface = lexicon.surfaces.get(input.surfaceKey);
    if (!surface) {
      console.error('ingestComplaint: unknown surface', input.surfaceKey);
      return { ...NOTHING, skipped: 'unknown_surface' };
    }

    const authorRole = input.authorRole ?? surface.defaultAuthorRole;
    // HER day, from the instant she wrote it.
    const reportedOn = localDateStringFor(input.reportedAt, timezone);

    // NAMES THE SURFACE, THE RECORD AND THE FIELD. Re-reading one check-in
    // returns the first report rather than writing a second.
    const fingerprint = input.sourceRecordId
      ? ['complaint', input.surfaceKey, input.sourceRecordId, input.fieldRef ?? 'default'].join('::')
      : null;

    const report = await upsertComplaintReport(supabase, {
      memberId: input.memberId,
      surfaceKey: surface.surfaceKey,
      surfaceLabel: surface.displayName,
      // HER WORDS, VERBATIM. The scan cap below limits what the matcher
      // WALKS; it never truncates what is stored.
      rawText: text,
      fieldRef: input.fieldRef ?? null,
      fieldPrompt: input.fieldPrompt ?? null,
      sourceRecordId: input.sourceRecordId ?? null,
      reportedOn,
      reportedAt: input.reportedAt,
      authorRole,
      authoredBy: input.authoredBy ?? null,
      classifierKind: 'deterministic_lexicon',
      classifierRevision: CLASSIFIER_REVISION,
      ingestFingerprint: fingerprint,
    });
    if (!report) return { ...NOTHING, skipped: 'write_failed' };

    if (report.alreadyExisted) {
      return {
        reportId: report.id,
        classified: 0,
        signalsWritten: 0,
        findings: 0,
        skipped: 'already_ingested',
      };
    }

    const drafts = classifyComplaint(text.slice(0, COMPLAINT_TEXT_MAX_SCAN), lexicon).slice(
      0,
      MAX_CLASSIFICATIONS_PER_REPORT
    );

    const at = input.now ?? new Date().toISOString();

    if (drafts.length === 0) {
      // Recorded, and marked read, so the pass does not reconsider a
      // sentence it has no vocabulary for every time it runs.
      await markLookupComplete(supabase, report.id, at);
      return { reportId: report.id, classified: 0, signalsWritten: 0, findings: 0, skipped: null };
    }

    await insertClassifications(supabase, report.id, drafts);

    // THE SIGNALS ARE ORDINARY ROWS. Same table, same insert, same
    // fingerprint guard as every questionnaire adapter.
    const signalDrafts = signalDraftsFor(
      {
        id: report.id,
        rawText: text,
        fieldRef: input.fieldRef ?? null,
        fieldPrompt: input.fieldPrompt ?? null,
        surfaceLabel: surface.displayName,
        reportedOn,
        reportedAt: input.reportedAt,
        authorRole,
      },
      drafts,
      library
    );
    const written = await insertSignals(supabase, input.memberId, signalDrafts);
    await linkClassificationSignals(supabase, input.memberId, report.id, drafts);

    // THE LOOKUP, which is the whole point. The rows this complaint just
    // produced are what the Association Map is consulted about.
    const fingerprints = new Set(
      drafts.map((draft) => complaintSignalFingerprint(report.id, draft))
    );
    const lookup = await runComplaintLookup({
      memberId: input.memberId,
      reportId: report.id,
      triggerFingerprints: fingerprints,
      trigger: 'complaint_classified',
      noticedOn: reportedOn,
      noticedAt: at,
      client: supabase,
    });

    await markLookupComplete(supabase, report.id, at);

    return {
      reportId: report.id,
      classified: drafts.length,
      signalsWritten: written.written,
      findings: lookup.findings,
      skipped: null,
    };
  } catch (error) {
    console.error('ingestComplaint failed', input.surfaceKey, error);
    return { ...NOTHING, skipped: 'write_failed' };
  }
}
