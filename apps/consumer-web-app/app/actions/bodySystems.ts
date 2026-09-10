'use server';

/**
 * The MEF Body Systems Survey's writes, and the coach's read.
 *
 * NOTHING HERE RUNS ON A RENDER. Every function below is called because
 * somebody pressed something: her Continue at the end of a section, her
 * last tap on the sixth red flag, her change of branch on her own profile,
 * or a coach's Assign button. There is no draft row created by opening the
 * route, no claim and no schedule anywhere in this feature.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts answers and a step number. The assignment, the content, the
 * scoring, the bands, the associations and the eleven Root Map rows are
 * all resolved here from stored rows, so a hand built request cannot save
 * a sitting for a member who was never assigned one, cannot choose its own
 * band, and cannot supply its own results.
 *
 * RED FLAGS ARE SANITIZED SEPARATELY AND NEVER REACH THE SCORER.
 * `buildResults` is called with her scale answers only. A hand made POST
 * that put a red flag key inside the answers object writes nothing,
 * because sanitizeAnswers keeps only keys that are real question refs.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { memberTimezone } from '@/lib/time/memberToday';
import { todaysLocalDate } from '@/lib/time/localDate';
import { listAssignmentDeliveries } from '@/lib/assignments/data';
import {
  assignmentStatusLine,
  dueAtForLocalDate,
  dueAtInDays,
  resolveAssignmentProgress,
  type AssignmentProgress,
} from '@/lib/assignments/status';
import { findActiveRegistryEntry, insertRegistryEntry } from '@/lib/registry/data';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { clearRootPopupDismissal, bodySystemsPopupMessageKey } from '@/lib/root-popup-messages/data';
import {
  BODY_SYSTEMS_CONTENT_VERSION,
  BODY_SYSTEMS_DEFAULT_DUE_IN_DAYS,
  BODY_SYSTEMS_DEFINITION_ID,
} from '@/lib/body-systems/constants';
import {
  loadCoachContent,
  loadMemberContent,
  type CoachContent,
  type MemberContent,
} from '@/lib/body-systems/contentData';
import {
  completeBodySystemsSession,
  fetchBodySystemsSessionForAssignment,
  fetchMemberBranch,
  fetchPendingBodySystemsAssignment,
  listBodySystemsSessions,
  saveBodySystemsProgress,
  saveMemberBranch,
  type BodySystemsSessionRecord,
} from '@/lib/body-systems/data';
import { sanitizeRedFlagAnswers } from '@/lib/body-systems/redFlags';
import { buildResults } from '@/lib/body-systems/scoring';
import { buildSteps, clampStepIndex, lastQuestionStepIndex } from '@/lib/body-systems/steps';
import { buildBodySystemsRegistryDrafts } from '@/lib/body-systems/rootMap';
import { buildMemberResultsView, type MemberResultsView } from '@/lib/body-systems/memberView';
import { memberCopy } from '@/lib/body-systems/copyKeys';
import {
  DNA_VALUE,
  type BodySystemsAnswers,
  type BodySystemsBranch,
  type BodySystemsRedFlagAnswers,
  type BodySystemsResults,
} from '@/lib/body-systems/types';

/**
 * Only real question refs, with a value the scale actually holds or the
 * Does not apply to me literal on a question that allows it.
 *
 * Everything else is dropped rather than stored: an unknown key, a value
 * that is not on the scale, and a DNA tap on a question that cannot be
 * skipped all vanish here, so the scorer only ever reads answers the
 * survey could genuinely have collected.
 */
function sanitizeAnswers(
  content: MemberContent,
  branch: BodySystemsBranch,
  raw: unknown
): BodySystemsAnswers {
  const clean: BodySystemsAnswers = {};
  if (!raw || typeof raw !== 'object') return clean;
  const source = raw as Record<string, unknown>;
  const values = new Set(content.scale.map((option) => option.valueKey));

  for (const question of content.questions) {
    if (question.branch !== 'all' && question.branch !== branch) continue;
    const value = source[question.questionRef];
    if (typeof value !== 'string') continue;
    if (value === DNA_VALUE) {
      if (question.allowsDna) clean[question.questionRef] = DNA_VALUE;
      continue;
    }
    if (values.has(value)) clean[question.questionRef] = value;
  }
  return clean;
}

