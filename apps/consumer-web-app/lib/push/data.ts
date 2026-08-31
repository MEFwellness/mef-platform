/**
 * Database access for member_push_subscriptions and the three push columns
 * on profiles (migration 195).
 *
 * Same shape as every other file of its kind here: pure functions that
 * take a SupabaseClient, no session lookup of their own, RLS is the real
 * boundary. The one exception is savePushSubscription, which goes through
 * the claim_member_push_subscription function rather than writing the
 * table directly, because retiring the previous owner of a shared device
 * is a write no member's own policies could make. See migration 195.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** The browser's own PushSubscription, exactly as `subscription.toJSON()` produces it. */
export type PushSubscriptionJson = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

export type PushPromptAnswer = 'enabled' | 'declined' | 'needs_install';

export type MemberPushState = {
  /** The single preference. False means send nothing, whatever devices exist. */
  enabled: boolean;
  /** Null until the one-time ask has actually been shown to her. */
  promptShownAt: string | null;
  promptAnswer: PushPromptAnswer | null;
  /** How many devices are saved and not revoked. */
  liveDeviceCount: number;
};

export type PushDevice = {
  id: string;
  memberId: string;
  endpoint: string;
  subscription: PushSubscriptionJson;
  deviceLabel: string | null;
  createdAt: string;
};

/** True when the value is a browser push subscription and not merely an object. */
export function isPushSubscriptionJson(value: unknown): value is PushSubscriptionJson {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.endpoint !== 'string' || candidate.endpoint.length === 0) return false;
  const keys = candidate.keys;
  if (!keys || typeof keys !== 'object') return false;
  const { p256dh, auth } = keys as Record<string, unknown>;
  return typeof p256dh === 'string' && p256dh.length > 0 && typeof auth === 'string' && auth.length > 0;
}

export async function getMemberPushState(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberPushState> {
  const [{ data: profile }, { count }] = await Promise.all([
    supabase
      .from('profiles')
      .select('push_notifications_enabled, push_prompt_shown_at, push_prompt_answer')
      .eq('id', memberId)
      .maybeSingle(),
    supabase
      .from('member_push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .is('revoked_at', null),
  ]);

  return {
    enabled: profile?.push_notifications_enabled === true,
    promptShownAt: (profile?.push_prompt_shown_at as string | null) ?? null,
    promptAnswer: (profile?.push_prompt_answer as PushPromptAnswer | null) ?? null,
    liveDeviceCount: count ?? 0,
  };
}

/**
 * Whether the one-time ask is still due. Never asked, and reminders are
 * currently off. Both halves matter: a member who already turned this on
 * from her profile has nothing to be asked about.
 */
export function isPushEnableAskDue(state: MemberPushState): boolean {
  if (state.promptShownAt !== null) return false;
  if (state.enabled) return false;
  return state.liveDeviceCount === 0;
}

/** Saves one device and turns her preference on, via the claim function. Returns the row id. */
export async function savePushSubscription(
  supabase: SupabaseClient,
  subscription: PushSubscriptionJson,
  deviceLabel: string | null
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase.rpc('claim_member_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_subscription: subscription,
    p_device_label: deviceLabel,
  });

  if (error) {
    console.error('savePushSubscription failed', error);
    return { error: 'Could not save this device.' };
  }
  return { id: data as string };
}

/** Retires every device this member has saved. Rows are kept, revoked_at is what changes. */
export async function revokeAllPushSubscriptions(
  supabase: SupabaseClient,
  memberId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_push_subscriptions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('revoked_at', null);

  if (error) {
    console.error('revokeAllPushSubscriptions failed', error);
    return false;
  }
  return true;
}

/** Retires one device, by its endpoint. Used when a push service reports an endpoint as gone. */
export async function revokePushSubscriptionByEndpoint(
  supabase: SupabaseClient,
  endpoint: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_push_subscriptions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('endpoint', endpoint)
    .is('revoked_at', null);

  if (error) {
    console.error('revokePushSubscriptionByEndpoint failed', error);
    return false;
  }
  return true;
}

export async function setPushNotificationsEnabled(
  supabase: SupabaseClient,
  memberId: string,
  enabled: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_notifications_enabled: enabled })
    .eq('id', memberId);

  if (error) {
    console.error('setPushNotificationsEnabled failed', error);
    return false;
  }
  return true;
}

/**
 * Records that the one-time ask was put in front of her, and what she did
 * with it. Written once: a second call cannot move push_prompt_shown_at,
 * because the filter refuses a row that already carries one. The answer is
 * therefore also fixed by the first call, which is correct, since there is
 * only ever one ask to answer.
 */
export async function recordPushPromptShown(
  supabase: SupabaseClient,
  memberId: string,
  answer: PushPromptAnswer
): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_prompt_shown_at: new Date().toISOString(), push_prompt_answer: answer })
    .eq('id', memberId)
    .is('push_prompt_shown_at', null);

  if (error) {
    console.error('recordPushPromptShown failed', error);
    return false;
  }
  return true;
}

/** Every live device for one member, ready to send to. */
export async function listLivePushDevices(
  supabase: SupabaseClient,
  memberId: string
): Promise<PushDevice[]> {
  const { data, error } = await supabase
    .from('member_push_subscriptions')
    .select('id, member_id, endpoint, subscription, device_label, created_at')
    .eq('member_id', memberId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data
    .filter((row) => isPushSubscriptionJson(row.subscription))
    .map((row) => ({
      id: row.id as string,
      memberId: row.member_id as string,
      endpoint: row.endpoint as string,
      subscription: row.subscription as PushSubscriptionJson,
      deviceLabel: (row.device_label as string | null) ?? null,
      createdAt: row.created_at as string,
    }));
}

/**
 * How many live devices each member has. Used by the admin testing tool to
 * offer only members a test push could actually reach, so a "nothing
 * happened" result never means "there was never anywhere to send it".
 */
export async function countLiveDevicesByMember(
  supabase: SupabaseClient
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('member_push_subscriptions')
    .select('member_id')
    .is('revoked_at', null);

  const counts = new Map<string, number>();
  if (error || !data) return counts;

  for (const row of data) {
    const memberId = row.member_id as string;
    counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
  }
  return counts;
}
