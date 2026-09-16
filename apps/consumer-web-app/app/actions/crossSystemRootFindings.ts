'use server';

/**
 * The Root Noticed section's one read, and the two things a coach may write
 * about a finding.
 *
 * COACH ONLY, AND CHECKED HERE AS WELL AS IN THE DATABASE. Every function
 * below establishes the caller as a coach or an administrator before it
 * reads anything, then asks lib/staff/testAccounts.ts whether this member
 * may be shown to this viewer at all. Row level security is the real
 * boundary: migration 246 gives the complaint, classification and finding
 * tables no member policy of any kind.
 *
 * NOTHING HERE IS REACHABLE FROM A MEMBER SURFACE, and nothing here runs on
 * a render in the sense that matters: the read COMPUTES, it does not write.
 * Findings are written by the explicit events in
 * lib/cross-system-complaints/service.ts and
 * lib/cross-system-root/engine.ts, never from here, so opening a client's
 * page cannot manufacture one and a Next prefetch cannot either.
 *
 * WHY THE EVIDENCE IS RECOMPUTED RATHER THAN READ BACK. One source of truth
 * per number. The stored finding records what Root noticed on the day and
 * carries the coach's own reviewed state; what is IN each area is the pure
 * lookup's answer about her rows as they stand right now. Drawing the
 * evidence from the stored rows would be a second account of the same fact,
 * and a questionnaire she answered since would leave the first one wrong.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { listSignalsForMember } from '@/lib/cross-system-signals/data';
import { loadSignalLibrary } from '@/lib/cross-system-signals/contentData';
import { listRelationships } from '@/lib/cross-system-relationships/data';
import { loadMemberContent } from '@/lib/body-systems/contentData';
import { listBodySystemsSessions } from '@/lib/body-systems/data';
import { flaggedSittingIds, redFlaggedSignalIds } from '@/lib/cross-system-patterns/safety';
import {
  loadClassifications,
  loadRecentComplaints,
} from '@/lib/cross-system-complaints/data';
import {
  convergentAreas,
  complaintDrivenEntries,
  lookupForComplaint,
} from '@/lib/cross-system-root/lookup';
import {
  dismissFinding,
  listFindingsForMember,
  markFindingReviewed,
} from '@/lib/cross-system-root/data';
import { buildConvergenceLines, buildFindingView } from '@/lib/cross-system-root/view';
import { convergenceLine } from '@/lib/cross-system-root/copy';
import type { RootNoticedView } from '@/lib/cross-system-root/view';

export type RootNoticedPanelState = {
  /** False for a caller who is not staff, so the section draws nothing at all. */
  allowed: boolean;
  view: RootNoticedView;
};

const EMPTY_VIEW: RootNoticedView = {
  findings: [],
  convergences: [],
  findingCount: 0,
  suppressedCount: 0,
  complaintCount: 0,
  unclassifiedCount: 0,
  mapEntryCount: 0,
};

const EMPTY_PANEL: RootNoticedPanelState = { allowed: false, view: EMPTY_VIEW };

/** How many of her most recent complaints the panel reads back. */
const COMPLAINT_WINDOW = 20;

async function isCoachOrAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  return (
    (await hasActiveRole(supabase, userId, 'coach')) ||
    (await hasActiveRole(supabase, userId, 'platform_administrator'))
  );
}

