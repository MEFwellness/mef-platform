/**
 * Database access for the daily notification decision (migration 196),
 * plus the two existing reads it needs and does not own: who has a live
 * device, and when she last signed in.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, no session lookup of its own, and a failed
 * read returns a safe empty value rather than throwing. The safe value is
 * chosen in the direction of SENDING NOTHING: a read that fails must never
 * be the reason a member is interrupted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { FALLBACK_TIMEZONE } from '../time/memberToday';
import type { Cadence, PastDelivery } from './cadence';
import { openedWithin24h } from './cadence';

export type NotifiableMember = {
  memberId: string;
  timezone: string;
  /** profiles.push_send_hour_local, raw. lib/push-decision/window.ts resolves the default. */
  storedSendHour: number | null;
  isTest: boolean;
  liveDeviceCount: number;
};

export type PushDeliveryRecord = {
  id: string;
  localDate: string;
  sentAt: string;
  priorityRule: string;
  priorityKey: string | null;
  title: string;
  body: string;
  url: string;
  cadence: Cadence;
  source: 'scheduled' | 'admin';
  sentDeviceCount: number;
  retiredDeviceCount: number;
};

const DELIVERY_COLUMNS =
  'id, local_date, sent_at, priority_rule, priority_key, title, body, url, cadence, source, sent_device_count, retired_device_count';

type DeliveryRow = {
  id: string;
  local_date: string;
  sent_at: string;
  priority_rule: string;
  priority_key: string | null;
  title: string;
  body: string;
  url: string;
  cadence: Cadence;
  source: 'scheduled' | 'admin';
  sent_device_count: number;
  retired_device_count: number;
};

function fromDeliveryRow(row: DeliveryRow): PushDeliveryRecord {
  return {
    id: row.id,
    localDate: row.local_date,
    sentAt: row.sent_at,
    priorityRule: row.priority_rule,
    priorityKey: row.priority_key,
    title: row.title,
    body: row.body,
    url: row.url,
    cadence: row.cadence,
    source: row.source,
    sentDeviceCount: row.sent_device_count,
    retiredDeviceCount: row.retired_device_count,
  };
}

/**
 * Everyone the scheduled pass may consider at all: reminders switched on,
 * at least one device that has not been revoked.
 *
 * BOTH HALVES MATTER AND NEITHER IMPLIES THE OTHER. The switch can be on
 * with every device retired by a push service reporting them gone, and a
 * device row can outlive a switch that was flipped off by a path that
 * failed halfway. Requiring both here means the pass never even considers
 * a member it could not reach, and lib/push/send.ts reads the preference
 * again at send time, so "off" is true at two independent locks.
 *
 * TEST ACCOUNTS ARE EXCLUDED FROM THE SCHEDULE, ALWAYS. The seeded QA
 * fixtures must not be woken up every morning by a live cron. They remain
 * fully reachable through the administrator's force-run tool, which is
 * the only way this feature can be proved on production at all, and that
 * tool names a single member rather than running a pass.
 */
export async function listNotifiableMembers(
  supabase: SupabaseClient
): Promise<NotifiableMember[]> {
  const { data: devices, error: deviceError } = await supabase
    .from('member_push_subscriptions')
    .select('member_id')
    .is('revoked_at', null);

  if (deviceError || !devices || devices.length === 0) {
    if (deviceError) console.error('listNotifiableMembers: devices read failed', deviceError);
    return [];
  }

  const counts = new Map<string, number>();
  for (const row of devices) {
    const id = row.member_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, timezone, is_test, push_notifications_enabled, push_send_hour_local')
    .in('id', [...counts.keys()])
    .eq('push_notifications_enabled', true);

  if (profileError || !profiles) {
    if (profileError) console.error('listNotifiableMembers: profiles read failed', profileError);
    return [];
  }

  return profiles
    .filter((row) => row.is_test !== true)
    .map((row) => ({
      memberId: row.id as string,
      timezone: (row.timezone as string | null) ?? FALLBACK_TIMEZONE,
      storedSendHour: (row.push_send_hour_local as number | null) ?? null,
      isTest: row.is_test === true,
      liveDeviceCount: counts.get(row.id as string) ?? 0,
    }));
}

/**
 * The same three facts for ONE named member, whatever her state, so the
 * administrator's force-run tool can run the real decision for a member
 * the scheduled pass would never have selected and report why.
 */
export async function loadNotifiableMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<NotifiableMember | null> {
  const [{ data: profile, error }, { count }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, timezone, is_test, push_send_hour_local')
      .eq('id', memberId)
      .maybeSingle(),
    supabase
      .from('member_push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', memberId)
      .is('revoked_at', null),
  ]);

  if (error || !profile) return null;

  return {
    memberId: profile.id as string,
    timezone: (profile.timezone as string | null) ?? FALLBACK_TIMEZONE,
    storedSendHour: (profile.push_send_hour_local as number | null) ?? null,
    isTest: profile.is_test === true,
    liveDeviceCount: count ?? 0,
  };
}

