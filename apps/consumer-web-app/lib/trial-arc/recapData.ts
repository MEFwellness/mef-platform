/**
 * DAY 6, reading and writing the stored recap (migration 205).
 *
 * TWO FUNCTIONS THAT WRITE, AND NEITHER IS EVER CALLED FROM A RENDER. Both
 * are reached only from app/actions/trialArcDelivery.ts, which is reached
 * only from the analytics beacon route: one from the mounted effect on the
 * day 6 pop-up that genuinely displayed, one from the mounted effect on the
 * recap screen itself. A page, a layout or a server component calling
 * either would compose a recap for a screen nobody opened, and Next
 * prefetching a link would compose one for a member who never got there.
 *
 * COMPOSED EXACTLY ONCE. `ensureTrialArcRecap` READS FIRST and returns the
 * existing row without calling the composer at all, so a reload, a second
 * mount, a stale tab or the two beacons arriving a second apart all resolve
 * to the one row that already exists. The insert is the second line of
 * defence and the unique constraint is the third. A recap is a statement
 * about a week, and a statement that quietly rewrote itself on the next
 * visit would not be one.
 *
 * "NO ERROR" IS NOT "IT WORKED", so every write reads back what it wrote
 * and hands the caller the row rather than an assumption.
 *
 * THE SANITIZER RUNS IN BOTH DIRECTIONS. A plan is validated on the way in
 * and again on the way out, so a row written by an older build or by hand
 * can only ever render what the current vocabulary permits.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isTrialArcRecapTier, type TrialArcRecapPlan, type TrialArcRecapRecord } from './recapTypes';
import { sanitizeRecapPlan } from './recapPlan';

const COLUMNS = 'tier, fatigue_callback, plan, day_number, composed_local_date, composed_at, opened_at';

type Row = {
  tier: string;
  fatigue_callback: boolean;
  plan: unknown;
  day_number: number;
  composed_local_date: string;
  composed_at: string;
  opened_at: string | null;
};

/**
 * One row as a record, or null when its plan cannot be made sense of.
 *
 * The TIER and the CALLBACK FLAG are read back off the PLAN, not off their
 * own columns, even though both columns exist. The columns are there so a
 * SQL read and the next prompt can ask those two questions without parsing
 * jsonb; the plan is what the screen renders from. Reading both from the
 * plan is what makes it impossible for the screen and the columns to
 * disagree about what was shown.
 */
function fromRow(row: Row): TrialArcRecapRecord | null {
  const plan = sanitizeRecapPlan(row.plan);
  if (!plan) return null;
  return {
    tier: plan.tier,
    fatigueCallback: plan.fatigueCallback,
    plan,
    dayNumber: row.day_number,
    composedLocalDate: row.composed_local_date,
    composedAt: row.composed_at,
    openedAt: row.opened_at,
  };
}

/**
 * Her stored recap, or null.
 *
 * THE WHOLE READ PATH, AND IT TOUCHES NOTHING ELSE. One row, sanitized, and
 * lib/trial-arc/recapCopy.ts turns it into words. No entitlement, no
 * membership tier, no assessment registry, no trial clock. That is what
 * lets the next prompt's continuation screen render her week after her
 * trial has ended, when every gate in the app would answer no.
 */
export async function getTrialArcRecap(
  supabase: SupabaseClient,
  memberId: string
): Promise<TrialArcRecapRecord | null> {
  const { data, error } = await supabase
    .from('member_trial_arc_recaps')
    .select(COLUMNS)
    .eq('member_id', memberId)
    .maybeSingle();

  if (error) {
    console.error('getTrialArcRecap failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as Row) : null;
}

/**
 * Her recap, composing it if and only if she does not have one yet.
 *
 * The composer is passed in as a thunk rather than called first, so an
 * existing recap costs one read and does not run a single one of the nine
 * queries composition needs. It is also the mechanism that makes "written
 * exactly once" testable: a test can hand this a spy and assert it was
 * never invoked on the second call.
 */
export async function ensureTrialArcRecap(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    dayNumber: number;
    composedLocalDate: string;
    compose: () => Promise<TrialArcRecapPlan | null>;
  }
): Promise<{ record: TrialArcRecapRecord | null; created: boolean }> {
  const existing = await getTrialArcRecap(supabase, memberId);
  if (existing) return { record: existing, created: false };

  const plan = await input.compose();
  if (!plan) return { record: null, created: false };

  const { error } = await supabase.from('member_trial_arc_recaps').insert({
    member_id: memberId,
    // Both derived from the plan, in this one place, so the columns and the
    // rendered screen can never tell two different stories.
    tier: plan.tier,
    fatigue_callback: plan.fatigueCallback,
    plan,
    day_number: input.dayNumber,
    composed_local_date: input.composedLocalDate,
  });

  // Read back rather than trusting the absence of an error, and treat a
  // losing race exactly like a successful one: whoever inserted first owns
  // the recap, and this call reports it unchanged.
  const written = await getTrialArcRecap(supabase, memberId);
  if (error && !written) console.error('ensureTrialArcRecap insert failed', error);
  return { record: written, created: written !== null && !error };
}

/**
 * Records that the recap screen genuinely displayed.
 *
 * FIRST OPEN WINS. `is('opened_at', null)` means the update matches no row
 * once one is stamped, so a reload never moves the timestamp forward: the
 * fact being recorded is that she opened it, and the first time is the one
 * that is true.
 *
 * Reads back, because an update matching no row returns no error.
 */
export async function markTrialArcRecapOpened(
  supabase: SupabaseClient,
  memberId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_trial_arc_recaps')
    .update({ opened_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('opened_at', null);

  if (error) console.error('markTrialArcRecapOpened failed', error);

  const record = await getTrialArcRecap(supabase, memberId);
  return record?.openedAt != null;
}

/** Exported for the guard test, which asserts the row's own tier column can only ever hold a tier this build knows. */
export function isStoredRecapTier(value: unknown): boolean {
  return isTrialArcRecapTier(value);
}
