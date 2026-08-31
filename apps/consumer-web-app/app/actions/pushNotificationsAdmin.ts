'use server';

/**
 * apps/consumer-web-app/app/actions/pushNotificationsAdmin.ts
 *
 * The administrator's push testing tool: list the members who have a
 * device saved, and send one real notification to one of them right now.
 *
 * It exists because Part 2, the daily job that decides whether there is
 * genuinely something waiting, does not exist yet, and a real phone is the
 * only thing that can prove the whole chain works. Without this, the first
 * proof that a notification arrives would have to wait for the build that
 * assumes it already does.
 *
 * Same dual discipline as app/actions/coreValuesSnapshotAdmin.ts: an
 * explicit platform_administrator check here for a clean message, and the
 * platform_admin_all_push_subscriptions policy (migration 195) enforcing
 * it independently in the database, so a bug in this file's own check
 * could never reach another member's devices.
 *
 * It sends exactly one notification, to exactly the one member named, and
 * it says so on the notification itself. There is no send-to-everyone path
 * here.
 *
 * PART 2 ADDED THE SECOND BUTTON: run today's REAL decision for one
 * member, now. That is not a test notification with fixed words. It is
 * lib/push-decision/service.ts's runNotificationDecisionForMember, the
 * same function the hourly schedule calls, so whatever it decides is
 * exactly what the schedule would have decided. It skips two things and
 * says so: the test-account exclusion (otherwise the QA fixture, the only
 * account this is provable on, could never be run) and the send window
 * (otherwise this button would only work between nine and eleven in that
 * member's morning). It skips nothing else: her switch, her devices,
 * today's receipt, the quiet period, the card, the completion recheck and
 * the claim all apply exactly as they do at nine in the morning.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { countLiveDevicesByMember, listLivePushDevices } from '@/lib/push/data';
import { isPushSendingConfigured, sendPushToMember } from '@/lib/push/send';
import { PUSH_TEST_NOTIFICATION } from '@/lib/push/copy';
import { serviceRoleClient } from '@/lib/supabase/serviceRole';
import {
  runNotificationDecisionForMember,
  type NotificationDecision,
} from '@/lib/push-decision/service';

type SupabaseServerClient = ReturnType<typeof createClient>;

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

export type PushTestableMember = {
  id: string;
  displayName: string;
  deviceCount: number;
  /** What each saved device calls itself, so a real phone is recognisable in the list. */
  deviceLabels: string[];
  /** Her single preference. A device with the switch off is shown, and says so, rather than hidden. */
  remindersEnabled: boolean;
};

/**
 * Only members with at least one live device. A member with nowhere to
 * send is not offered, so "nothing arrived" can never quietly mean "there
 * was never anywhere to send it".
 *
 * Test accounts are deliberately included, exactly as the other two
 * testing tools include them: a QA fixture is the expected target here,
 * not an exception to hide.
 */
export async function listPushTestableMembersAction(): Promise<PushTestableMember[]> {
  const guard = await requireAdmin();
  if (!guard.ok) return [];

  const counts = await countLiveDevicesByMember(guard.supabase);
  const memberIds = [...counts.keys()];
  if (memberIds.length === 0) return [];

  const [{ data: profiles }, { data: devices }] = await Promise.all([
    guard.supabase
      .from('profiles')
      .select('id, display_name, push_notifications_enabled')
      .in('id', memberIds),
    guard.supabase
      .from('member_push_subscriptions')
      .select('member_id, device_label')
      .in('member_id', memberIds)
      .is('revoked_at', null),
  ]);

  const labels = new Map<string, string[]>();
  for (const row of devices ?? []) {
    const memberId = row.member_id as string;
    const label = (row.device_label as string | null) ?? 'Unnamed device';
    labels.set(memberId, [...(labels.get(memberId) ?? []), label]);
  }

  return (profiles ?? [])
    .map((row) => ({
      id: row.id as string,
      displayName: (row.display_name as string | null) ?? (row.id as string).slice(0, 8),
      deviceCount: counts.get(row.id as string) ?? 0,
      deviceLabels: labels.get(row.id as string) ?? [],
      remindersEnabled: row.push_notifications_enabled === true,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export type PushAdminActionResult = { ok: true; summary: string } | { ok: false; error: string };

/** Whether this deployment has the keys a send needs at all, so the screen can say so plainly. */
export async function isPushSendingConfiguredAction(): Promise<boolean> {
  const guard = await requireAdmin();
  if (!guard.ok) return false;
  return isPushSendingConfigured();
}

export async function sendTestPushToMemberAction(memberId: string): Promise<PushAdminActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!memberId) return { ok: false, error: 'Pick a member first.' };
  if (!isPushSendingConfigured()) {
    return {
      ok: false,
      error:
        'This deployment has no push keys set, so nothing could be sent. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, then redeploy.',
    };
  }

  const devices = await listLivePushDevices(guard.supabase, memberId);
  if (devices.length === 0) {
    return { ok: false, error: 'That member has no device saved right now, so there was nowhere to send.' };
  }

  const result = await sendPushToMember(guard.supabase, memberId, { ...PUSH_TEST_NOTIFICATION });

  if (result.skipped) return { ok: false, error: result.skipped };

  const parts: string[] = [];
  parts.push(result.sent === 1 ? 'Sent to 1 device.' : `Sent to ${result.sent} devices.`);
  if (result.retired > 0) {
    parts.push(
      result.retired === 1
        ? '1 device was gone and has been retired.'
        : `${result.retired} devices were gone and have been retired.`
    );
  }
  for (const failure of result.failures) {
    parts.push(
      `${failure.deviceLabel ?? 'A device'} refused it${failure.status ? ` (${failure.status})` : ''}: ${failure.message}`
    );
  }

  if (result.sent === 0) {
    return { ok: false, error: parts.join(' ') };
  }
  return { ok: true, summary: parts.join(' ') };
}

/**
 * Run today's real notification decision for one member, right now, and
 * say what it decided and why.
 *
 * The whole answer is one sentence written by lib/push-decision/explain.ts
 * plus the facts behind it, so this action composes nothing and decides
 * nothing: it authorizes, it runs the job, it hands back what the job
 * said.
 *
 * IT RUNS THE JOB WITH THE SERVICE ROLE, NOT WITH THE ADMINISTRATOR'S OWN
 * CLIENT, and that is not a shortcut past a policy. The delivery receipt
 * in migration 196 deliberately has no insert policy for anybody, so that
 * no session can manufacture or erase one and thereby hand itself a
 * second notification. An administrator's own client therefore cannot
 * claim a receipt, which is right, and it is also exactly what the first
 * production run of this tool discovered: the claim was refused, the job
 * read the refusal as "another run got there first", and it reported a
 * lost race that had never happened. The administrator is authorized
 * above, against the database, before this line is reached; the JOB then
 * runs as the platform, which is what it is when the schedule runs it at
 * nine in the morning.
 */
export type NotificationDecisionResult =
  | { ok: true; decision: NotificationDecision }
  | { ok: false; error: string };

export async function runNotificationDecisionAction(
  memberId: string
): Promise<NotificationDecisionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  if (!memberId) return { ok: false, error: 'Pick a member first.' };
  if (!isPushSendingConfigured()) {
    return {
      ok: false,
      error:
        'This deployment has no push keys set, so the decision could run but nothing could be sent. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, then redeploy.',
    };
  }

  let job;
  try {
    job = serviceRoleClient();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'This deployment cannot run the job.',
    };
  }

  const decision = await runNotificationDecisionForMember(job, memberId, { source: 'admin' });
  return { ok: true, decision };
}