function readBranch(raw: unknown): BodySystemsBranch | null {
  return raw === 'a' || raw === 'b' ? raw : null;
}

export type SaveBodySystemsProgressResult =
  | { ok: true; sessionId: string; stepIndex: number }
  | { ok: false; error: string };

/**
 * Saves how far she has got, so closing the tab does not cost her the
 * sitting.
 *
 * Called by her Continue button and by nothing else. It never completes a
 * sitting, never scores anything and never publishes anything, so the only
 * thing a repeated call can do is store the same answers again.
 */
export async function saveBodySystemsProgressAction(
  branchInput: unknown,
  answersInput: unknown,
  redFlagsInput: unknown,
  stepIndexInput: unknown
): Promise<SaveBodySystemsProgressResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const content = await loadMemberContent(supabase);

  const assignmentRead = await fetchPendingBodySystemsAssignment(supabase, user.id);
  if (!assignmentRead.ok) {
    return { ok: false, error: memberCopy(content.copy, 'member.save_error') };
  }
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const branch = readBranch(branchInput);
  if (!branch) return { ok: false, error: 'Please choose which set of questions fits you.' };

  const steps = buildSteps(content.sections, content.redFlags);
  const stepIndex = clampStepIndex(
    steps,
    typeof stepIndexInput === 'number' ? stepIndexInput : 0
  );

  const record = await saveBodySystemsProgress(supabase, user.id, {
    assignmentId: assignmentRead.assignment.id,
    branch,
    answers: sanitizeAnswers(content, branch, answersInput),
    redFlagAnswers: sanitizeRedFlagAnswers(content.redFlags, redFlagsInput),
    stepIndex,
    contentVersion: BODY_SYSTEMS_CONTENT_VERSION,
  });

  // "No error" is not "it worked": the write is read back, so one that
  // matched no policy is caught here rather than reported as a success.
  if (!record) return { ok: false, error: memberCopy(content.copy, 'member.save_error') };

  // Remembering her branch is her own tap on the branch question, saved the
  // first time it is seen so a retake never re-asks it.
  const remembered = await fetchMemberBranch(supabase, user.id);
  if (remembered !== branch) await saveMemberBranch(supabase, user.id, branch);

  return { ok: true, sessionId: record.id, stepIndex: record.stepIndex };
}

export type SubmitBodySystemsResult =
  | {
      ok: true;
      sessionId: string;
      results: BodySystemsResults;
      view: MemberResultsView;
    }
  | { ok: false; error: string };

/**
 * Finishes the sitting, publishes the eleven Root Map rows, and hands back
 * the member facing view her screen renders.
 *
 * Idempotent: completion is write once in the database (migration 220's
 * update policy only matches an unfinished row), so a double submit
 * resolves to the sitting that is already stored and the Root Map rows are
 * published only on the completion that genuinely landed.
 *
 * THE VIEW IT RETURNS IS THE MEMBER VIEW, built by
 * lib/body-systems/memberView.ts, which cannot reach the association
 * library. The coach's reading is built separately, on the coach's own
 * request, from the same stored answers.
 */
