/**
 * Database access for the generic in-app notifications table (migration 39)
 * — same pure-function-taking-a-client shape as every other data.ts in this
 * codebase. RLS decides who may read/write what.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Notification, NotificationType } from '@mef/shared-types-contracts';

export type NotificationInput = {
  memberId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  sourceFeature?: string | null;
  sourceRecordId?: string | null;
};

export async function insertNotification(
  supabase: SupabaseClient,
  input: NotificationInput
): Promise<Notification | null> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      member_id: input.memberId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      source_feature: input.sourceFeature ?? null,
      source_record_id: input.sourceRecordId ?? null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('insertNotification failed', error);
    return null;
  }
  return data as Notification;
}

export async function listNotifications(
  supabase: SupabaseClient,
  memberId: string,
  options: { unreadOnly?: boolean; limit?: number } = {}
): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (options.unreadOnly) query = query.is('read_at', null);
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    console.error('listNotifications failed', error);
    return [];
  }
  return data as Notification[];
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);

  if (error) {
    console.error('markNotificationRead failed', error);
    return false;
  }
  return true;
}
