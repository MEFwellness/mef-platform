/**
 * Priority Card — the one module that touches member_daily_priorities
 * (migration 147), plus the two absence reads the hierarchy needs.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what,
 * and a failed read returns a safe empty value rather than throwing, since
 * every caller is on a page render the member is already waiting on.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyPriorityRecord, PriorityRule, PriorityStatus, SelectedPriority } from './types';

const COLUMNS =
  'id, local_date, rule, priority_key, priority_title, priority_help, priority_href, status, done_at, saved_at, shown_at, decided_before_checkin, redecided_at';

type Row = {
  id: string;
  local_date: string;
  rule: PriorityRule;
  priority_key: string | null;
  priority_title: string;
  priority_help: string;
  priority_href: string | null;
  status: PriorityStatus;
  done_at: string | null;
  saved_at: string | null;
  shown_at: string | null;
  decided_before_checkin: boolean | null;
  redecided_at: string | null;
};

function fromRow(row: Row): DailyPriorityRecord {
  return {
    id: row.id,
    localDate: row.local_date,
    rule: row.rule,
    priorityKey: row.priority_key,
    title: row.priority_title,
    help: row.priority_help,
    href: row.priority_href,
    status: row.status,
    doneAt: row.done_at,
    savedAt: row.saved_at,
    shownAt: row.shown_at,
    decidedBeforeCheckin: row.decided_before_checkin === true,
    redecidedAt: row.redecided_at,
  };
}

/** Today's stored priority row, or null if Root has not recorded one yet today. */
export async function getDailyPriority(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<DailyPriorityRecord | null> {
  const { data, error } = await supabase
    .from('member_daily_priorities')
    .select(COLUMNS)
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data as Row);
}

/**
 * Records which rule won today, if today has no row yet.
 *
 * Deliberately an insert-if-absent rather than an upsert of rule and
 * priority_key: once Root has told the member what today's priority is,
 * that decision is fixed for the day. Re-running the hierarchy mid-morning
 * (because a driver state was recomputed, or she completed her plan) must
 * never silently rewrite what she was already shown, and must never
 * clobber a `done` or `saved` status she has already set.
 *
 * `ignoreDuplicates` maps to `insert ... on conflict do nothing` against
 * the table's own unique (member_id, local_date) constraint, so a
 * concurrent double render results in exactly one row regardless of which
 * request wins the race. Returns the row that actually exists afterwards.
 */
export async function claimDailyPriority(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  selected: SelectedPriority,
  /**
   * Whether Root had already seen today's Daily Reset when it decided.
   * Recorded so `redecideDailyPriority` below can tell a decision made
   * without today's check-in from one made with it, without having to
   * compare timestamps across two tables.
   */
  decidedBeforeCheckin = false
): Promise<DailyPriorityRecord | null> {
  const { data, error } = await supabase
    .from('member_daily_priorities')
    .upsert(
      {
        member_id: memberId,
        local_date: localDate,
        rule: selected.rule,
        priority_key: selected.priorityKey,
        priority_title: selected.title,
        priority_help: selected.help,
        priority_href: selected.href,
        status: 'active',
        decided_before_checkin: decidedBeforeCheckin,
      },
      { onConflict: 'member_id,local_date', ignoreDuplicates: true }
    )
    .select(COLUMNS);

  if (error) {
    console.error('claimDailyPriority failed', error);
    return null;
  }

  // The winner of the race gets its own row straight back from the write,
  // with no second read at all. That is not only one fewer round trip: the
  // re-read used to be byte-identical to a read the caller had already
  // issued in the same render, which made it eligible for Next.js's fetch
  // cache in a production build and had it served the earlier "no row"
  // answer. See the note on the fetch override in lib/supabase/server.ts.
  const claimed = (data as Row[] | null)?.[0];
  if (claimed) return fromRow(claimed);

  // Empty means the insert was a genuine no-op: another concurrent render
  // already claimed today. Read that row, which really does exist.
  return getDailyPriority(supabase, memberId, localDate);
}

/**
 * Marks today's priority done or saved. Scoped by member_id as well as
 * local_date so a caller can never act on another member's row even if
 * RLS were somehow relaxed later.
 */
