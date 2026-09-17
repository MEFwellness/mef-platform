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
import {
  dismissFinding,
  markFindingReviewed,
} from '@/lib/cross-system-root/data';
import type { FullRootNoticedView } from '@/lib/cross-system-root/noticedView';
import { EMPTY_ROOT_NOTICED_VIEW, readRootNoticed } from '@/lib/cross-system-root/noticedRead';

export type RootNoticedPanelState = {
  /** False for a caller who is not staff, so the section draws nothing at all. */
  allowed: boolean;
  view: FullRootNoticedView;
};

const EMPTY_VIEW: FullRootNoticedView = EMPTY_ROOT_NOTICED_VIEW;

const EMPTY_PANEL: RootNoticedPanelState = { allowed: false, view: EMPTY_VIEW };

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

  const view = await readRootNoticed(supabase, clientId);
  return { allowed: true, view };
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
