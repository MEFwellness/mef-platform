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
import { buildRootBriefing } from './briefing';
import { listBriefingReviews, readBriefingVisit } from './briefingData';

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
  briefing: null,
};

export async function readRootNoticed(
  supabase: SupabaseClient,
  clientId: string,
  options: {
    today?: string;
    /**
     * The coach reading, whose review actions and last visit shape the
     * briefing. Without one the briefing is built with no review state.
     */
    viewerId?: string;
  } = {}
): Promise<FullRootNoticedView> {
  const [signalRead, relationshipRead, questionnaire, coachContent, library, complaints, stored, timezone, reviewRead, lastVisitedAt] =
    await Promise.all([
      listAllSignalsForMember(supabase, clientId),
      listRelationships(supabase),
      loadQuestionnaire(supabase, clientId),
      loadCoachContent(supabase),
      loadSignalLibrary(supabase),
      loadRecentComplaints(supabase, clientId, COMPLAINT_WINDOW),
      listFindingsForMember(supabase, clientId),
      memberTimezone(supabase, clientId),
      options.viewerId
        ? listBriefingReviews(supabase, options.viewerId, clientId)
        : Promise.resolve({ ok: true, reviews: [] }),
      options.viewerId ? readBriefingVisit(supabase, options.viewerId, clientId) : Promise.resolve(null),
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

  const view = buildRootNoticedView({
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

  // THE BRIEFING, built from the same rows, the same map and the same
  // safety decision as everything above, so the two can never disagree
  // about what she reported.
  const briefing = buildRootBriefing({
    records,
    summaries: relationshipRead.summaries,
    library,
    complaints,
    classifications,
    flaggedSignals,
    questionnaire: latestSitting?.completedAt
      ? { facts: questionnaire.facts, sittings: questionnaire.sittings, content: questionnaire.content }
      : null,
    today,
    timezone,
    lastEvaluatedAt: latestEvaluation(
      stored.findings.map((finding) => finding.noticedAt),
      latestSitting?.completedAt ?? null
    ),
    reviews: reviewRead.reviews,
    lastVisitedAt,
  });

  return { ...view, briefing };
}

/** The latest instant Root evaluated anything for her: a stored finding, or her newest sitting. */
function latestEvaluation(noticedAts: readonly string[], sittingCompletedAt: string | null): string | null {
  let latest: string | null = sittingCompletedAt;
  for (const at of noticedAts) if (!latest || at > latest) latest = at;
  return latest;
}
