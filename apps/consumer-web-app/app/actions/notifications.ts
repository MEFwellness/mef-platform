'use server';

/**
 * Member-facing reads/writes for the generic in-app `notifications` table
 * (migration 39) — the first member UI to actually use it. Reuses
 * lib/notifications/data.ts verbatim; this file only adds the
 * session-scoped member_id lookup every other action file already does.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import type { Notification } from '@mef/shared-types-contracts';
import { listNotifications, markNotificationRead } from '@/lib/notifications/data';

export async function getMyNotifications(limit = 10): Promise<Notification[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return listNotifications(supabase, user.id, { limit });
}

export async function markMyNotificationRead(notificationId: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await markNotificationRead(supabase, notificationId);
  if (!ok) return { error: 'Could not update notification.' };
  return {};
}
