/**
 * DAY 7, reading and writing the stored close (migration 206).
 *
 * THREE FUNCTIONS THAT WRITE, AND NONE IS EVER CALLED FROM A RENDER. All
 * three are reached only from app/actions/trialArcDelivery.ts, which is
 * reached only from the analytics beacon route: one from the mounted effect
 * on the day 7 pop-up that genuinely displayed, one from the mounted effect
 * on the close screen itself, and one from the door she actually pressed. A
 * page, a layout or a server component calling any of them would compose a
 * close for a screen nobody opened, and Next prefetching a link would
 * compose one for a member who never got there.
 *
 * COMPOSED EXACTLY ONCE. `ensureTrialArcClose` READS FIRST and returns the
 * existing row without calling the composer at all, so a reload, a second
 * mount, a stale tab or two beacons arriving a second apart all resolve to
 * the one row that already exists. The insert is the second line of defence
 * and the unique constraint is the third.
 *
 * "NO ERROR" IS NOT "IT WORKED", so every write reads back what it wrote
 * and hands the caller the row rather than an assumption.
 *
 * THE SANITIZER RUNS IN BOTH DIRECTIONS. A plan is validated on the way in
 * and again on the way out, so a row written by an older build or by hand
 * can only ever render what the current vocabulary permits.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isTrialArcCloseAction,
  isTrialArcCloseDoor,
  isTrialArcCloseFocusKind,
  type TrialArcCloseAction,
  type TrialArcClosePlan,
  type TrialArcCloseRecord,
} from './closeTypes';
import { sanitizeClosePlan } from './closePlan';

const COLUMNS =
  'completion, focus_kind, lead_door, plan, day_number, composed_local_date, composed_at, opened_at, door_tapped, door_tapped_at';

type Row = {
  completion: string;
  focus_kind: string;
  lead_door: string;
  plan: unknown;
  day_number: number;
  composed_local_date: string;
  composed_at: string;
  opened_at: string | null;
  door_tapped: string | null;
  door_tapped_at: string | null;
};

/**
 * One row as a record, or null when its plan cannot be made sense of.
 *
 * THE COMPLETION, THE FOCUS KIND AND THE LEAD DOOR ARE READ BACK OFF THE
 * PLAN, not off their own columns, even though all three columns exist. The
 * columns are there so a SQL read and the next prompt can ask those
 * questions without parsing jsonb; the plan is what the screen renders
 * from. Reading them from the plan is what makes it impossible for the
 * screen and the columns to disagree about what was shown.
 */
function fromRow(row: Row): TrialArcCloseRecord | null {
  const plan = sanitizeClosePlan(row.plan);
  if (!plan) return null;
  return {
    completion: plan.completion,
    focusKind: plan.focus.kind,
    leadDoor: plan.leadDoor,
    plan,
    dayNumber: row.day_number,
    composedLocalDate: row.composed_local_date,
    composedAt: row.composed_at,
    openedAt: row.opened_at,
    doorTapped: isTrialArcCloseAction(row.door_tapped) ? row.door_tapped : null,
    doorTappedAt: row.door_tapped_at,
  };
}

/**
 * Her stored close, or null.
 *
 * THE WHOLE READ PATH, AND IT TOUCHES NOTHING ELSE. One row, sanitized, and
 * lib/trial-arc/closeCopy.ts turns it into words. No entitlement, no
 * membership tier, no assessment registry, no trial clock. That is what
 * lets Prompt 6's continuation screen render her close after her trial has
 * ended, when every gate in the app would answer no.
 */
