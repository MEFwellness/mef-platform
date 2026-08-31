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
/**
 * The public entry welcome (migration 197), keyed by the public session she
 * actually arrived through rather than by a constant, so a member is only
 * ever offered this for the one arrival that is genuinely hers and a
 * dismissal can never be inherited from anything else.
 */
export function publicEntryWelcomePopupMessageKey(sessionId: string): string {
  return `public_entry_welcome:${sessionId}`;
}

export function questionnaireAssignedPopupMessageKey(assignmentId: string): string {
  return `questionnaire_assigned:${assignmentId}`;
}

/**
 * The Priority Card's pop-up key, scoped to the member's own local date.
 *
 * The date IS the once-per-day rule. Every other message here is keyed by
 * a row id and uses one of the two dismissal lifetimes (recurring
 * "snoozed comes back next login", or one-time-ever); the Priority Card
 * needs a third lifetime, "once per calendar day", and a date-scoped key
 * expresses exactly that on top of the existing one-time-ever rule with no
 * schema change and no second dismissal system: today's key can only ever
 * be dismissed once, and tomorrow's key is a genuinely new message.
 *
 * A reload later the same day therefore finds a dismissal row and does not
 * re-pop, while tomorrow's first open pops again.
 */
export function priorityCardPopupMessageKey(localDate: string): string {
  return `priority_card:${localDate}`;
}

/**
 * The Weekly Root Review's pop-up key, scoped to the member's own local
 * WEEK start (her own Monday, per lib/weekly-review/week.ts).
 *
 * Exactly the same mechanism as the Priority Card's date-scoped key one
 * scale up: the week IS the once-per-week rule. This week's key can be
 * dismissed exactly once under the existing one-time-ever rule
 * (isOfferPopupDue), and next Monday's key is a genuinely new message that
 * pops again. No fourth dismissal lifetime, no new column, and no schedule.
 *
 * The deferral case falls out of this for free rather than needing its own
 * rule: on a week where a finite item (a coach assignment, a day-3 or day-7
 * follow-up) wins the slot, this key simply has no dismissal row yet, so it
 * is still due on the next open.
 */
export function weeklyReviewPopupMessageKey(weekStart: string): string {
  return `weekly_review:${weekStart}`;
}

/**
 * The Weekly Reflection's pop-up key, scoped to the member's own local
 * FRIDAY (lib/weekly-reflection/week.ts).
 *
 * The same week-scoped mechanism as weeklyReviewPopupMessageKey above, on
 * a different anchor and with a different DISMISSAL LIFETIME, and the
 * difference is worth stating because the two keys look alike.
 *
 * The Weekly Root Review is Root reporting, once, and it uses the
 * one-time-ever rule: it is marked dismissed the instant it is shown.
 * The Weekly Reflection ASKS SOMETHING OF HER, so it uses the recurring
 * rule instead (isRootPopupDueThisLogin): "Maybe later" genuinely means
 * ask again on her next login inside the window, and "Ignore" means not
 * again this week. Next Friday is a new key either way, so an ignored week
 * can never retire the experience itself.
 *
 * That is exactly the same pairing questionnaire_assigned and
 * free_arc_available use, which is why this needs no fourth lifetime and
 * no new column.
 */
export function weeklyReflectionPopupMessageKey(weekStart: string): string {
  return `weekly_reflection:${weekStart}`;
}

/**
 * The Stress & Load Deep-Dive's pop-up key, scoped to the ASSIGNMENT it
 * invites her into.
 *
 * The assignment id is the right scope because the assignment is the whole
 * gate for this experience. One assignment is one invitation: a "Maybe
 * later" comes back on her next login, an "Ignore" retires that invitation,
 * and a coach who assigns it again after a completion creates a NEW
 * assignment row, so the new invitation carries a genuinely new key and is
 * offered from scratch. There is no way for an ignored assignment to retire
 * the experience itself.
 *
 * Its dismissal lifetime is the RECURRING one (isRootPopupDueThisLogin),
 * the same one questionnaire_assigned uses, for the same reason: this is a
 * coach's direct request of this member, so "Maybe later" has to genuinely
 * mean ask again next login rather than never again.
 */
export function stressLoadPopupMessageKey(assignmentId: string): string {
  return `stress_load:${assignmentId}`;
}

/**
 * Conditional water tracking's own one-time question, for members who
 * finished intake before it existed (migration 163). A fixed constant key,
 * unlike every other key in this file: this is not scoped to a row, a date
 * or a week, because it is asked once in a membership and then never again.
 * Lives in lib/hydration/constants.ts alongside the rest of that feature's
 * vocabulary; re-exported here so the pop-up chain reads consistently.
 */
export { HYDRATION_POPUP_MESSAGE_KEY as hydrationFocusPopupMessageKey } from '../hydration/constants';

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
 * been dismissed. This is the exact shape every message in the Root pop-up
 * waterfall (app/actions/rootPopupMessages.ts) that can have more than one
 * same-kind candidate at once must use — see that file's own header
 * comment on the real "one dismissal kills every later pop-up" starvation
 * bug (fixed 2026-08-02, commit 85bdb347) this discipline exists to
 * prevent: a caller that returns the first candidate unconditionally,
 * without checking due-ness itself and falling through to the next,
 * reintroduces that exact bug for whichever message type skips it. The
 * `isDue` predicate is generic on purpose — it works equally with
 * isOfferPopupDue's one-time-ever rule (the cvs_offer/lsc_offer/rpl_offer
 * branches' own inline version of this same check) and with
 * isRootPopupDueThisLogin's recurring "snoozed comes back next login,
 * ignored never does" rule (the coach-assigned-questionnaire branch, FIX 5
 * 2026-08-03 — a member can have more than one pending assignment, and
 * this pop-up kind switched from one-time-ever to recurring semantics so
 * "Maybe later" actually means "ask me again next time").
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