/** Today's receipt, if one was already claimed. */
export async function getPushDelivery(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<PushDeliveryRecord | null> {
  const { data, error } = await supabase
    .from('member_push_deliveries')
    .select(DELIVERY_COLUMNS)
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error || !data) return null;
  return fromDeliveryRow(data as DeliveryRow);
}

/**
 * THE CAP. Claims today's one receipt, if today has none.
 *
 * insert ... on conflict do nothing against the table's own unique
 * (member_id, local_date), so two overlapping runs produce exactly one
 * row and exactly one of them is told it won. Returns null when the claim
 * was a genuine no-op, which is the caller's signal to send nothing at
 * all: somebody else already has today.
 *
 * Called immediately BEFORE the push service is asked for anything, never
 * after. A receipt written after a successful send would leave a window
 * where the send happened and the record did not, and the only way out of
 * that window is a second notification. See migration 196's header.
 */
export async function claimPushDelivery(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  fields: {
    priorityRule: string;
    priorityKey: string | null;
    title: string;
    body: string;
    url: string;
    cadence: Cadence;
    source: 'scheduled' | 'admin';
  }
): Promise<PushDeliveryRecord | null> {
  const { data, error } = await supabase
    .from('member_push_deliveries')
    .upsert(
      {
        member_id: memberId,
        local_date: localDate,
        priority_rule: fields.priorityRule,
        priority_key: fields.priorityKey,
        title: fields.title,
        body: fields.body,
        url: fields.url,
        cadence: fields.cadence,
        source: fields.source,
      },
      { onConflict: 'member_id,local_date', ignoreDuplicates: true }
    )
    .select(DELIVERY_COLUMNS);

  if (error) {
    console.error('claimPushDelivery failed', error);
    return null;
  }

  // "NO ERROR" IS NOT "IT WORKED". An insert that conflicted returns zero
  // rows and no error, and that is the ordinary losing case here. Read
  // what came back rather than assuming.
  const claimed = (data as DeliveryRow[] | null)?.[0];
  return claimed ? fromDeliveryRow(claimed) : null;
}

/**
 * What the push service actually did, recorded on the receipt that was
 * already claimed. Best effort: the cap has already been spent, so a
 * failure here loses a count and never causes a second send.
 */
export async function recordPushDeliveryOutcome(
  supabase: SupabaseClient,
  deliveryId: string,
  outcome: { sentDeviceCount: number; retiredDeviceCount: number }
): Promise<void> {
  const { error } = await supabase
    .from('member_push_deliveries')
    .update({
      sent_device_count: outcome.sentDeviceCount,
      retired_device_count: outcome.retiredDeviceCount,
    })
    .eq('id', deliveryId);

  if (error) console.error('recordPushDeliveryOutcome failed', error);
}

/** Her most recent reminders, newest first. */
export async function listRecentPushDeliveries(
  supabase: SupabaseClient,
  memberId: string,
  limit: number
): Promise<PushDeliveryRecord[]> {
  const { data, error } = await supabase
    .from('member_push_deliveries')
    .select(DELIVERY_COLUMNS)
    .eq('member_id', memberId)
    .order('local_date', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as DeliveryRow[]).map(fromDeliveryRow);
}

/**
 * Her completed sign-ins at or after an instant, as instants.
 *
 * Reads `session_started` from member_wellness_events, which
 * app/actions/auth.ts already writes one row of per completed sign-in
 * (migration 146). This is a read of an existing pipeline and adds no
 * tracking of its own. `occurred_at` is the ordering column that table's
 * own header names, so it is the one used here.
 */
export async function listSignInsSince(
  supabase: SupabaseClient,
  memberId: string,
  sinceIso: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('member_wellness_events')
    .select('occurred_at')
    .eq('member_id', memberId)
    .eq('event_type', 'session_started')
    .gte('occurred_at', sinceIso)
    .order('occurred_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];
  return data.map((row) => row.occurred_at as string);
}

/**
 * Her recent reminders turned into the pure cadence rule's input, plus
 * the one extra fact that rule needs: whether she has opened the app at
 * all since the most recent one.
 *
 * ONE SIGN-IN READ, NOT ONE PER REMINDER. Every question asked here is
 * about instants at or after the OLDEST reminder considered, so a single
 * range read answers all of them.
 */
export async function loadCadenceHistory(
  supabase: SupabaseClient,
  memberId: string,
  limit: number
): Promise<{ recent: PastDelivery[]; openedSinceLastSent: boolean }> {
  const deliveries = await listRecentPushDeliveries(supabase, memberId, limit);
  if (deliveries.length === 0) return { recent: [], openedSinceLastSent: false };

  const oldest = deliveries[deliveries.length - 1]!;
  const signIns = await listSignInsSince(supabase, memberId, oldest.sentAt);

  const newest = deliveries[0]!;
  const newestSentAt = new Date(newest.sentAt).getTime();
  const openedSinceLastSent = signIns.some((iso) => {
    const at = new Date(iso).getTime();
    return !Number.isNaN(at) && at >= newestSentAt;
  });

  return {
    recent: deliveries.map((delivery) => ({
      localDate: delivery.localDate,
      sentAt: delivery.sentAt,
      openedWithin24h: openedWithin24h(delivery.sentAt, signIns),
    })),
    openedSinceLastSent,
  };
}
