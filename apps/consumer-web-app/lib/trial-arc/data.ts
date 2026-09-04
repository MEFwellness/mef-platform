/**
 * Database access for member_trial_arc_deliveries (migration 204).
 *
 * Same pure-functions-take-a-SupabaseClient, RLS-is-the-boundary shape as
 * lib/weekly-reflection/data.ts's own receipt functions, which this table
 * is modelled on.
 *
 * NOTHING IN THIS FILE IS EVER CALLED FROM A RENDER. The claim below is
 * reached only from the analytics beacon route, fired by a mounted effect
 * on a pop-up that genuinely displayed, and the CTA stamp only from the
 * button she pressed. A page, a layout or a server component that called
 * either of these would write a receipt for a message nobody was shown,
 * and Next prefetching a link would write one for a screen nobody opened.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isTrialArcStep, type TrialArcStep } from './constants';
import { isTrialArcPaceState, type TrialArcDeliveryFact, type TrialArcPaceState } from './state';

const COLUMNS = 'message_key, day_number, pace_state, pointed_step, delivered_local_date, delivered_at, cta_tapped_at';

type Row = {
  message_key: string;
  day_number: number;
  pace_state: string;
  pointed_step: string;
  delivered_local_date: string;
  delivered_at: string;
  cta_tapped_at: string | null;
};

function fromRow(row: Row): TrialArcDeliveryFact {
  return {
    messageKey: row.message_key,
    dayNumber: row.day_number,
    // The database check constraints already restrict both columns to these
    // values, so these two guards are the type system agreeing with the
    // schema rather than a second opinion about what is valid.
    paceState: isTrialArcPaceState(row.pace_state) ? row.pace_state : 'BEHIND',
    pointedStep: isTrialArcStep(row.pointed_step) ? row.pointed_step : 'none',
    deliveredLocalDate: row.delivered_local_date,
    ctaTappedAt: row.cta_tapped_at,
  };
}

/**
 * Every trial arc message that has genuinely reached this member.
 *
 * "The read failed" is kept apart from "there are none", for the same
 * reason the Weekly Reflection's own receipt read keeps them apart: a
 * failed read reported as an empty list would tell the closer that she has
 * ignored nothing, and the arc would keep talking to somebody it had
 * already been told to stop talking to.
 */
export async function listTrialArcDeliveries(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ ok: boolean; deliveries: TrialArcDeliveryFact[] }> {
  const { data, error } = await supabase
    .from('member_trial_arc_deliveries')
    .select(COLUMNS)
    .eq('member_id', memberId)
    .order('day_number', { ascending: true });

  if (error) {
    console.error('listTrialArcDeliveries failed', error);
    return { ok: false, deliveries: [] };
  }
  return { ok: true, deliveries: ((data ?? []) as unknown as Row[]).map(fromRow) };
}

/**
 * Records that one trial arc message reached her, if that message has no
 * receipt yet.
 *
 * INSERT IF ABSENT, AND THE DATABASE IS WHAT ENFORCES IT. A reload, a
 * second mount across React's development remount, or a stale tab all
 * resolve to the same (member_id, message_key) and therefore to the one row
 * that already exists, with its first delivered_at. Never an upsert: an
 * upsert would move delivered_at forward on the second showing, and the
 * closer's whole rule is measured against the day it FIRST reached her.
 *
 * "NO ERROR" IS NOT "IT WORKED", so this reads back what it wrote and hands
 * the caller the row rather than an assumption.
 */
export async function claimTrialArcDelivery(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    messageKey: string;
    dayNumber: number;
    paceState: TrialArcPaceState;
    pointedStep: TrialArcStep;
    deliveredLocalDate: string;
  }
): Promise<{ record: TrialArcDeliveryFact | null; created: boolean }> {
  const { data, error } = await supabase
    .from('member_trial_arc_deliveries')
    .insert({
      member_id: memberId,
      message_key: input.messageKey,
      day_number: input.dayNumber,
      pace_state: input.paceState,
      pointed_step: input.pointedStep,
      delivered_local_date: input.deliveredLocalDate,
      delivered_at: new Date().toISOString(),
    })
    .select(COLUMNS)
    .maybeSingle();

  if (!error && data) {
    return { record: fromRow(data as unknown as Row), created: true };
  }

  const existing = await getTrialArcDelivery(supabase, memberId, input.messageKey);
  if (error && !existing) console.error('claimTrialArcDelivery insert failed', error);
  return { record: existing, created: false };
}

