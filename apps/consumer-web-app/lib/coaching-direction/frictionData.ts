/**
 * The friction question's own reads and writes.
 *
 * Same reason ./escalationData.ts and ./gradesData.ts exist separately from
 * ./data.ts: that file's DECISION_COLUMNS is selected on the member's own
 * render path on every load, so adding migration 166's four columns to it
 * would make every decision read fail with an unknown-column error in the
 * window between this code deploying and the migration being applied. That
 * would silently switch off the whole adaptive coaching engine on the live
 * site.
 *
 * So every function here issues its own query with its own column list and
 * FAILS CLOSED. Before migration 166 exists: no friction is ever known to
 * have been asked, `shouldAskFriction` therefore always says "ask", and the
 * one place that acts on it declines to ask when it cannot record the
 * answer. The net effect is that this whole feature is dormant until the
 * migration lands, and the engine behaves byte for byte as it did before.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isFrictionReason, NO_FRICTION_STATE, type FrictionReason, type ThreadFrictionState } from './friction';

type FrictionRow = {
  thread_key: string;
  local_date: string;
  friction_asked_at: string | null;
  friction_reason: string | null;
  friction_answered_at: string | null;
};

/**
 * Every thread this member has ever been asked the friction question about,
 * with her answer if she gave one.
 *
 * The second return value is what makes the dormancy safe: `available` is
 * false when the columns are not there yet, and the one caller uses it to
 * decline to ask rather than to ask a question whose answer it could not
 * store. Asking a member something and then losing her reply is worse than
 * not asking.
 */
export async function listThreadFriction(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ byThread: Map<string, ThreadFrictionState>; available: boolean }> {
  const { data, error } = await supabase
    .from('member_coaching_decisions')
    .select('thread_key, local_date, friction_asked_at, friction_reason, friction_answered_at')
    .eq('member_id', memberId)
    .not('friction_asked_at', 'is', null)
    .order('friction_asked_at', { ascending: true });

  if (error || !data) {
    if (error) console.error('listThreadFriction failed (expected before migration 166)', error);
    return { byThread: new Map(), available: false };
  }

  const byThread = new Map<string, ThreadFrictionState>();
  for (const row of data as unknown as FrictionRow[]) {
    const reason = isFrictionReason(row.friction_reason) ? row.friction_reason : null;
    const previous = byThread.get(row.thread_key) ?? NO_FRICTION_STATE;
    byThread.set(row.thread_key, {
      asked: true,
      // Once answered, always answered: a later unanswered ask for the same
      // thread must not erase what she already told us.
      answered: previous.answered || row.friction_answered_at !== null,
      reason: reason ?? previous.reason,
      // Rows arrive oldest-first, so the last one wins and this ends up as
      // the most recent ask.
      lastAskedLocalDate: row.local_date,
    });
  }

  return { byThread, available: true };
}

/**
 * Record that Root put the question in front of her, on today's decision row.
 *
 * Idempotent by the `is null` guard: a member reloading the page five times
 * is asked once, and `friction_asked_at` keeps the timestamp of the first
 * time it genuinely reached her.
 */
export async function markFrictionAsked(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_coaching_decisions')
    .update({ friction_asked_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .is('friction_asked_at', null);

  if (error) {
    console.error('markFrictionAsked failed (expected before migration 166)', error);
    return false;
  }
  return true;
}

/**
 * Store her answer on the same decision row the question was asked on.
 *
 * `note` is her own words and is written for a coach to read. The ENGINE
 * never reads it: `approachForFrictionReason` takes the tapped reason and
 * nothing else, so free text can never be parsed into a decision about her.
 */
export async function recordFrictionAnswer(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  reason: FrictionReason,
  note: string | null
): Promise<boolean> {
  const trimmed = note?.trim();
  const { error } = await supabase
    .from('member_coaching_decisions')
    .update({
      friction_reason: reason,
      friction_note: trimmed && trimmed.length > 0 ? trimmed.slice(0, 1000) : null,
      friction_answered_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('local_date', localDate);

  if (error) {
    console.error('recordFrictionAnswer failed', error);
    return false;
  }
  return true;
}
