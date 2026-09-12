'use server';

/**
 * The MEF Whole-Body Signal Assessment's writes, and the coach's reads.
 *
 * NOTHING HERE RUNS ON A RENDER. Every function below is called because
 * somebody pressed something: her answer, her Continue, her last tap, a
 * coach's Assign button, a coach's choice of focus, or a coach's mark on a
 * coaching question. There is no draft row created by opening the route,
 * no claim and no schedule anywhere in this feature.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts answers, a routing choice and a step number. The
 * assignment, the content, the response conversion, the section maxima,
 * the Zone rollup, the bands, the Signal Load, the patterns and the
 * coaching questions are all resolved here from stored rows, so a hand
 * built request cannot save a sitting for a member who was never assigned
 * one, cannot choose its own band, and cannot supply its own results.
 *
 * THE PRACTITIONER LAYER IS NEVER LOADED ON A MEMBER'S REQUEST. Her saves
 * and her submit read `loadReadingContent`, which asks for no Zone name,
 * no chakra, no organ or gland and no coach topic. `loadCoachContent` is
 * called in exactly one place below, after the caller has been established
 * as a coach or an administrator.
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
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { clearRootPopupDismissal, wholeBodySignalPopupMessageKey } from '@/lib/root-popup-messages/data';
import {
  PNTA_VALUE,
  WBS_CONTENT_VERSION,
  WBS_DEFAULT_DUE_IN_DAYS,
  WBS_DEFINITION_ID,
} from '@/lib/whole-body-signal/constants';
import {
  loadCoachContent,
  loadReadingContent,
  type CoachContent,
  type ReadingContent,
} from '@/lib/whole-body-signal/contentData';
import {
  completeWbsSession,
  fetchPendingWbsAssignment,
  fetchWbsSessionForAssignment,
  listWbsFocus,
  listWbsQuestionActions,
  listWbsSessions,
  saveWbsFocus,
  saveWbsProgress,
  saveWbsQuestionAction,
  type WbsFocusRecord,
  type WbsQuestionAction,
} from '@/lib/whole-body-signal/data';
import { buildResults } from '@/lib/whole-body-signal/results';
import { shownQuestions } from '@/lib/whole-body-signal/scoring';
import { buildSteps, clampStepIndex, completionStepIndex } from '@/lib/whole-body-signal/steps';
import { buildMemberResultsView, type MemberResultsView } from '@/lib/whole-body-signal/memberView';
import { memberCopy } from '@/lib/whole-body-signal/copyKeys';
import type { WbsAnswers, WbsResults } from '@/lib/whole-body-signal/types';

/**
 * Only real question refs she was actually shown, with a value the scale
 * actually holds or the Prefer not to answer literal on a question that
 * offers it.
 *
 * Everything else is dropped rather than stored: an unknown key, a value
 * that is not on the scale, a Prefer not to answer on a question that does
 * not offer one, and any Section 8 question her own routing answer did not
 * open. A hand made POST therefore cannot inflate a section's maximum with
 * questions she was never asked.
 */
function sanitizeAnswers(
  content: ReadingContent,
  routingOptionKey: string | null,
  raw: unknown
): WbsAnswers {
  const clean: WbsAnswers = {};
  if (!raw || typeof raw !== 'object') return clean;
  const source = raw as Record<string, unknown>;
  const values = new Set(content.scale.map((option) => option.valueKey));

  for (const question of shownQuestions(content.questions, routingOptionKey, content.branchRules)) {
    const value = source[question.questionRef];
    if (typeof value !== 'string') continue;
    if (value === PNTA_VALUE) {
      if (question.allowsPnta) clean[question.questionRef] = PNTA_VALUE;
      continue;
    }
    if (values.has(value)) clean[question.questionRef] = value;
  }
  return clean;
}

/** A routing answer the stored options actually hold, or null. */
function readRouting(content: ReadingContent, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return content.routingOptions.some((option) => option.optionKey === raw) ? raw : null;
}

