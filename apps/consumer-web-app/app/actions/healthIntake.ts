'use server';

/**
 * The Health & Lifestyle Intake's writes, and the coach's read.
 *
 * NOTHING HERE RUNS ON A RENDER. Every function below is called because
 * somebody pressed something: her answer, her Continue, her last tap, or a
 * coach's Assign button. There is no draft row created by opening the
 * route, no claim and no schedule anywhere in this feature.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts an answers object and a step number. Which questions exist,
 * which options each one offers, which screens her own earlier answers
 * opened, and what survives a branch she closed are all resolved here from
 * lib/health-intake/sanitize.ts, so a hand made request cannot save a
 * sitting for a member who was never assigned one, cannot answer a question
 * she was never asked, and cannot leave an answer standing on a branch she
 * turned off.
 *
 * SAFETY IS EVALUATED HERE AND ESCALATED THROUGH THE ONE PIPELINE. The six
 * rules are pure and live in lib/health-intake/safety.ts. The write is the
 * app's existing lib/safety/service.ts::evaluateConcern, the same one the
 * check-in, the body assessment and the WBSA red flags already call. There
 * is no second escalation system, no second review queue and no second set
 * of member facing words.
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
import { clearRootPopupDismissal, healthIntakePopupMessageKey } from '@/lib/root-popup-messages/data';
import { evaluateConcern } from '@/lib/safety/service';
import { recordSafetyRestrictionNarrative } from '@/lib/narrative/service';
import {
  HLI_CONTENT_VERSION,
  HLI_DEFAULT_DUE_IN_DAYS,
  HLI_DEFINITION_ID,
} from '@/lib/health-intake/constants';
import { HLI_COPY } from '@/lib/health-intake/copy';
import {
  completeHliSession,
  fetchHliSessionForAssignment,
  fetchPendingHliAssignment,
  listHliSessions,
  markHliSafetyEscalated,
  saveHliProgress,
} from '@/lib/health-intake/data';
import { sanitizeWithArchive } from '@/lib/health-intake/sanitize';
import { buildSteps, clampStepIndex, completionStepIndex } from '@/lib/health-intake/steps';
import { evaluateIntakeSafety, freeTextForClassifier } from '@/lib/health-intake/safety';
import { buildMemberSummary, type MemberSummaryView } from '@/lib/health-intake/memberSummary';
import type { IntakeAnswers } from '@/lib/health-intake/types';

/**
 * Her archive, plus everything THIS write took out.
 *
 * IT IS DERIVED FROM WHAT THE SERVER ALREADY HOLDS, NOT FROM WHAT THE
 * CLIENT SENT. When a member confirms a removal, her screen simply stops
 * holding those answers, so the POST that follows does not carry them at
 * all and the sanitiser has nothing to drop. Diffing the STORED answers
 * against the kept set is what actually sees the removal, and it sees it
 * whatever the client did: a stale tab, a hand made POST and a browser
 * that crashed mid-confirmation all produce the same archive.
 *
 * Found on production, 2026-09-12: the archive was empty after a real
 * removal, so "soft archived for audit" was a sentence about a column that
 * never filled.
 *
 * NOTHING IS EVER REMOVED FROM IT, and nothing ever reads it back into a
 * coach facing surface. It answers one question only: did she once tell us
 * this and then take it back.
 */
function mergeArchive(
  existingArchive: IntakeAnswers,
  existingAnswers: IntakeAnswers,
  kept: IntakeAnswers,
  dropped: IntakeAnswers
): IntakeAnswers {
  const removed: IntakeAnswers = {};
  for (const [fieldId, value] of Object.entries(existingAnswers)) {
    if (kept[fieldId] === undefined) removed[fieldId] = value;
  }
  return { ...existingArchive, ...removed, ...dropped };
}

export type SaveHliProgressResult =
  | { ok: true; sessionId: string; stepIndex: number }
  | { ok: false; error: string };

/**
 * Saves how far she has got, so closing the app does not cost her the
 * sitting.
 *
 * Called by her own Continue and by nothing else. It never completes a
 * sitting, so the only thing a repeated call can do is store the same
 * answers again.
 */
