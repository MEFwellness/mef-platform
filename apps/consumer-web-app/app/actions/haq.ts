/**
 * The member side of the Rooted Reset Health Appraisal Questionnaire.
 *
 * THIN WRAPPERS AROUND THE SHARED RUNTIME. Starting, answering, changing an
 * answer and completing are the Unified Adaptive Assessment Runtime's own
 * startOrResumeSession, persistAnswer and completeSession. The scoring runs
 * in the database, in the same transaction as those writes (migration 262),
 * and nothing in this file sees or returns a value, a total or a cutoff.
 *
 * THE GATE IS RE-ASKED BEFORE EVERY WRITE, from a fresh read rather than the
 * request memoized view, so a write never acts on a state from before
 * itself. It is lib/haq/access.ts, the same rule the route and the shelf
 * read, and the database refuses the same things underneath it.
 *
 * BEGIN IS A BUTTON. A render never opens an instance
 * (lib/assessment-runtime/entry.ts); only this action does, and only on a
 * pending coach assignment.
 */

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { completeSession, persistAnswer, startOrResumeSession } from '@/lib/assessment-runtime';
import { getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';
import { HAQ_KEY, HAQ_ROUTE } from '@/lib/haq/constants';
import { HAQ_QUESTIONS } from '@/lib/haq/questionBank';
import { buildHaqState } from '@/lib/haq/service';
import { isHaqResponseFor } from '@/lib/haq/walk';
import {
  addHaqBodyMark,
  haqRuntimeDefinitionId,
  removeHaqBodyMark,
  type HaqMarkInput,
} from '@/lib/haq/data';
import type { HaqBodyMark } from '@/lib/haq/bodyMap';

type Failure = { ok: false; error: string };

const NOT_OPEN: Failure = { ok: false, error: 'This is not open for you right now.' };

async function openInstanceForMember(): Promise<
  | { ok: true; supabase: ReturnType<typeof createClient>; memberId: string; sessionId: string }
  | Failure
> {
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const supabase = createClient();
  const state = await buildHaqState(supabase, user.id);
  if (!state || state.status !== 'in_progress') return NOT_OPEN;
  return { ok: true, supabase, memberId: user.id, sessionId: state.sessionId };
}

/** Begin. Opens her instance on a pending assignment, or finds the one already open, then lands her on the route. */
export async function beginHaqAction(): Promise<void> {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const supabase = createClient();
  const state = await buildHaqState(supabase, user.id);
  if (!state) redirect('/dashboard');

  if (state.status === 'pending') {
    // startRetake: an earlier finished instance is never a reason to refuse
    // a new assignment. It opens a NEW instance and leaves the old one as it
    // was, and an instance already open is resumed rather than duplicated.
    await startOrResumeSession(supabase, user.id, HAQ_KEY, { startRetake: true });
    forgetMemberAssessmentFacts(user.id);
  }

  revalidatePath(HAQ_ROUTE);
  redirect(HAQ_ROUTE);
}

/** One answer, saved the moment she taps it. A changed answer replaces the stored one. */
export async function saveHaqAnswerAction(questionKey: unknown, value: unknown): Promise<{ ok: true } | Failure> {
  const question = typeof questionKey === 'string' ? HAQ_QUESTIONS.find((q) => q.key === questionKey) : undefined;
  if (!question) return { ok: false, error: 'Unknown question.' };
  if (!isHaqResponseFor(question, value)) return { ok: false, error: 'That answer is not one of the choices.' };

  const open = await openInstanceForMember();
  if (!open.ok) return open;

  const definitionId = await haqRuntimeDefinitionId(open.supabase);
  if (!definitionId) return NOT_OPEN;
  const questions = await getUnifiedAssessmentQuestions(open.supabase, definitionId);
  const row = questions.find((q) => q.question_key === question.key);
  if (!row) return { ok: false, error: 'Unknown question.' };

  try {
    await persistAnswer(open.supabase, open.sessionId, row.id, value);
    return { ok: true };
  } catch (error) {
    console.error('saveHaqAnswerAction failed', error);
    return { ok: false, error: 'That answer could not be saved.' };
  }
}

export async function addHaqBodyMarkAction(input: HaqMarkInput): Promise<{ ok: true; mark: HaqBodyMark } | Failure> {
  const open = await openInstanceForMember();
  if (!open.ok) return open;
  return addHaqBodyMark(open.supabase, open.memberId, open.sessionId, input);
}

export async function removeHaqBodyMarkAction(markId: unknown): Promise<{ ok: true } | Failure> {
  const open = await openInstanceForMember();
  if (!open.ok) return open;
  return removeHaqBodyMark(open.supabase, open.memberId, open.sessionId, markId);
}

/**
 * Completes her instance. The runtime refuses an instance with an unanswered
 * question, and so does the database, which also computes the section
 * results in the same transaction. The body map is never consulted.
 */
export async function completeHaqAction(): Promise<{ ok: true } | Failure> {
  const open = await openInstanceForMember();
  if (!open.ok) return open;

  try {
    await completeSession(open.supabase, open.sessionId);
  } catch (error) {
    console.error('completeHaqAction failed', error);
    return { ok: false, error: 'Not every question has been answered yet.' };
  }

  forgetMemberAssessmentFacts(open.memberId);
  return { ok: true };
}
