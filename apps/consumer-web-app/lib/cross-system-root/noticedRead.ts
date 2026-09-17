/**
 * THE ROOT NOTICED READ. Every row the section needs, then the one pure
 * builder (./noticedView.ts). Coach side only.
 *
 * WHY IT IS NOT INSIDE THE SERVER ACTION. The action proves who is asking.
 * This reads, under whatever connection it is handed, so a test can run the
 * whole read against a stand-in database and see exactly what a coach
 * opening this client would see, without a request to hang it on.
 *
 * READS ONLY. A render never decides anything, and nothing here inserts,
 * updates or schedules. Findings are written by the explicit events in
 * ./engine.ts and ./questionnaireEngine.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listAllSignalsForMember } from '@/lib/cross-system-signals/data';
import { loadSignalLibrary } from '@/lib/cross-system-signals/contentData';
import { judgeRecords, loadQuestionnaire } from '@/lib/cross-system-signals/questionnaireFacts';
import { listRelationships } from '@/lib/cross-system-relationships/data';
import { loadCoachContent } from '@/lib/body-systems/contentData';
import { flaggedSittingIds, redFlaggedSignalIds } from '@/lib/cross-system-patterns/safety';
import { loadClassifications, loadRecentComplaints } from '@/lib/cross-system-complaints/data';
import { localDateStringFor } from '@/lib/time/localDate';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { listFindingsForMember } from './data';
import { complaintDrivenEntries } from './lookup';
import { buildRootNoticedView, type FullRootNoticedView } from './noticedView';

/** How many of her most recent complaints the section reads back. */
export const COMPLAINT_WINDOW = 20;

export const EMPTY_ROOT_NOTICED_VIEW: FullRootNoticedView = {
  findings: [],
  convergences: [],
  findingCount: 0,
  suppressedCount: 0,
  complaintCount: 0,
  unclassifiedCount: 0,
  mapEntryCount: 0,
  questionnaire: null,
};

export async function readRootNoticed(
  supabase: SupabaseClient,
  clientId: string,
  options: { today?: string } = {}
): Promise<FullRootNoticedView> {
  const [signalRead, relationshipRead, questionnaire, coachContent, library, complaints, stored, timezone] =
    await Promise.all([
      listAllSignalsForMember(supabase, clientId),
      listRelationships(supabase),
      loadQuestionnaire(supabase, clientId),
      loadCoachContent(supabase),
      loadSignalLibrary(supabase),
      loadRecentComplaints(supabase, clientId, COMPLAINT_WINDOW),
      listFindingsForMember(supabase, clientId),
      memberTimezone(supabase, clientId),
    ]);
  // HER today, from her own zone, as data. Handed in by a test so a run can
  // be pinned to a known day.
  const today = options.today ?? todaysLocalDate(timezone);

  const latestSitting = questionnaire.sittings.find(
    (record) => record.id === questionnaire.facts.latestSittingId
  );
  if (complaints.length === 0 && !latestSitting) {
    return {
      ...EMPTY_ROOT_NOTICED_VIEW,
      mapEntryCount: complaintDrivenEntries(relationshipRead.summaries).length,
    };
  }

  const classifications = await loadClassifications(
    supabase,
    complaints.map((report) => report.id)
  );

  // HER SURVEY ANSWERS, JUDGED BY THE SURVEY RULE, before any lookup reads
  // them, so the same rows mean the same thing in every card below.
  const records = judgeRecords(signalRead.records, questionnaire);

  // THE SAFETY OVERRIDE IS RESOLVED BEFORE ANY FINDING IS BUILT, and it is
  // the survey's own layer that decides which sittings fired.
  const flaggedSittings = flaggedSittingIds(
    questionnaire.sittings.map((record) => ({
      sittingId: record.id,
      redFlagAnswers: record.redFlagAnswers,
    })),
    questionnaire.content.redFlags,
    questionnaire.content.safetyLevels
  );
  const flaggedSignals = redFlaggedSignalIds(records, flaggedSittings);

  return buildRootNoticedView({
    records,
    summaries: relationshipRead.summaries,
    library,
    complaints,
    classifications,
    stored: stored.findings,
    flaggedSignals,
    questionnaire: latestSitting?.completedAt
      ? {
          facts: questionnaire.facts,
          sittings: questionnaire.sittings,
          content: questionnaire.content,
          associationTitles: new Map(
            coachContent.library.map((entry) => [entry.entryCode, entry.title])
          ),
          today,
          sittingOn: localDateStringFor(latestSitting.completedAt, timezone),
        }
      : null,
  });
}