export async function saveHealthIntakeProgressAction(
  answersInput: unknown,
  stepIndexInput: unknown
): Promise<SaveHliProgressResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const assignmentRead = await fetchPendingHliAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: HLI_COPY.saveError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const existing = await fetchHliSessionForAssignment(
    supabase,
    user.id,
    assignmentRead.assignment.id
  );
  // A finished sitting is finished. Saving into one would be a second
  // answer to a question already closed, and the database refuses it
  // anyway, so this says so rather than reporting a silent no-op.
  if (existing?.completedAt) return { ok: false, error: HLI_COPY.alreadyDoneBody };

  const { kept, dropped } = sanitizeWithArchive(answersInput);
  const steps = buildSteps(kept);
  const stepIndex = clampStepIndex(steps, typeof stepIndexInput === 'number' ? stepIndexInput : 0);

  const record = await saveHliProgress(supabase, user.id, {
    assignmentId: assignmentRead.assignment.id,
    answers: kept,
    archived: mergeArchive(existing?.archived ?? {}, existing?.answers ?? {}, kept, dropped),
    stepIndex,
    contentVersion: HLI_CONTENT_VERSION,
  });

  // "No error" is not "it worked": the write is read back, so one that
  // matched no policy is caught here rather than reported as a success.
  if (!record) return { ok: false, error: HLI_COPY.saveError };
  return { ok: true, sessionId: record.id, stepIndex: record.stepIndex };
}

export type SubmitHliResult =
  | { ok: true; sessionId: string; view: MemberSummaryView }
  | { ok: false; error: string };

/**
 * Finishes the sitting and hands back the three cards her screen renders.
 *
 * Idempotent: completion is write once in the database (migration 230's
 * update policy only matches an unfinished row), so a double submit
 * resolves to the sitting that is already stored.
 *
 * THE SAFETY WRITE HAPPENS BEFORE THE COMPLETION, and the order is chosen
 * deliberately. The escalation flag lives on a row the member may only
 * update while it is unfinished, so marking it after completing is a write
 * her own session cannot make. Escalating first means a completion that
 * then fails leaves a sitting she can retry without opening a second safety
 * case for the same answers.
 */
export async function submitHealthIntakeAction(answersInput: unknown): Promise<SubmitHliResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const assignmentRead = await fetchPendingHliAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: HLI_COPY.saveError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const { kept, dropped } = sanitizeWithArchive(answersInput);
  const steps = buildSteps(kept);

  // The row has to exist before it can be completed, and it normally does:
  // every Continue before this one wrote it. A member whose saves all
  // failed gets it created here by the same explicit action.
  let session = await fetchHliSessionForAssignment(
    supabase,
    user.id,
    assignmentRead.assignment.id
  );
  if (!session) {
    session = await saveHliProgress(supabase, user.id, {
      assignmentId: assignmentRead.assignment.id,
      answers: kept,
      archived: dropped,
      stepIndex: completionStepIndex(steps),
      contentVersion: HLI_CONTENT_VERSION,
    });
  }
  if (!session) return { ok: false, error: HLI_COPY.saveError };

  // ALREADY FINISHED, on an earlier submit that landed. Hand back what is
  // stored rather than writing a second time.
  if (session.completedAt) {
    return {
      ok: true,
      sessionId: session.id,
      view: buildMemberSummary(session.answers, {
        safetyTriggered: evaluateIntakeSafety(session.answers).length > 0,
      }),
    };
  }

  const signals = evaluateIntakeSafety(kept);
  const freeText = freeTextForClassifier(kept);

  if (!session.safetyEscalatedAt && (signals.length > 0 || freeText.length > 0)) {
    await escalate(supabase, user.id, session.id, signals.map((signal) => signal.classifierText), freeText);
    await markHliSafetyEscalated(supabase, user.id, session.id);
  }

  const record = await completeHliSession(supabase, user.id, {
    sessionId: session.id,
    answers: kept,
    archived: mergeArchive(session.archived, session.answers, kept, dropped),
    stepIndex: completionStepIndex(steps),
  });

  if (!record?.completedAt) return { ok: false, error: HLI_COPY.saveError };

  // The pop-up for this assignment can never be due again, which makes any
  // snooze or ignore row for it dead weight.
  await clearRootPopupDismissal(
    supabase,
    user.id,
    healthIntakePopupMessageKey(assignmentRead.assignment.id)
  );

  // Home only. NOT this route: she is standing on it, looking at her three
  // cards, and revalidating it would re-render the page underneath her.
  revalidatePath('/dashboard');

  return {
    ok: true,
    sessionId: record.id,
    view: buildMemberSummary(record.answers, { safetyTriggered: signals.length > 0 }),
  };
}

