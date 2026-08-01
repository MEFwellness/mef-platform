/**
 * Database access for member_root_popup_dismissals (migration 137) — the
 * "Maybe later" (snoozed, returns next login) / "Ignore" (permanent)
 * state behind Root's pop-up messages. Same pure-functions-take-a-
 * SupabaseClient, RLS-is-the-boundary shape as
 * lib/core-values-snapshot/dailyLogsData.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type RootPopupDismissalStatus = 'snoozed' | 'ignored';

export type RootPopupDismissal = {
  status: RootPopupDismissalStatus;
  snoozedAt: string | null;
};

export function cvsPopupMessageKey(kind: 'day3' | 'day7', experimentId: string): string {
  return `cvs_${kind}:${experimentId}`;
}

export async function getRootPopupDismissal(
  supabase: SupabaseClient,
  memberId: string,
  messageKey: string
): Promise<RootPopupDismissal | null> {
  const { data, error } = await supabase
    .from('member_root_popup_dismissals')
    .select('status, snoozed_at')
    .eq('member_id', memberId)
    .eq('message_key', messageKey)
    .maybeSingle();

  if (error || !data) return null;
  return { status: data.status as RootPopupDismissalStatus, snoozedAt: (data.snoozed_at as string | null) ?? null };
}

export async function snoozeRootPopupMessage(
  supabase: SupabaseClient,
  memberId: string,
  messageKey: string
): Promise<boolean> {
  const { error } = await supabase.from('member_root_popup_dismissals').upsert(
    {
      member_id: memberId,
      message_key: messageKey,
      status: 'snoozed',
      snoozed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'member_id,message_key' }
  );

  if (error) {
    console.error('snoozeRootPopupMessage failed', error);
    return false;
  }
  return true;
}

export async function ignoreRootPopupMessage(
  supabase: SupabaseClient,
  memberId: string,
  messageKey: string
): Promise<boolean> {
  const { error } = await supabase.from('member_root_popup_dismissals').upsert(
    {
      member_id: memberId,
      message_key: messageKey,
      status: 'ignored',
      snoozed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'member_id,message_key' }
  );

  if (error) {
    console.error('ignoreRootPopupMessage failed', error);
    return false;
  }
  return true;
}

/** Called once a message is answered/acknowledged so no stale snooze/ignore row lingers for a message that can never be pending again. */
export async function clearRootPopupDismissal(
  supabase: SupabaseClient,
  memberId: string,
  messageKey: string
): Promise<void> {
  const { error } = await supabase
    .from('member_root_popup_dismissals')
    .delete()
    .eq('member_id', memberId)
    .eq('message_key', messageKey);

  if (error) console.error('clearRootPopupDismissal failed', error);
}

/**
 * Whether this message is due to interrupt the member as a pop-up on the
 * current login. `null` dismissal (never touched) always pops. 'ignored'
 * never pops again. 'snoozed' pops again only once a real login has
 * happened since the snooze — lastSignInAt is auth.users.last_sign_in_at,
 * which GoTrue updates on an actual sign-in, never on a silent token
 * refresh, so this is a genuine "next time they log in" check rather than
 * "next time they load this page."
 */
export function isRootPopupDueThisLogin(
  dismissal: RootPopupDismissal | null,
  lastSignInAt: string | null
): boolean {
  if (!dismissal) return true;
  if (dismissal.status === 'ignored') return false;
  if (!dismissal.snoozedAt || !lastSignInAt) return true;
  return new Date(lastSignInAt).getTime() > new Date(dismissal.snoozedAt).getTime();
}