export async function getTrialArcDelivery(
  supabase: SupabaseClient,
  memberId: string,
  messageKey: string
): Promise<TrialArcDeliveryFact | null> {
  const { data, error } = await supabase
    .from('member_trial_arc_deliveries')
    .select(COLUMNS)
    .eq('member_id', memberId)
    .eq('message_key', messageKey)
    .maybeSingle();

  if (error) {
    console.error('getTrialArcDelivery failed', error);
    return null;
  }
  return data ? fromRow(data as unknown as Row) : null;
}

/**
 * Stamps that she pressed a message's primary button.
 *
 * The one column on a written receipt that may ever change, and migration
 * 204's column grant is what limits it to that: UPDATE is revoked on the
 * table for the authenticated role and granted back on cta_tapped_at
 * alone, so this is a rule the database holds rather than a promise this
 * file makes.
 *
 * FIRST TAP WINS. A second press of the same button is a no op rather than
 * a newer timestamp: `is('cta_tapped_at', null)` means the update matches
 * no row once one is stamped, which is also why this reads back rather than
 * trusting the absence of an error.
 */
export async function markTrialArcCtaTapped(
  supabase: SupabaseClient,
  memberId: string,
  messageKey: string
): Promise<boolean> {
  const { error } = await supabase
    .from('member_trial_arc_deliveries')
    .update({ cta_tapped_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .eq('message_key', messageKey)
    .is('cta_tapped_at', null);

  if (error) {
    console.error('markTrialArcCtaTapped failed', error);
    return false;
  }

  const record = await getTrialArcDelivery(supabase, memberId, messageKey);
  return record?.ctaTappedAt !== null && record !== null;
}

// ---------------------------------------------------------------------
// What she did, and on which of her own days.
//
// TWO READS, NOT A NEW RECORD. Both tables below already exist and are
// already written by the surfaces that own them. The arc counts days it
// finds rows on; it never writes an activity row, never stamps a "last
// seen", and never keeps a streak.
// ---------------------------------------------------------------------

/**
 * Her own calendar days with a completed Daily Reset on them, inside a
 * range.
 *
 * Reads `daily_checkins_current`, the same view the Weekly Reflection's own
 * recap counts (lib/weekly-reflection/data.ts), so "a day she checked in"
 * can never mean two different things on two screens. The view already
 * carries her own local_date, resolved when she submitted, so nothing here
 * converts a timestamp.
 */
export async function listTrialArcCheckinDates(
  supabase: SupabaseClient,
  memberId: string,
  fromLocalDate: string,
  toLocalDate: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('daily_checkins_current')
    .select('local_date')
    .eq('user_id', memberId)
    .gte('local_date', fromLocalDate)
    .lte('local_date', toLocalDate);

  if (error) {
    console.error('listTrialArcCheckinDates failed', error);
    return [];
  }
  return ((data ?? []) as Array<{ local_date: string }>).map((row) => row.local_date);
}

/**
 * Her own calendar days with an experiment day logged on them.
 *
 * cvs_experiment_daily_logs (migration 134) holds the daily taps for every
 * experience's seven day experiment, not only Core Values Snapshot's: the
 * table was never Core Values Snapshot specific, only its name is, and Life
 * Signal Check reuses it directly (lib/life-signal-check/dailyLogsData.ts).
 * One read by member_id therefore covers every running experiment.
 *
 * THIS IS WHY A RUNNING EXPERIMENT IS NOT A STALL. Somebody holding a seven
 * day change and tapping it each evening, without filling in a Daily Reset,
 * is engaged with the app in the only way that experiment asks for. Counting
 * check-ins alone would have called her stalled and sent her a message about
 * nothing having expired, while she was in the middle of the thing.
 */
export async function listTrialArcExperimentLogDates(
  supabase: SupabaseClient,
  memberId: string,
  fromLocalDate: string,
  toLocalDate: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('cvs_experiment_daily_logs')
    .select('local_date')
    .eq('member_id', memberId)
    .gte('local_date', fromLocalDate)
    .lte('local_date', toLocalDate);

  if (error) {
    console.error('listTrialArcExperimentLogDates failed', error);
    return [];
  }
  return ((data ?? []) as Array<{ local_date: string }>).map((row) => row.local_date);
}