/**
 * Routes what fired into the app's existing safety pipeline.
 *
 * TWO CALLS, BECAUSE THEY ARE TWO DIFFERENT KINDS OF INPUT.
 *
 * The structured one names `health_intake_follow_up` explicitly, because
 * the six rules read answer VALUES and the shared classifier reads text:
 * restating a rule as a sentence engineered to trip a keyword would be
 * stuffing in a keyword the answers do not support, which lib/wbsa/safety.ts
 * already refuses to do. The honest sentences are still passed as the
 * excerpt, so a coach opening the case reads exactly what she reported, and
 * a genuinely urgent one that DOES match an existing category (bleeding,
 * breathing, a sudden sensory change) still classifies at that category's
 * own higher severity, because structural categories add rather than
 * replace.
 *
 * The free text one is the ordinary path every other free text surface in
 * this app takes. Her own words go through the same deterministic keyword
 * classifier that already recognises self harm language, chest pain and
 * fainting, with no structural category named, because she typed a sentence
 * and that is what the classifier is for.
 *
 * BEST EFFORT. A failure here must never surface to the member as a failed
 * intake, matching the discipline every other escalation path in this app
 * keeps.
 */
async function escalate(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  sessionId: string,
  ruleTexts: string[],
  freeText: string
): Promise<void> {
  if (ruleTexts.length > 0) {
    try {
      const evaluation = await evaluateConcern(supabase, {
        memberId,
        sourceFeature: 'unified_assessment',
        sourceRecordType: 'health_intake_answer',
        sourceRecordId: sessionId,
        text: ruleTexts.join(' '),
        newOrWorseningConcern: true,
        structuralCategories: ['health_intake_follow_up'],
      });
      if (evaluation) {
        await recordSafetyRestrictionNarrative(
          supabase,
          memberId,
          'system',
          null,
          evaluation.classification
        );
      }
    } catch (error) {
      console.error('health intake safety escalation failed', error);
    }
  }

  if (freeText.length > 0) {
    try {
      await evaluateConcern(supabase, {
        memberId,
        sourceFeature: 'unified_assessment',
        sourceRecordType: 'health_intake_free_text',
        sourceRecordId: sessionId,
        text: freeText,
      });
    } catch (error) {
      console.error('health intake free text classification failed', error);
    }
  }
}

// ---------------------------------------------------------------------
// The coach side.
// ---------------------------------------------------------------------

export type CoachHliSession = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  answers: IntakeAnswers;
};

export type CoachHliPanelState = {
  pendingAssignedAt: string | null;
  pendingProgress: AssignmentProgress | null;
  /** The server's own sentence, written in the MEMBER's timezone. */
  pendingStatusLine: string | null;
  memberId: string | null;
  sessions: CoachHliSession[];
};

const EMPTY_PANEL: CoachHliPanelState = {
  pendingAssignedAt: null,
  pendingProgress: null,
  pendingStatusLine: null,
  memberId: null,
  sessions: [],
};

/**
 * Everything the coach's Health Context section needs, in one read.
 *
 * Test accounts never reach a staff surface, and that is enforced through
 * lib/staff/testAccounts.ts rather than by this screen remembering.
 *
 * IT HANDS OVER HER `answers` AND NEVER HER `archived`. What she removed by
 * changing a gate is not in this payload at all, which is what makes "no
 * stale hidden answers anywhere" a fact about the wire rather than a
 * convention a card has to remember.
 */
export async function getClientHealthIntakePanelAction(
  clientId: string
): Promise<CoachHliPanelState> {
  const user = await getCachedUser();
  if (!user) return EMPTY_PANEL;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return EMPTY_PANEL;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return EMPTY_PANEL;

  const [assignmentRead, sessionRead, timezone] = await Promise.all([
    fetchPendingHliAssignment(supabase, clientId),
    listHliSessions(supabase, clientId),
    memberTimezone(supabase, clientId),
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
    memberId: clientId,
    sessions: sessionRead.records.map((record) => ({
      id: record.id,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      updatedAt: record.updatedAt,
      answers: record.answers,
    })),
  };
}

export type AssignHliResult = { ok: true } | { ok: false; error: string };

/**
 * Assigns the intake to one client, and does nothing else.
 *
 * Reuses the existing assessment_assignments ledger (migration 77) rather
 * than a second assignment system. Seven days from HER own today unless the
 * caller names a day, resolved from her timezone rather than the coach's
 * browser or the server's zone.
 */
export async function assignHealthIntakeAction(
  clientId: string,
  options?: { dueDate?: string }
): Promise<AssignHliResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false, error: 'Not allowed.' };

  const existing = await fetchPendingHliAssignment(supabase, clientId);
  if (!existing.ok) return { ok: false, error: 'Could not read the assignments for this client.' };
  // An accidental duplicate click is not a failure.
  if (existing.assignment) return { ok: true };

  const named = options?.dueDate?.trim() ?? '';
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(named)
    ? dueAtForLocalDate(named)
    : dueAtInDays(
        todaysLocalDate(await memberTimezone(supabase, clientId)),
        HLI_DEFAULT_DUE_IN_DAYS
      );

  forgetMemberAssessmentFacts(clientId);
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: HLI_DEFINITION_ID,
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
