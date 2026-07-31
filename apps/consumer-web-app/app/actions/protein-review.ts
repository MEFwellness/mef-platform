/**
 * Coach-facing actions for the Protein Phase 1a approval queue. Same "RLS
 * is the real authorization boundary" convention as
 * app/actions/corrective-programs.ts — these actions don't re-check the
 * coach/client relationship themselves, they just perform the read/write
 * and report whatever Postgres allows.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import {
  listPendingProteinTargetsForCoach,
  getProteinTargetById,
  approveProteinTarget,
} from '@/lib/protein/store';
import type { PendingProteinTargetQueueEntry, ProteinTarget } from '@/lib/protein/types';

async function resolveCoach(): Promise<{
  supabase: ReturnType<typeof createClient>;
  coachId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, coachId: user.id };
}

export async function listPendingProteinTargetsAction(): Promise<PendingProteinTargetQueueEntry[]> {
  const ctx = await resolveCoach();
  if (!ctx) return [];
  return listPendingProteinTargetsForCoach(ctx.supabase);
}

export async function getProteinTargetForReviewAction(
  targetId: string
): Promise<ProteinTarget | null> {
  const ctx = await resolveCoach();
  if (!ctx) return null;
  return getProteinTargetById(ctx.supabase, targetId);
}

/**
 * Approve as-is (pass the target's own computedGrams) or with an edit
 * (pass a different number) — same action either way, matching the
 * task's "coach can approve as-is or edit the number."
 */
export async function approveProteinTargetAction(
  targetId: string,
  activeGrams: number
): Promise<ActionResult> {
  const ctx = await resolveCoach();
  if (!ctx) return { error: 'Sign in required.' };

  if (!Number.isFinite(activeGrams) || activeGrams <= 0) {
    return { error: 'Enter a valid protein target.' };
  }

  const target = await getProteinTargetById(ctx.supabase, targetId);
  if (!target) return { error: 'This request could not be found.' };
  if (target.status !== 'pending_coach_review') {
    return { error: 'This request has already been reviewed.' };
  }

  const { error } = await approveProteinTarget(ctx.supabase, targetId, {
    coachId: ctx.coachId,
    activeGrams,
    isCoachEdited: activeGrams !== target.computedGrams,
  });

  return error ? { error } : {};
}