export async function getTrialArcClose(
  supabase: SupabaseClient,
  memberId: string
): Promise<TrialArcCloseRecord | null> {
  const { data, error } = await supabase
    .from('member_trial_arc_closes')
    .select(COLUMNS)
    .eq('member_id', memberId)
    .maybeSingle();

  if (error) {
    console.error('getTrialArcClose failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as Row) : null;
}

/**
 * Her close, composing it if and only if she does not have one yet.
 *
 * The composer is passed in as a thunk rather than called first, so an
 * existing close costs one read and does not run a single one of the
 * queries composition needs. It is also the mechanism that makes "written
 * exactly once" testable: a test can hand this a spy and assert it was
 * never invoked on the second call.
 */
export async function ensureTrialArcClose(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    dayNumber: number;
    composedLocalDate: string;
    compose: () => Promise<TrialArcClosePlan | null>;
  }
): Promise<{ record: TrialArcCloseRecord | null; created: boolean }> {
  const existing = await getTrialArcClose(supabase, memberId);
  if (existing) return { record: existing, created: false };

  const plan = await input.compose();
  if (!plan) return { record: null, created: false };

  const { error } = await supabase.from('member_trial_arc_closes').insert({
    member_id: memberId,
    // All three derived from the plan, in this one place, so the columns and
    // the rendered screen can never tell two different stories.
    completion: plan.completion,
    focus_kind: plan.focus.kind,
    lead_door: plan.leadDoor,
    plan,
    day_number: input.dayNumber,
    composed_local_date: input.composedLocalDate,
  });

  // Read back rather than trusting the absence of an error, and treat a
  // losing race exactly like a successful one: whoever inserted first owns
  // the close, and this call reports it unchanged.
  const written = await getTrialArcClose(supabase, memberId);
  if (error && !written) console.error('ensureTrialArcClose insert failed', error);
  return { record: written, created: written !== null && !error };
}

/**
 * Records that the close screen genuinely displayed.
 *
 * FIRST OPEN WINS. `is('opened_at', null)` means the update matches no row
 * once one is stamped, so a reload never moves the timestamp forward: the
 * fact being recorded is that she opened it, and the first time is the one
 * that is true.
 */
export async function markTrialArcCloseOpened(
  supabase: SupabaseClient,
  memberId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_trial_arc_closes')
    .update({ opened_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('opened_at', null);

  if (error) console.error('markTrialArcCloseOpened failed', error);

  const record = await getTrialArcClose(supabase, memberId);
  return record?.openedAt != null;
}

/**
 * Records which door she took, or that she quietly went home.
 *
 * FIRST CHOICE WINS, for the same reason the open stamp's does:
 * `is('door_tapped', null)` means the update matches no row once one is
 * recorded. The fact worth keeping is what she decided on this screen, and
 * the first decision is the one she made; a second press after coming back
 * is a different visit, not a change of mind this row should absorb.
 *
 * 'home' IS RECORDED, NOT INFERRED FROM SILENCE. Tapping no door is a fully
 * respected outcome of this screen and is stored as a choice she made,
 * which is a genuinely different fact from closing the tab (null) and from
 * never opening the close at all (opened_at null).
 *
 * A DOOR SHE WAS NEVER OFFERED IS REFUSED. The browser sends the door name
 * and nothing else, so this reads her own stored plan first and drops
 * anything that is not on it. Without that, a hand built request could
 * record that she took the membership door on a close where no membership
 * door was ever drawn, and Prompt 6 would read a choice she could not have
 * made. 'home' is always accepted: the quiet exit is on every close.
 */
export async function markTrialArcCloseDoor(
  supabase: SupabaseClient,
  memberId: string,
  action: TrialArcCloseAction
): Promise<TrialArcCloseAction | null> {
  const before = await getTrialArcClose(supabase, memberId);
  if (!before) return null;
  if (action !== 'home' && !before.plan.doors.includes(action)) return before.doorTapped;

  const { error } = await supabase
    .from('member_trial_arc_closes')
    .update({ door_tapped: action, door_tapped_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('door_tapped', null);

  if (error) console.error('markTrialArcCloseDoor failed', error);

  const record = await getTrialArcClose(supabase, memberId);
  return record?.doorTapped ?? null;
}

/** Exported for the guard test, which asserts the row's own columns can only ever hold values this build knows. */
export const STORED_CLOSE_GUARDS = {
  isTrialArcCloseAction,
  isTrialArcCloseDoor,
  isTrialArcCloseFocusKind,
} as const;