export type SaveWbsProgressResult =
  | { ok: true; sessionId: string; stepIndex: number }
  | { ok: false; error: string };

/**
 * Saves how far she has got, so closing the app does not cost her the
 * sitting.
 *
 * Called by her own tap and by her Continue, and by nothing else. It never
 * completes a sitting and never scores anything, so the only thing a
 * repeated call can do is store the same answers again.
 */
export async function saveWholeBodySignalProgressAction(
  routingInput: unknown,
  answersInput: unknown,
  stepIndexInput: unknown
): Promise<SaveWbsProgressResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  // Read side by side. Nothing about the content bundle depends on her
  // assignment and nothing about her assignment depends on the content, so
  // making the second wait for the first would be a whole round trip added
  // to every answer she gives.
  const [content, assignmentRead] = await Promise.all([
    loadReadingContent(supabase),
    fetchPendingWbsAssignment(supabase, user.id),
  ]);
  if (!assignmentRead.ok) {
    return { ok: false, error: memberCopy(content.copy, 'member.save_error') };
  }
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const routingOptionKey = readRouting(content, routingInput);
  const answers = sanitizeAnswers(content, routingOptionKey, answersInput);
  const steps = buildSteps({
    sections: content.sections,
    questions: content.questions,
    branchRules: content.branchRules,
    routingOptionKey,
  });
  const stepIndex = clampStepIndex(steps, typeof stepIndexInput === 'number' ? stepIndexInput : 0);

  const record = await saveWbsProgress(supabase, user.id, {
    assignmentId: assignmentRead.assignment.id,
    routingOptionKey,
    answers,
    stepIndex,
    contentVersion: WBS_CONTENT_VERSION,
  });

  // "No error" is not "it worked": the write is read back, so one that
  // matched no policy is caught here rather than reported as a success.
  if (!record) return { ok: false, error: memberCopy(content.copy, 'member.save_error') };

  return { ok: true, sessionId: record.id, stepIndex: record.stepIndex };
}

export type SubmitWbsResult =
  | { ok: true; sessionId: string; view: MemberResultsView }
  | { ok: false; error: string };

/**
 * Finishes the sitting and hands back the member facing view her screen
 * renders.
 *
 * Idempotent: completion is write once in the database (migration 225's
 * update policy only matches an unfinished row), so a double submit
 * resolves to the sitting that is already stored.
 *
 * THE VIEW IT RETURNS IS THE MEMBER VIEW, built by
 * lib/whole-body-signal/memberView.ts, which has no field a Zone, a
 * chakra, an organ, a colour or a percentage could sit in. The coach's
 * reading is built separately, on the coach's own request, from the same
 * stored answers.
 */
