'use server';

/**
 * Server actions for the Case View (member + coach). Reads only —
 * buildCaseView computes nothing itself, it assembles already-persisted
 * output from the correlation engine, the driver-state engine, and the
 * member's own goal-selection history. Coach access is enforced the same
 * way every other coach-facing action in this codebase enforces it: the
 * coach's own session-scoped client is used, and RLS on every underlying
 * table (coach_read_assigned_*) is the real boundary — not an
 * application-level assignment check.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { memberTodayLocalDate } from '@/lib/time/memberToday';
import { buildCaseView } from '@/lib/case-view/service';
import { upsertGoalProgressCheckin } from '@/lib/case-view/data';
import type { CaseView } from '@/lib/case-view/types';
import type { ActionResult } from './auth';


export async function getMyCaseViewAction(): Promise<CaseView | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const localDate = await memberTodayLocalDate(supabase, user.id);
  return buildCaseView(supabase, user.id, localDate);
}

export async function getClientCaseViewAction(clientId: string): Promise<CaseView | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const localDate = await memberTodayLocalDate(supabase, clientId);
  return buildCaseView(supabase, clientId, localDate);
}

export async function submitGoalProgressRatingAction(localDate: string, rating: number): Promise<ActionResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: 'Rating must be between 1 and 5.' };
  }

  const { error } = await upsertGoalProgressCheckin(supabase, user.id, localDate, rating);
  if (error) return { error };
  return {};
}
