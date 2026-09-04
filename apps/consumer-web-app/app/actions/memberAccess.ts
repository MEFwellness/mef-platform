/**
 * apps/consumer-web-app/app/actions/memberAccess.ts
 *
 * The administrator's own entry points into membership access: read every
 * member's state, assign a tier, grant or revoke full access, extend a
 * trial, expire somebody.
 *
 * Same shape as app/actions/analyticsAdmin.ts: every function calls
 * requireAdmin first, using the same hasActiveRole check against the same
 * has_active_role database function the RLS policies themselves use.
 *
 * Authorization is enforced three times over, deliberately:
 *
 *   1. Here, by requireAdmin.
 *   2. Inside every database function, by member_access_assert_admin(),
 *      which raises 42501 for anyone who is not a signed in platform
 *      administrator. A bug in this file could not get past it, and unlike
 *      analytics_assert_admin() it does not exempt the service role, so the
 *      later in-app billing build cannot reach these either.
 *   3. By the guard trigger on member_subscriptions, which rejects any
 *      change to a manual assignment that did not come through
 *      admin_set_member_access().
 *
 * These actions are the ONLY way anything in this application writes
 * member_subscriptions. That is the whole point of the design: while
 * payments happen outside the app (external Stripe links, and Zelle, which
 * never touches a checkout), Osei is the entitlement system, and this is
 * his console.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isAccessStatus, isAccessTier } from '@/lib/membership/types';
import type { AccessStatus, AccessTier } from '@/lib/membership/types';
import { forgetMemberAssessmentFacts } from '@/lib/assessment-registry/facts';

type SupabaseServerClient = ReturnType<typeof createClient>;

export type MemberAccessActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** One row of the panel, exactly as admin_list_member_access() returns it. */
export interface MemberAccessRow {
  memberId: string;
  email: string | null;
  displayName: string | null;
  isTest: boolean;
  accountCreatedAt: string;
  tier: AccessTier | null;
  source: string | null;
  status: AccessStatus | null;
  fullAccess: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  assignedAt: string | null;
  note: string | null;
  /**
   * Migration 203's stamp: when an administrator silenced the automated
   * trial arc for this account, or null when nobody has. Carried on this
   * row so the panel can show the real state rather than guessing; it is
   * WRITTEN only by app/actions/trialArc.ts.
   */
  trialArcSuppressedAt: string | null;
}

async function requireAdmin(): Promise<
  { ok: true; supabase: SupabaseServerClient } | { ok: false; error: string }
> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) return { ok: false, error: 'Admin access required.' };
  return { ok: true, supabase };
}

/** One wrapper so no action can forget the guard, and so a raw database error never reaches a browser. */
async function guarded<T>(
  label: string,
  run: (supabase: SupabaseServerClient) => Promise<T>
): Promise<MemberAccessActionResult<T>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  try {
    return { ok: true, data: await run(guard.supabase) };
  } catch (error) {
    console.error(`${label} failed`, error);
    return { ok: false, error: 'That change could not be saved. Please try again.' };
  }
}

type RawRow = {
  member_id: string;
  email: string | null;
  display_name: string | null;
  is_test: boolean;
  account_created_at: string;
  tier: string | null;
  source: string | null;
  status: string | null;
  full_access: boolean | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  assigned_at: string | null;
  note: string | null;
  trial_arc_suppressed_at: string | null;
};

function toRow(raw: RawRow): MemberAccessRow {
  return {
    memberId: raw.member_id,
    email: raw.email,
    displayName: raw.display_name,
    isTest: Boolean(raw.is_test),
    accountCreatedAt: raw.account_created_at,
    tier: isAccessTier(raw.tier) ? raw.tier : null,
    source: raw.source,
    status: isAccessStatus(raw.status) ? raw.status : null,
    fullAccess: Boolean(raw.full_access),
    trialStartedAt: raw.trial_started_at,
    trialEndsAt: raw.trial_ends_at,
    assignedAt: raw.assigned_at,
    note: raw.note,
    trialArcSuppressedAt: raw.trial_arc_suppressed_at,
  };
}

/** Every member, with the access state the panel renders. Test accounts are off by default, exactly as every other admin list in this app treats them. */
export async function listMemberAccessAction(
  includeTest = false
): Promise<MemberAccessActionResult<MemberAccessRow[]>> {
  return guarded('listMemberAccessAction', async (supabase) => {
    const { data, error } = await supabase.rpc('admin_list_member_access', {
      p_include_test: includeTest,
    });
    if (error) throw error;
    return ((data ?? []) as RawRow[]).map(toRow);
  });
}

export interface SetMemberAccessInput {
  memberId: string;
  tier?: AccessTier;
  fullAccess?: boolean;
  status?: AccessStatus;
  /** An absolute new trial end, as an ISO string. */
  trialEndsAt?: string;
  /** Or a number of days to add to whichever is later, today or the current trial end. */
  extendTrialDays?: number;
  note?: string;
}

/**
 * Assign a tier, grant or revoke full access, move a trial end, or any
 * combination. Every field is optional and an omitted field is left alone,
 * so the panel's individual controls each send only what they changed.
 *
 * Every write through here is recorded as a manual assignment, which is
 * what places the row under the database's protection from the future
 * billing build. It also writes a membership_tier_changed event, by way of
 * the trigger on the table rather than by anything in this file, so a
 * change made through psql in an emergency is recorded identically.
 */
export async function setMemberAccessAction(
  input: SetMemberAccessInput
): Promise<MemberAccessActionResult<true>> {
  if (input.tier !== undefined && !isAccessTier(input.tier)) {
    return { ok: false, error: 'Unknown tier.' };
  }
  if (input.status !== undefined && !isAccessStatus(input.status)) {
    return { ok: false, error: 'Unknown status.' };
  }
  if (
    input.extendTrialDays !== undefined &&
    (!Number.isInteger(input.extendTrialDays) ||
      input.extendTrialDays < 1 ||
      input.extendTrialDays > 3650)
  ) {
    return { ok: false, error: 'Extend a trial by a whole number of days, from 1 to 3650.' };
  }

  return guarded('setMemberAccessAction', async (supabase) => {
    const { error } = await supabase.rpc('admin_set_member_access', {
      p_member_id: input.memberId,
      p_tier: input.tier ?? null,
      p_full_access: input.fullAccess ?? null,
      p_status: input.status ?? null,
      p_trial_ends_at: input.trialEndsAt ?? null,
      p_extend_trial_days: input.extendTrialDays ?? null,
      p_note: input.note ?? null,
    });
    if (error) throw error;
    // Her plan just changed, and her plan is what decides what opens. See
    // lib/data/readOnce.ts.
    forgetMemberAssessmentFacts(input.memberId);
    revalidatePath('/admin/access');
    return true as const;
  });
}

/**
 * Expire this member now. Sets tier none, status expired, and clears any
 * full access grant, because leaving one standing would make "expire" do
 * nothing at all. One database function, so the three always move together.
 */
export async function expireMemberAccessAction(
  memberId: string,
  note?: string
): Promise<MemberAccessActionResult<true>> {
  return guarded('expireMemberAccessAction', async (supabase) => {
    const { error } = await supabase.rpc('admin_expire_member_access', {
      p_member_id: memberId,
      p_note: note ?? null,
    });
    if (error) throw error;
    // Same reason as setMemberAccessAction above.
    forgetMemberAssessmentFacts(memberId);
    revalidatePath('/admin/access');
    return true as const;
  });
}
