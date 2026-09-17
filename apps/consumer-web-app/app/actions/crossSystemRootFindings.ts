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
import { recordBriefingReview, recordBriefingVisit } from '@/lib/cross-system-root/briefingData';
import { isBriefingReviewAction } from '@/lib/cross-system-root/briefingRules';
import { EMPTY_ROOT_NOTICED_VIEW, readRootNoticed } from '@/lib/cross-system-root/noticedRead';

export type RootNoticedPanelState = {
  /** False for a caller who is not staff, so the section draws nothing at all. */
  allowed: boolean;
  view: FullRootNoticedView;
  /** The client the section is about, so the briefing can act on her cards. */
  clientId?: string;
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

  const view = await readRootNoticed(supabase, clientId, { viewerId: user.id });
  return { allowed: true, view, clientId };
}

/**
 * One review action on one briefing card: "Discuss next session",
 * "Reviewed" or "Not relevant".
 *
 * THE EVIDENCE STATE IS READ HERE, NOT TAKEN FROM THE PAGE. A stale page
 * and a hand made POST both exist, so the card is rebuilt from her rows as
 * they stand and the action is recorded against that state. A card that is
 * not in her briefing now cannot be acted on.
 *
 * NOTHING IS DELETED OR HIDDEN BY THIS. It appends one row a coach's own
 * briefing reads, and no Root table, map entry or ranking reads it.
 */
export async function recordRootBriefingReviewAction(
  clientId: string,
  targetKey: string,
  action: string
): Promise<{ ok: boolean }> {
  const user = await getCachedUser();
  if (!user) return { ok: false };
  if (!isBriefingReviewAction(action)) return { ok: false };
  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false };
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return { ok: false };

  const view = await readRootNoticed(supabase, clientId, { viewerId: user.id });
  const card = view.briefing?.cards.find((entry) => entry.targetKey === targetKey);
  if (!card) return { ok: false };

  const ok = await recordBriefingReview(supabase, {
    coachId: user.id,
    memberId: clientId,
    targetKey,
    action,
    evidenceState: card.evidenceState,
    actedAt: new Date().toISOString(),
  });
  return { ok };
}

/**
 * Records that this coach has now seen this client's briefing, so the next
 * visit's "new since you last reviewed" markers are measured from here.
 * Called from a mounted effect on the panel, never from a render.
 */
export async function markRootBriefingSeenAction(clientId: string): Promise<{ ok: boolean }> {
  const user = await getCachedUser();
  if (!user) return { ok: false };
  const supabase = createClient();
  if (!(await isCoachOrAdmin(supabase, user.id))) return { ok: false };
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return { ok: false };
  const ok = await recordBriefingVisit(supabase, user.id, clientId, new Date().toISOString());
  return { ok };
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