export async function submitWholeBodySignalAction(
  routingInput: unknown,
  answersInput: unknown
): Promise<SubmitWbsResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const [content, assignmentRead] = await Promise.all([
    loadReadingContent(supabase),
    fetchPendingWbsAssignment(supabase, user.id),
  ]);
  if (!assignmentRead.ok) {
    return { ok: false, error: memberCopy(content.copy, 'member.save_error') };
  }
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const routingOptionKey = readRouting(content, routingInput);
  if (!routingOptionKey) {
    return { ok: false, error: 'Please answer the question about what is relevant to you.' };
  }
  const answers = sanitizeAnswers(content, routingOptionKey, answersInput);

  const steps = buildSteps({
    sections: content.sections,
    questions: content.questions,
    branchRules: content.branchRules,
    routingOptionKey,
  });

  // The row has to exist before it can be completed, and it normally does:
  // every answer before this one wrote it. A member whose saves all failed
  // gets it created here by the same explicit action.
  let session = await fetchWbsSessionForAssignment(
    supabase,
    user.id,
    assignmentRead.assignment.id
  );
  if (!session) {
    session = await saveWbsProgress(supabase, user.id, {
      assignmentId: assignmentRead.assignment.id,
      routingOptionKey,
      answers,
      stepIndex: completionStepIndex(steps),
      contentVersion: WBS_CONTENT_VERSION,
    });
  }
  if (!session) return { ok: false, error: memberCopy(content.copy, 'member.save_error') };

  function viewFor(results: WbsResults, storedAnswers: WbsAnswers): MemberResultsView {
    return buildMemberResultsView({
      sections: content.sections,
      questions: content.questions,
      scale: content.scale,
      bands: content.bands,
      branchRules: content.branchRules,
      answers: storedAnswers,
      results,
      settings: content.settings,
    });
  }

  // ALREADY FINISHED, on an earlier submit that landed. Hand back what is
  // stored rather than scoring a second time.
  if (session.completedAt && session.results) {
    return { ok: true, sessionId: session.id, view: viewFor(session.results, session.answers) };
  }

  const results = buildResults({
    sections: content.sections,
    questions: content.questions,
    scale: content.scale,
    bands: content.bands,
    branchRules: content.branchRules,
    zoneOrder: content.zoneOrder,
    answers,
    routingOptionKey,
    settings: content.settings,
  });

  const { record } = await completeWbsSession(supabase, user.id, {
    sessionId: session.id,
    routingOptionKey,
    answers,
    results,
    stepIndex: completionStepIndex(steps),
  });

  if (!record?.completedAt || !record.results) {
    return { ok: false, error: memberCopy(content.copy, 'member.save_error') };
  }

  // The pop-up for this assignment can never be due again, which makes any
  // snooze or ignore row for it dead weight.
  await clearRootPopupDismissal(
    supabase,
    user.id,
    wholeBodySignalPopupMessageKey(assignmentRead.assignment.id)
  );

  // Home only. NOT this route: she is standing on it, looking at her
  // results, and revalidating it would re-render the page underneath her.
  revalidatePath('/dashboard');

  return { ok: true, sessionId: record.id, view: viewFor(record.results, record.answers) };
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachWbsSession = {
  id: string;
  completedAt: string | null;
  routingOptionKey: string | null;
  answers: WbsAnswers;
  results: WbsResults | null;
};

export type CoachWbsPanelState = {
  pendingAssignedAt: string | null;
  pendingProgress: AssignmentProgress | null;
  /** The server's own sentence, written in the MEMBER's timezone. */
  pendingStatusLine: string | null;
  memberId: string | null;
  sessions: CoachWbsSession[];
  focus: WbsFocusRecord[];
  questionActions: WbsQuestionAction[];
  /** The content the panel renders from, including the three practitioner tables. Empty for a non coach. */
  content: CoachContent | null;
};

const EMPTY_PANEL: CoachWbsPanelState = {
  pendingAssignedAt: null,
  pendingProgress: null,
  pendingStatusLine: null,
  memberId: null,
  sessions: [],
  focus: [],
  questionActions: [],
  content: null,
};

/**
 * Everything the coach's card needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering.
 *
 * THE PRACTITIONER TABLES ARE ONLY EVER FETCHED HERE. This function has
 * already established that the caller is a coach or an administrator
 * before loadCoachContent is called, so the Zone map, the patterns and the
 * coaching library are read on a request that has passed that check as
 * well as the database's own policy.
 */
export async function getClientWholeBodySignalPanelAction(
  clientId: string
): Promise<CoachWbsPanelState> {
  const user = await getCachedUser();
  if (!user) return EMPTY_PANEL;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return EMPTY_PANEL;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return EMPTY_PANEL;

  const [assignmentRead, sessionRead, timezone, content, focusRead] = await Promise.all([
    fetchPendingWbsAssignment(supabase, clientId),
    listWbsSessions(supabase, clientId),
    memberTimezone(supabase, clientId),
    loadCoachContent(supabase),
    listWbsFocus(supabase, clientId),
  ]);

  const open = assignmentRead.assignment;
  const [deliveries, actionsRead] = await Promise.all([
    listAssignmentDeliveries(supabase, clientId, open ? [open.id] : []),
    listWbsQuestionActions(
      supabase,
      clientId,
      sessionRead.records.map((record) => record.id)
    ),
  ]);

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
    memberId: clientId,
    sessions: sessionRead.records.map((record) => ({
      id: record.id,
      completedAt: record.completedAt,
      routingOptionKey: record.routingOptionKey,
      answers: record.answers,
      results: record.results,
    })),
    focus: focusRead.records,
    questionActions: actionsRead.records,
    content,
  };
}