export async function getClientRootNoticedAction(
  clientId: string
): Promise<RootNoticedPanelState> {
  const user = await getCachedUser();
  if (!user) return EMPTY_PANEL;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return EMPTY_PANEL;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return EMPTY_PANEL;

  const [signalRead, relationshipRead, sittingRead, content, library, complaints, stored] =
    await Promise.all([
      listSignalsForMember(supabase, clientId),
      listRelationships(supabase),
      listBodySystemsSessions(supabase, clientId),
      loadMemberContent(supabase),
      loadSignalLibrary(supabase),
      loadRecentComplaints(supabase, clientId, COMPLAINT_WINDOW),
      listFindingsForMember(supabase, clientId),
    ]);

  const mapEntries = complaintDrivenEntries(relationshipRead.summaries);

  if (complaints.length === 0) {
    return {
      allowed: true,
      view: { ...EMPTY_VIEW, mapEntryCount: mapEntries.length },
    };
  }

  const classifications = await loadClassifications(
    supabase,
    complaints.map((report) => report.id)
  );

  // THE SAFETY OVERRIDE IS RESOLVED BEFORE ANY FINDING IS BUILT, and it is
  // the survey's own layer that decides which sittings fired.
  const flaggedSittings = flaggedSittingIds(
    sittingRead.records.map((record) => ({
      sittingId: record.id,
      redFlagAnswers: record.redFlagAnswers,
    })),
    content.redFlags,
    content.safetyLevels
  );
  const flaggedSignals = redFlaggedSignalIds(signalRead.records, flaggedSittings);

  const nameFor = (slug: string) => library.names.get(slug)?.displayName ?? slug;
  const areaFor = (key: string) => library.bodyAreas.get(key)?.displayName ?? key;

  const dismissed = new Set(
    stored.findings.filter((row) => row.dismissedAt !== null).map((row) => row.relationshipId + '::' + row.reportId)
  );

  const views: RootNoticedView['findings'] = [];
  const allDrafts: Parameters<typeof convergentAreas>[0][number][] = [];
  const complaintTextByPattern = new Map<string, string>();
  let unclassified = 0;

  for (const report of complaints) {
    const found = classifications.get(report.id) ?? [];
    if (found.length === 0) {
      unclassified += 1;
      continue;
    }

    // THE ROWS THIS COMPLAINT PRODUCED, found by the id the classification
    // recorded when it was written. A classification with no signal id
    // contributes nothing rather than being guessed at.
    const triggerIds = new Set(
      found.map((entry) => entry.signalId).filter((id): id is string => id !== null)
    );
    if (triggerIds.size === 0) continue;

    const drafts = lookupForComplaint(
      relationshipRead.summaries,
      triggerIds,
      signalRead.records,
      report.reportedOn,
      flaggedSignals
    );

    for (const draft of drafts) {
      if (dismissed.has(draft.head.id + '::' + report.id)) continue;
      allDrafts.push(draft);
      complaintTextByPattern.set(draft.head.id + '::' + report.id, report.rawText);
      views.push(
        buildFindingView({
          finding: draft,
          report,
          classifications: found,
          nameFor,
          areaFor,
        })
      );
    }
  }

  const convergences = convergentAreas(allDrafts, (finding) => {
    for (const [key, text] of complaintTextByPattern) {
      if (key.startsWith(finding.head.id + '::')) return text;
    }
    return '';
  });

  return {
    allowed: true,
    view: {
      findings: views,
      convergences: buildConvergenceLines(convergences, convergenceLine),
      findingCount: views.filter((view) => !view.suppressed).length,
      suppressedCount: views.filter((view) => view.suppressed).length,
      complaintCount: complaints.length,
      unclassifiedCount: unclassified,
      mapEntryCount: mapEntries.length,
    },
  };
}

/**
 * Marks one finding read.
 *
 * THE ONLY THING A COACH MAY WRITE ABOUT A FINDING, and migration 246's
 * update policy is what really holds that: she cannot insert one, and she
 * cannot change what it found.
 */
export async function markRootFindingReviewedAction(
  findingId: string
): Promise<{ ok: boolean }> {
  const user = await getCachedUser();
  if (!user) return { ok: false };
  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false };
  const ok = await markFindingReviewed(supabase, findingId, user.id, new Date().toISOString());
  return { ok };
}

export async function dismissRootFindingAction(findingId: string): Promise<{ ok: boolean }> {
  const user = await getCachedUser();
  if (!user) return { ok: false };
  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false };
  const ok = await dismissFinding(supabase, findingId, user.id, new Date().toISOString());
  return { ok };
}
