'use server';

/**
 * The Breathing Pattern Check-In's writes, and the coach's reads.
 *
 * NOTHING HERE RUNS ON A RENDER. Every function below is called because
 * somebody pressed something: her answer, her last tap, or a coach's
 * Assign button. There is no draft row created by opening the route, no
 * claim and no schedule anywhere in this feature.
 *
 * THE SERVER DECIDES EVERYTHING THE CLIENT COULD HAVE LIED ABOUT. The
 * client posts answers and a step number. The assignment, the sanitising
 * of every item id and every response value against the frozen instrument,
 * and the entire score are resolved here, so a hand built request cannot
 * save a sitting for a member who was never assigned one, cannot answer a
 * seventeenth question, cannot invent a sixth response and cannot supply
 * its own total.
 *
 * =====================================================================
 * THE COACH SIDE IS A DIFFERENT FILE, AND THAT IS THE FENCE.
 * =====================================================================
 *
 * app/actions/breathingCheckInCoach.ts holds the coach panel read and the
 * Assign action, because both of them reach
 * lib/breathing-check-in/coachView.ts, which reaches the instrument's own
 * name, the reference threshold and the per item points.
 *
 * THIS SPLIT IS NOT TIDINESS. Her taker imports submitBreathingCheckInAction
 * from this file, so anything this file imports is on her import graph.
 * With one combined actions module, the module naming the instrument was
 * two hops from her screen, and the guard that exists to prove it is not
 * (tests/breathing-check-in-layers.test.tsx) failed on exactly that path.
 * Keeping the two halves apart is what makes the claim true rather than
 * merely intended.
 *
 * What her screen is handed is built by buildBpcMemberView, which has no
 * field a number could sit in.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import {
  breathingCheckInPopupMessageKey,
  clearRootPopupDismissal,
} from '@/lib/root-popup-messages/data';
import { BPC_CONTENT_VERSION } from '@/lib/breathing-check-in/constants';
import {
  sanitizeBpcAnswers,
  scoreBpcAnswers,
  type BpcAnswers,
} from '@/lib/breathing-check-in/instrument';
import {
  completeBpcSession,
  fetchBpcSessionForAssignment,
  fetchPendingBpcAssignment,
  saveBpcProgress,
} from '@/lib/breathing-check-in/data';
import {
  bpcCompletionIndex,
  buildBpcSteps,
  clampBpcStepIndex,
} from '@/lib/breathing-check-in/steps';
import { buildBpcMemberView, type BpcMemberView } from '@/lib/breathing-check-in/signals';
import { BPC_COPY } from '@/lib/breathing-check-in/copy';

export type SaveBpcProgressResult =
  | { ok: true; sessionId: string; stepIndex: number }
  | { ok: false; error: string };

/**
 * Saves how far she has got, so closing the app does not cost her the
 * sitting.
 *
 * Called by her own tap, and by nothing else. It never completes a sitting
 * and never scores anything, so the only thing a repeated call can do is
 * store the same answers again.
 */
export async function saveBreathingCheckInProgressAction(
  answersInput: unknown,
  stepIndexInput: unknown
): Promise<SaveBpcProgressResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const assignmentRead = await fetchPendingBpcAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: BPC_COPY.saveError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const answers = sanitizeBpcAnswers(answersInput);
  const stepIndex = clampBpcStepIndex(buildBpcSteps(), stepIndexInput);

  const record = await saveBpcProgress(supabase, user.id, {
    assignmentId: assignmentRead.assignment.id,
    answers,
    stepIndex,
    contentVersion: BPC_CONTENT_VERSION,
  });

  // "No error" is not "it worked": the write is read back, so one that
  // matched no policy is caught here rather than reported as a success.
  if (!record) return { ok: false, error: BPC_COPY.saveError };

  return { ok: true, sessionId: record.id, stepIndex: record.stepIndex };
}

export type SubmitBpcResult =
  | { ok: true; sessionId: string; view: BpcMemberView }
  | { ok: false; error: string };

/**
 * Finishes the sitting and hands back the member facing view her screen
 * renders.
 *
 * Idempotent: completion is write once in the database (migration 231's
 * update policy only matches an unfinished row), so a double submit
 * resolves to the sitting that is already stored and returns the same
 * reading.
 *
 * THE VIEW IT RETURNS IS THE MEMBER VIEW, built by
 * lib/breathing-check-in/signals.ts, which carries no total, no maximum,
 * no percentage, no per item point and no reference threshold. The coach's
 * reading is built separately, on the coach's own request, from the same
 * stored result.
 */
export async function submitBreathingCheckInAction(
  answersInput: unknown
): Promise<SubmitBpcResult> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Please sign in again.' };

  const supabase = createClient();
  const assignmentRead = await fetchPendingBpcAssignment(supabase, user.id);
  if (!assignmentRead.ok) return { ok: false, error: BPC_COPY.saveError };
  if (!assignmentRead.assignment) {
    return { ok: false, error: 'Your coach has not opened this one for you.' };
  }

  const answers: BpcAnswers = sanitizeBpcAnswers(answersInput);
  const steps = buildBpcSteps();
  const finalIndex = bpcCompletionIndex(steps);

  // The row has to exist before it can be completed, and it normally does:
  // every answer before this one wrote it. A member whose saves all failed
  // gets it created here by the same explicit action.
  let session = await fetchBpcSessionForAssignment(
    supabase,
    user.id,
    assignmentRead.assignment.id
  );
  if (!session) {
    session = await saveBpcProgress(supabase, user.id, {
      assignmentId: assignmentRead.assignment.id,
      answers,
      stepIndex: finalIndex,
      contentVersion: BPC_CONTENT_VERSION,
    });
  }
  if (!session) return { ok: false, error: BPC_COPY.saveError };

  // ALREADY FINISHED, on an earlier submit that landed. Hand back what is
  // stored rather than scoring a second time.
  if (session.completedAt && session.results) {
    return { ok: true, sessionId: session.id, view: buildBpcMemberView(session.results) };
  }

  const results = scoreBpcAnswers(answers);

  const record = await completeBpcSession(supabase, user.id, {
    sessionId: session.id,
    answers,
    results,
    stepIndex: finalIndex,
  });

  if (!record?.completedAt || !record.results) {
    return { ok: false, error: BPC_COPY.saveError };
  }

  // The pop-up for this assignment can never be due again, which makes any
  // snooze or ignore row for it dead weight.
  await clearRootPopupDismissal(
    supabase,
    user.id,
    breathingCheckInPopupMessageKey(assignmentRead.assignment.id)
  );

  // Home only. NOT this route: she is standing on it, looking at her
  // results, and revalidating it would re-render the page underneath her.
  revalidatePath('/dashboard');

  return { ok: true, sessionId: record.id, view: buildBpcMemberView(record.results) };
}