export type AssignWbsResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns the assessment to one client, and does nothing else.
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
export async function assignWholeBodySignalAction(
  clientId: string,
  options?: { dueDate?: string }
): Promise<AssignWbsResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false, error: 'Not allowed.' };

  const existing = await fetchPendingWbsAssignment(supabase, clientId);
  if (!existing.ok) return { ok: false, error: 'Could not read the assignments for this client.' };
  // An accidental duplicate click is not a failure.
  if (existing.assignment) return { ok: true };

  const named = options?.dueDate?.trim() ?? '';
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(named)
    ? dueAtForLocalDate(named)
    : dueAtInDays(
        todaysLocalDate(await memberTimezone(supabase, clientId)),
        WBS_DEFAULT_DUE_IN_DAYS
      );

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: WBS_DEFINITION_ID,
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

export type SetFocusResult = { ok: true; sectionKey: string } | { ok: false; error: string };

/**
 * The coach's chosen coaching focus for one sitting.
 *
 * IT SITS BESIDE THE RECOMMENDATION, NEVER INSTEAD OF IT. Nothing about
 * the stored results changes, so the panel keeps showing what the
 * assessment recommended alongside what he decided.
 *
 * The section is checked against the stored sections, so a hand made POST
 * cannot file a focus under a section that does not exist.
 */
export async function setWholeBodySignalFocusAction(
  sessionId: unknown,
  clientId: unknown,
  sectionKey: unknown
): Promise<SetFocusResult> {
  if (typeof sessionId !== 'string' || typeof clientId !== 'string' || typeof sectionKey !== 'string') {
    return { ok: false, error: 'Could not save that choice.' };
  }

  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false, error: 'Not allowed.' };

  const content = await loadReadingContent(supabase);
  if (!content.sections.some((section) => section.sectionKey === sectionKey)) {
    return { ok: false, error: 'That is not a section of this assessment.' };
  }

  const record = await saveWbsFocus(supabase, {
    sessionId,
    memberId: clientId,
    sectionKey,
    coachId: user.id,
  });
  if (!record) return { ok: false, error: 'That did not save. Please try again.' };

  revalidatePath(`/coach/clients/${clientId}/detail`);
  return { ok: true, sectionKey: record.sectionKey };
}

export type SetQuestionActionResult =
  | { ok: true; action: WbsQuestionAction }
  | { ok: false; error: string };

/**
 * A coach's mark on one coaching question: asked, hidden, or saved to
 * session prep.
 *
 * ONLY THE FIELDS HIS TAP NAMES ARE WRITTEN. A blank is not an erasure, so
 * marking a question asked does not quietly clear that it was saved.
 */
export async function setWholeBodySignalQuestionActionAction(
  sessionId: unknown,
  clientId: unknown,
  questionKey: unknown,
  patch: { asked?: unknown; hidden?: unknown; saved?: unknown }
): Promise<SetQuestionActionResult> {
  if (
    typeof sessionId !== 'string' ||
    typeof clientId !== 'string' ||
    typeof questionKey !== 'string'
  ) {
    return { ok: false, error: 'Could not save that.' };
  }

  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false, error: 'Not allowed.' };

  const record = await saveWbsQuestionAction(supabase, {
    sessionId,
    memberId: clientId,
    questionKey,
    coachId: user.id,
    ...(typeof patch.asked === 'boolean' ? { asked: patch.asked } : {}),
    ...(typeof patch.hidden === 'boolean' ? { hidden: patch.hidden } : {}),
    ...(typeof patch.saved === 'boolean' ? { saved: patch.saved } : {}),
  });
  if (!record) return { ok: false, error: 'That did not save. Please try again.' };
  return { ok: true, action: record };
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
