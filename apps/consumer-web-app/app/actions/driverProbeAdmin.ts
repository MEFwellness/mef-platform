'use server';

/**
 * Server actions for the coach question-bank screen (app/coach/questions).
 * Every action re-checks the coach role itself (defense in depth — the
 * page/middleware guard already blocks a non-coach from reaching the
 * screen at all, but an action is a separate entry point in principle)
 * and runs under the caller's own RLS-scoped client, never a
 * service-role client, so migration 110's coach insert/update policies
 * are what actually authorize every write.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { listActiveDrivers, listDriverDomains } from '@/lib/driver-library/data';
import {
  createQuestion,
  listQuestionsWithStats,
  listRevisions,
  restoreQuestion,
  retireAndReplaceQuestion,
  retireQuestion,
  updateQuestion,
} from '@/lib/driver-probe-admin/data';
import type { CreateQuestionInput, QuestionWithStats, RevisionEntry, UpdateQuestionInput, UpdateQuestionResult } from '@/lib/driver-probe-admin/types';
import type { Driver, DriverDomain } from '@/lib/driver-library/types';

async function requireCoach(): Promise<{ coachId: string } | { error: string }> {
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };
  const supabase = createClient();
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) return { error: 'Coach access required.' };
  return { coachId: user.id };
}

export async function getQuestionBankDataAction(): Promise<{
  questions: QuestionWithStats[];
  drivers: Driver[];
  domains: DriverDomain[];
} | null> {
  const check = await requireCoach();
  if ('error' in check) return null;

  const supabase = createClient();
  const [questions, drivers, domains] = await Promise.all([
    listQuestionsWithStats(supabase),
    listActiveDrivers(supabase),
    listDriverDomains(supabase),
  ]);
  // Posture-derived drivers (MEC-2/MEC-3) never get a daily question, per
  // MEF-driver-library-v1.md — excluded from the assignable-driver list so
  // a coach can't accidentally create one for them from this screen.
  return { questions, drivers: drivers.filter((d) => !d.postureDerived), domains };
}

export async function createQuestionAction(input: CreateQuestionInput): Promise<{ error: string | null }> {
  const check = await requireCoach();
  if ('error' in check) return { error: check.error };
  return createQuestion(createClient(), input, check.coachId);
}

export async function updateQuestionAction(
  questionKey: string,
  patch: UpdateQuestionInput
): Promise<UpdateQuestionResult> {
  const check = await requireCoach();
  if ('error' in check) return { ok: false, error: check.error };
  return updateQuestion(createClient(), questionKey, patch, check.coachId);
}

export async function retireQuestionAction(questionKey: string): Promise<{ error: string | null }> {
  const check = await requireCoach();
  if ('error' in check) return { error: check.error };
  return retireQuestion(createClient(), questionKey, check.coachId);
}

export async function restoreQuestionAction(questionKey: string): Promise<{ error: string | null }> {
  const check = await requireCoach();
  if ('error' in check) return { error: check.error };
  return restoreQuestion(createClient(), questionKey, check.coachId);
}

export async function retireAndReplaceQuestionAction(
  questionKey: string,
  replacement: CreateQuestionInput
): Promise<{ error: string | null; newQuestionKey?: string }> {
  const check = await requireCoach();
  if ('error' in check) return { error: check.error };
  return retireAndReplaceQuestion(createClient(), questionKey, replacement, check.coachId);
}

export async function listRevisionsAction(questionKey: string): Promise<RevisionEntry[]> {
  const check = await requireCoach();
  if ('error' in check) return [];
  return listRevisions(createClient(), questionKey);
}