export async function submitBodySystemsSurveyAction(
  branchInput: unknown,
  answersInput: unknown,
  redFlagsInput: unknown
): Promise<SubmitBodySystemsResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const content = await loadMemberContent(supabase);

  const assignmentRead = await fetchPendingBodySystemsAssignment(supabase, user.id);
  if (!assignmentRead.ok) {
    return { ok: false, error: memberCopy(content.copy, 'member.save_error') };
  }
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const branch = readBranch(branchInput);
  if (!branch) return { ok: false, error: 'Please choose which set of questions fits you.' };

  const answers = sanitizeAnswers(content, branch, answersInput);
  const redFlagAnswers: BodySystemsRedFlagAnswers = sanitizeRedFlagAnswers(
    content.redFlags,
    redFlagsInput
  );

  const steps = buildSteps(content.sections, content.redFlags);

  // The row has to exist before it can be completed, and it normally does:
  // every Continue before this one wrote it. A member whose very first tap
  // was the last one (a one section content edit, a resumed sitting whose
  // saves all failed) gets it created here by the same explicit action.
  let session = await fetchBodySystemsSessionForAssignment(
    supabase,
    user.id,
    assignmentRead.assignment.id
  );
  if (!session) {
    session = await saveBodySystemsProgress(supabase, user.id, {
      assignmentId: assignmentRead.assignment.id,
      branch,
      answers,
      redFlagAnswers,
      stepIndex: lastQuestionStepIndex(steps),
      contentVersion: BODY_SYSTEMS_CONTENT_VERSION,
    });
  }
  if (!session) return { ok: false, error: memberCopy(content.copy, 'member.save_error') };

  const previousRecords = await listBodySystemsSessions(supabase, user.id, 2);
  const previous = previousRecords.records.find((record) => record.id !== session!.id) ?? null;

  // ALREADY FINISHED, on an earlier submit that landed. Hand back what is
  // stored rather than scoring a second time.
  if (session.completedAt && session.results) {
    return {
      ok: true,
      sessionId: session.id,
      results: session.results,
      view: buildMemberResultsView({
        sections: content.sections,
        bands: content.bands,
        results: session.results,
        previousResults: previous?.results ?? null,
        minDeltaPercent: content.minDeltaPercent,
      }),
    };
  }

  // THE SCORE IS BUILT FROM HER SCALE ANSWERS ONLY. redFlagAnswers is not
  // an argument to this call and buildResults has no parameter it could
  // arrive through.
  const results = buildResults({
    sections: content.sections,
    questions: content.questions,
    scale: content.scale,
    bands: content.bands,
    answers,
    branch,
  });

  const { record } = await completeBodySystemsSession(supabase, user.id, {
    sessionId: session.id,
    answers,
    redFlagAnswers,
    results,
    stepIndex: steps.length - 1,
  });

  if (!record?.completedAt || !record.results) {
    return { ok: false, error: memberCopy(content.copy, 'member.save_error') };
  }

  await publishBodySystemsFindings(supabase, user.id, record, content);

  // The pop-up for this assignment can never be due again, which makes any
  // snooze or ignore row for it dead weight.
  await clearRootPopupDismissal(
    supabase,
    user.id,
    bodySystemsPopupMessageKey(assignmentRead.assignment.id)
  );

  // Home only. NOT this route: she is standing on it, looking at her
  // results, and revalidating it would re-render the page underneath her.
  revalidatePath('/dashboard');

  return {
    ok: true,
    sessionId: record.id,
    results: record.results,
    view: buildMemberResultsView({
      sections: content.sections,
      bands: content.bands,
      results: record.results,
      previousResults: previous?.results ?? null,
      minDeltaPercent: content.minDeltaPercent,
    }),
  };
}

/**
 * The eleven Root Map rows.
 *
 * Written one at a time, each superseding its own prior active row for the
 * same (domain, code) pair, which is the established adapter discipline.
 * A second sitting therefore updates each dimension rather than stacking
 * eleven more findings on eleven cards.
 *
 * A failure to publish is logged and swallowed. Her sitting is already
 * saved and her coach can already read it.
 */
async function publishBodySystemsFindings(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  record: BodySystemsSessionRecord,
  content: MemberContent
): Promise<void> {
  if (!record.results || !record.completedAt) return;

  const drafts = buildBodySystemsRegistryDrafts({
    sections: content.sections,
    bands: content.bands,
    results: record.results,
    sessionId: record.id,
    recordedAt: record.completedAt,
  });

  for (const draft of drafts) {
    try {
      const active = await findActiveRegistryEntry(supabase, memberId, draft.domain, draft.code);
      await insertRegistryEntry(supabase, memberId, draft, { supersedesId: active?.id ?? null });
    } catch (error) {
      console.error('publishBodySystemsFindings failed', draft.code, error);
    }
  }
}

export type SetBodySystemsBranchResult = { ok: true } | { ok: false; error: string };

/**
 * Her own change of branch, from her own profile screen.
 *
 * It changes what the LAST section asks her next time and nothing else. No
 * stored sitting is rescored, no result moves, and no coach surface
 * changes, because a finished sitting is an answer to the questions
 * actually asked.
 */
export async function setBodySystemsBranchAction(
  branchInput: unknown
): Promise<SetBodySystemsBranchResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };
  const branch = readBranch(branchInput);
  if (!branch) return { ok: false, error: 'Please choose one of the two sets.' };

  const supabase = createClient();
  const ok = await saveMemberBranch(supabase, user.id, branch);
  if (!ok) return { ok: false, error: 'We could not save that. Please try again.' };

  revalidatePath('/profile');
  return { ok: true };
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachBodySystemsSession = {
  id: string;
  completedAt: string | null;
  branch: BodySystemsBranch;
  answers: BodySystemsAnswers;
  redFlagAnswers: BodySystemsRedFlagAnswers;
  results: BodySystemsResults | null;
};

