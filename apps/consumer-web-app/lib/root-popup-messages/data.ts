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

export function cvsPopupMessageKey(kind: 'day3' | 'day7' | 'offer', experimentOrSessionId: string): string {
  return `cvs_${kind}:${experimentOrSessionId}`;
}

/** Same shape as cvsPopupMessageKey, for Life Signal Check's own day-3/day-7 follow-ups and start-it-later offer. */
export function lscPopupMessageKey(kind: 'day3' | 'day7' | 'offer', experimentOrSessionId: string): string {
  return `lsc_${kind}:${experimentOrSessionId}`;
}

/** Same shape as cvsPopupMessageKey/lscPopupMessageKey, for Readiness Pulse's own day-3/day-7 follow-ups and start-it-later offer. */
export function rplPopupMessageKey(kind: 'day3' | 'day7' | 'offer', experimentOrSessionId: string): string {
  return `rpl_${kind}:${experimentOrSessionId}`;
}

/** Same shape as the three above, for the Personal Reset Plan's own day-3/day-7 follow-ups — no 'offer' kind, since the plan has no one-time start-it-later message (its dashboard card is the only offer). */
export function resetPlanPopupMessageKey(kind: 'day3' | 'day7', planId: string): string {
  return `reset_plan_${kind}:${planId}`;
}

/**
 * Assignment-Gated Questionnaires task — keyed by the assignment row's own
 * id, not the questionnaire's key, so a new assignment cycle for the same
 * questionnaire (a prior one completed or was cancelled, and the coach
 * assigned it again) always earns a genuinely new message key and
 * therefore a fresh pop-up, while a dismissal of this exact assignment's
 * pop-up never repeats for this exact assignment.
 */
export function questionnaireAssignedPopupMessageKey(assignmentId: string): string {
  return `questionnaire_assigned:${assignmentId}`;
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

/**
 * Given candidates in priority order and a due-check predicate, returns
 * the first candidate still due, or null once every candidate has already
 * been dismissed. This is the exact shape every one-time ("offer"-like)
 * message in the Root pop-up waterfall (app/actions/rootPopupMessages.ts)
 * must use for a list of same-kind candidates — see that file's own
 * header comment on the real "one dismissal kills every later pop-up"
 * starvation bug (fixed 2026-08-02, commit 85bdb347) this discipline
 * exists to prevent: a caller that returns the first candidate
 * unconditionally, without checking due-ness itself and falling through
 * to the next, reintroduces that exact bug for whichever message type
 * skips it. Used by the coach-assigned-questionnaire branch (a member can
 * have more than one pending assignment) exactly the same way the
 * existing cvs_offer/lsc_offer/rpl_offer branches already use their own
 * inline version of this same check.
 */
export async function pickFirstDueOneTimeMessage<T extends { messageKey: string }>(
  candidates: T[],
  isDue: (messageKey: string) => Promise<boolean>
): Promise<T | null> {
  for (const candidate of candidates) {
    if (await isDue(candidate.messageKey)) return candidate;
  }
  return null;
}

/**
 * Whether a "start it later" offer pop-up (cvs_offer/lsc_offer) is due.
 * Unlike isRootPopupDueThisLogin, there is no snoozed/next-login case here
 * — RootMessagePopupClient records the dismissal (status 'ignored') the
 * instant the offer is shown, so any dismissal row at all, regardless of
 * status, means it has already had its one showing and must never pop up
 * again. The dashboard card remains the permanent, un-timed way to start
 * it later.
 */
export function isOfferPopupDue(dismissal: RootPopupDismissal | null): boolean {
  return dismissal === null;
}
