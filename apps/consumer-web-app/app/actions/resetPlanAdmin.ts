/**
 * apps/consumer-web-app/app/actions/resetPlanAdmin.ts
 *
 * Testing-only tools for the Personal Reset Plan — reset one specific
 * member's plan so it can be created fresh, and time-shift an active
 * plan's start date so the day-3/day-7 "From Root" follow-ups can be
 * verified without waiting real days. Mirrors
 * app/actions/coreValuesSnapshotAdmin.ts's exact shape: every function
 * requires an active `platform_administrator` role, checked explicitly
 * here AND independently enforced by the real
 * platform_admin_all_member_reset_plans/... RLS policies (migration 142)
 * — a bug in this file's own check could never let a non-admin actually
 * write another member's data. Explicitly scoped by member_id everywhere,
 * same as the Core Values Snapshot admin tool's own real bug fix: never
 * grabs "whichever experience's experiment was created most recently."
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { resetPlanPopupMessageKey } from '@/lib/root-popup-messages/data';

type SupabaseServerClient = ReturnType<typeof createClient>;

async function requireAdmin(): Promise<{ ok: true; supabase: SupabaseServerClient } | { ok: false; error: string }> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) return { ok: false, error: 'Admin access required.' };
  return { ok: true, supabase };
}

export type ResetPlanTestableMember = { id: string; displayName: string };

export async function listResetPlanTestableMembersAction(): Promise<ResetPlanTestableMember[]> {
  const guard = await requireAdmin();
  if (!guard.ok) return [];

  const { data, error } = await guard.supabase
    .from('profiles')
    .select('id, display_name')
    .order('display_name', { ascending: true, nullsFirst: false });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id as string,
    displayName: (row.display_name as string | null) ?? (row.id as string).slice(0, 8),
  }));
}

export type ResetPlanAdminActionResult = { ok: true; summary: string } | { ok: false; error: string };

/** GRANT — sets profiles.reset_plan_granted_at for this member so the dashboard card appears (mirrors how the future checkout flow will grant access). */
export async function grantResetPlanAccessAction(memberId: string): Promise<ResetPlanAdminActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!memberId) return { ok: false, error: 'Choose a member first.' };

  const { error } = await guard.supabase
    .from('profiles')
    .update({ reset_plan_granted_at: new Date().toISOString() })
    .eq('id', memberId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, summary: 'Granted. Reload this member\'s dashboard: the Personal Reset Plan card should appear.' };
}

export async function revokeResetPlanAccessAction(memberId: string): Promise<ResetPlanAdminActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!memberId) return { ok: false, error: 'Choose a member first.' };

  const { error } = await guard.supabase.from('profiles').update({ reset_plan_granted_at: null }).eq('id', memberId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, summary: 'Revoked. The dashboard card and direct URL access should both disappear for this member.' };
}

/** RESET — deletes this member's current plan (versions/daily logs cascade) so they can create one fresh. */
export async function resetResetPlanForMemberAction(memberId: string): Promise<ResetPlanAdminActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!memberId) return { ok: false, error: 'Choose a member first.' };

  const { data: deleted, error } = await guard.supabase.from('member_reset_plans').delete().eq('member_id', memberId).select('id');
  if (error) return { ok: false, error: error.message };

  const count = deleted?.length ?? 0;
  return { ok: true, summary: `Removed ${count} plan${count === 1 ? '' : 's'} (versions and daily logs cascaded). This member can create a fresh plan now.` };
}

export type ResetPlanShiftTarget = 3 | 7;
export type ResetPlanShiftPattern = 'mostly_normal' | 'mixed' | 'mostly_not_today' | 'no_response';

/**
 * TIME-SHIFT — moves a member's active plan's start_local_date back so it
 * reads as day 3 or day 7 right now, clears any previously-shown day-3/
 * day-7 pop-up dismissal for this exact plan (member_root_popup_dismissals,
 * keyed by resetPlanPopupMessageKey), and for a day-7 shift, seeds a real
 * daily-log pattern across the shifted window so the day-7 reflection has
 * something honest to read — including the true "no response logged"
 * case (no rows inserted at all).
 */
export async function shiftResetPlanAction(
  memberId: string,
  targetDay: ResetPlanShiftTarget,
  pattern: ResetPlanShiftPattern = 'mostly_normal'
): Promise<ResetPlanAdminActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  const supabase = guard.supabase;
  if (!memberId) return { ok: false, error: 'Choose a member first.' };

  const { data: plans, error: findError } = await supabase
    .from('member_reset_plans')
    .select('id, status')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (findError) return { ok: false, error: findError.message };

  const plan = plans?.[0];
  if (!plan) {
    return { ok: false, error: 'This member has no active Personal Reset Plan yet, have them complete the creation flow first.' };
  }

  const { data: versionRow, error: versionError } = await supabase
    .from('member_reset_plan_versions')
    .select('id')
    .eq('plan_id', plan.id)
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError || !versionRow) return { ok: false, error: 'This plan has no version history yet.' };

  const now = new Date();
  const newStart = new Date(now.getTime() - targetDay * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { error: updateError } = await supabase
    .from('member_reset_plans')
    .update({ start_local_date: newStart, day7_acknowledged_at: null, updated_at: now.toISOString() })
    .eq('id', plan.id);
  if (updateError) return { ok: false, error: `Could not shift the start date: ${updateError.message}` };

  await supabase
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', memberId)
    .in('message_key', [resetPlanPopupMessageKey('day3', plan.id as string), resetPlanPopupMessageKey('day7', plan.id as string)]);

  let seededSummary = '';
  if (targetDay === 7) {
    // true = normal, 'difficult' = difficult-day, false = not-today, null = no response logged (no row at all)
    const dailyPattern: (true | 'difficult' | false | null)[] =
      pattern === 'mostly_normal'
        ? [true, true, true, true, true, false, null]
        : pattern === 'mixed'
          ? [true, 'difficult', true, 'difficult', false, null, null]
          : pattern === 'mostly_not_today'
            ? [false, false, false, true, null, null, null]
            : [null, null, null, null, null, null, null];

    await supabase.from('member_reset_plan_daily_logs').delete().eq('plan_id', plan.id);

    const rows = dailyPattern
      .map((entry, dayIndex) => {
        if (entry === null) return null;
        const localDate = new Date(new Date(newStart).getTime() + dayIndex * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const state = entry === true ? 'completed_normal' : entry === 'difficult' ? 'completed_difficult' : 'not_today';
        return { plan_id: plan.id, plan_version_id: versionRow.id, member_id: memberId, local_date: localDate, state };
      })
      .filter((row): row is { plan_id: string; plan_version_id: string; member_id: string; local_date: string; state: string } => row !== null);

    if (rows.length > 0) {
      const { error: logsError } = await supabase.from('member_reset_plan_daily_logs').insert(rows);
      if (logsError) return { ok: false, error: `Shifted the date but could not seed daily logs: ${logsError.message}` };
    }

    seededSummary = ` Seeded a "${pattern}" pattern across the window (${rows.length} of 7 days logged).`;
  }

  return {
    ok: true,
    summary: `Shifted the plan to day ${targetDay} (start date now ${newStart}).${seededSummary} Reload the member's dashboard: the day-${targetDay} check-in should appear as its own "From Root" card and pop-up.`,
  };
}