export async function setDailyPriorityStatus(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  status: Exclude<PriorityStatus, 'active'>
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: nowIso };
  if (status === 'done') patch.done_at = nowIso;
  if (status === 'saved') patch.saved_at = nowIso;

  const { error } = await supabase
    .from('member_daily_priorities')
    .update(patch)
    .eq('member_id', memberId)
    .eq('local_date', localDate);

  if (error) {
    console.error('setDailyPriorityStatus failed', error);
    return false;
  }
  return true;
}

/**
 * Atomically claims the one `priority_shown` analytics event for this
 * member's day, and records which presentation actually reached her first.
 *
 * The `is('shown_at', null)` filter is what makes this a claim rather than
 * a write: only the first caller of the day matches a row, so only that
 * caller gets `true` back and writes the event. Every later render on the
 * same day (a Today visit after the pop-up, a Home reload) matches zero
 * rows and stays silent. That is the "one day's card must never
 * double-count as multiple priorities" requirement enforced in the
 * database, not by a client-side dedupe window that could not decide it
 * correctly anyway, since Home renders the pop-up and the inline card in
 * the same pass.
 */
export async function claimPriorityShown(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  presentation: 'popup' | 'inline'
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_daily_priorities')
    .update({
      shown_at: new Date().toISOString(),
      shown_presentation: presentation,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .is('shown_at', null)
    .select('id');

  if (error) {
    console.error('claimPriorityShown failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Her most recent sign-in BEFORE today, as a local date, or null if she has
 * none on record.
 *
 * Reads `session_started` from member_wellness_events, which
 * app/actions/auth.ts already writes one row of per completed sign-in
 * (migration 146). This is a read of an existing pipeline, not a second
 * absence detector: lib/return-greeting/absence.ts owns the thresholds and
 * the precedence, this function only supplies the number of days.
 *
 * The `lt` on local_date is load-bearing. The visit that renders the
 * priority card has itself just written today's session_started row, so
 * counting today would make every returning member look present and the
 * re-entry state could never fire at all.
 */
export async function getLastSignInLocalDateBefore(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('member_wellness_events')
    .select('local_date')
    .eq('member_id', memberId)
    .eq('event_type', 'session_started')
    .lt('local_date', localDate)
    .order('local_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.local_date as string;
}

/**
 * THE DAY'S PRIORITY WAITS FOR THE CHECK-IN (2026-08-27).
 *
 * `claimDailyPriority` is deliberately an insert-if-absent, and that is
 * still right: once Root has told her what today is about, the decision
 * holds. But there is one moment where holding it is wrong, and it is the
 * common one. The card is shown the moment she opens Home, which for most
 * members is before the Daily Reset. Root then decided her whole day
 * without today's answers in front of it, and could not revisit that even
 * once she had answered.
 *
 * So exactly one revision is allowed, and only under all four of these:
 * the first decision was made before today's check-in, today's check-in
 * now exists, she has not already acted on the card, and no revision has
 * happened yet. `redecided_at` is what makes it once and not a loop, and
 * the `status = 'active'` and `redecided_at is null` clauses are in the
 * UPDATE itself, so two concurrent renders cannot both revise.
 *
 * Returns the row as it stands afterwards, or null when nothing was
 * revised, so a caller can tell "revised" from "left alone".
 */
export async function redecideDailyPriority(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  selected: SelectedPriority
): Promise<DailyPriorityRecord | null> {
  const { data, error } = await supabase
    .from('member_daily_priorities')
    .update({
      rule: selected.rule,
      priority_key: selected.priorityKey,
      priority_title: selected.title,
      priority_help: selected.help,
      priority_href: selected.href,
      decided_before_checkin: false,
      redecided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .eq('status', 'active')
    .eq('decided_before_checkin', true)
    .is('redecided_at', null)
    .select(COLUMNS);

  if (error) {
    console.error('redecideDailyPriority failed', error);
    return null;
  }

  // "NO ERROR" IS NOT "IT WORKED". An UPDATE whose WHERE matched nothing
  // returns zero rows and no error, and that is the ordinary case here
  // (another render already revised it, or she has already acted). Read
  // what came back rather than assuming.
  const revised = (data as Row[] | null)?.[0];
  return revised ? fromRow(revised) : null;
}