export type CoachBodySystemsPanelState = {
  pendingAssignedAt: string | null;
  pendingProgress: AssignmentProgress | null;
  /** The server's own sentence, written in the MEMBER's timezone. */
  pendingStatusLine: string | null;
  sessions: CoachBodySystemsSession[];
  /** The content the panel renders from, including the coach only library. Empty for a non coach. */
  content: CoachContent | null;
};

/**
 * Everything the coach's card needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering.
 *
 * THE LIBRARY IS ONLY EVER FETCHED HERE. This function has already
 * established that the caller is a coach or an administrator before
 * loadCoachContent is called, so the association rows are read on a
 * request that has passed that check as well as the database's own policy.
 */
export async function getClientBodySystemsPanelAction(
  clientId: string
): Promise<CoachBodySystemsPanelState> {
  const empty: CoachBodySystemsPanelState = {
    pendingAssignedAt: null,
    pendingProgress: null,
    pendingStatusLine: null,
    sessions: [],
    content: null,
  };

  const user = await getCachedUser();
  if (!user) return empty;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return empty;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return empty;

  const [assignmentRead, sessionRead, timezone, content] = await Promise.all([
    fetchPendingBodySystemsAssignment(supabase, clientId),
    listBodySystemsSessions(supabase, clientId),
    memberTimezone(supabase, clientId),
    loadCoachContent(supabase),
  ]);

  const open = assignmentRead.assignment;
  const deliveries = await listAssignmentDeliveries(supabase, clientId, open ? [open.id] : []);

  const pendingProgress = open
    ? resolveAssignmentProgress({
        status: 'pending',
        createdAt: open.createdAt,
        dueAt: open.dueAt,
        deliveredAt: deliveries.byAssignmentId.get(open.id)?.deliveredAt ?? null,
        memberToday: todaysLocalDate(timezone),
        readable: deliveries.ok,
      })
    : null;

  return {
    pendingAssignedAt: open?.createdAt ?? null,
    pendingProgress,
    pendingStatusLine: pendingProgress
      ? assignmentStatusLine(pendingProgress, { timeZone: timezone })
      : null,
    sessions: sessionRead.records.map((record) => ({
      id: record.id,
      completedAt: record.completedAt,
      branch: record.branch,
      answers: record.answers,
      redFlagAnswers: record.redFlagAnswers,
      results: record.results,
    })),
    content,
  };
}

export type AssignBodySystemsResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns the survey to one client, and does nothing else.
 *
 * Reuses the existing assessment_assignments ledger (migration 77) rather
 * than a second assignment system. Seven days from HER own today unless
 * the caller names a day, resolved from her timezone rather than the
 * coach's browser or the server's zone.
 *
 * Re-assigning after a completion is allowed and starts a fresh sitting,
 * with no special case here: a completed assignment has left 'pending', so
 * the partial unique index no longer covers it.
 */
export async function assignBodySystemsSurveyAction(
  clientId: string,
  options?: { dueDate?: string }
): Promise<AssignBodySystemsResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false, error: 'Not allowed.' };

  const existing = await fetchPendingBodySystemsAssignment(supabase, clientId);
  if (!existing.ok) return { ok: false, error: 'Could not read the assignments for this client.' };
  // An accidental duplicate click is not a failure.
  if (existing.assignment) return { ok: true };

  const named = options?.dueDate?.trim() ?? '';
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(named)
    ? dueAtForLocalDate(named)
    : dueAtInDays(
        todaysLocalDate(await memberTimezone(supabase, clientId)),
        BODY_SYSTEMS_DEFAULT_DUE_IN_DAYS
      );

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: BODY_SYSTEMS_DEFINITION_ID,
    assigned_by: user.id,
    is_required: true,
    reason: null,
    stage: 'standard',
    due_at: dueAt,
  });

  if (error && error.code !== '23505') return { ok: false, error: error.message };

  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true };
}

async function isCoachOrAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  return (
    (await hasActiveRole(supabase, userId, 'coach')) ||
    (await hasActiveRole(supabase, userId, 'platform_administrator'))
  );
}
