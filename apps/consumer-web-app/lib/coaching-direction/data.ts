/**
 * Adaptive Coaching Direction — the two tables this build owns
 * (member_coaching_threads and member_coaching_decisions, migration 150).
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what,
 * and a failed read returns a safe empty value rather than throwing, since
 * every caller is on a page render the member is already waiting on.
 *
 * Nothing in this file writes health content. `signal_evidence` is the
 * only free-shaped column either table has, and every value written to it
 * passes through ./evidence.ts's closed allowlist first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { threadCountersAfterResponse } from './adaptation';
import { sanitizeSignalEvidence } from './evidence';
import type {
  CoachingActionType,
  CoachingDecisionRecord,
  CoachingThreadState,
  MemberResponse,
  RecordDecisionInput,
  SignalEvidence,
} from './types';
import { isCoachingActionType } from './types';

// ---------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------

const THREAD_COLUMNS =
  'thread_key, rule, action_type, approach, approach_changes, consecutive_ignored, ' +
  'responses_since_last_change, first_selected_local_date, last_selected_local_date, ' +
  'coach_escalated_at, coach_escalation_reason';

type ThreadRow = {
  thread_key: string;
  rule: string;
  action_type: string;
  approach: number;
  approach_changes: number;
  consecutive_ignored: number;
  responses_since_last_change: number;
  first_selected_local_date: string | null;
  last_selected_local_date: string | null;
  coach_escalated_at: string | null;
  coach_escalation_reason: string | null;
};

function fromThreadRow(row: ThreadRow): CoachingThreadState {
  return {
    threadKey: row.thread_key,
    rule: row.rule,
    actionType: isCoachingActionType(row.action_type) ? row.action_type : 'reflection',
    approach: row.approach,
    approachChanges: row.approach_changes,
    consecutiveIgnored: row.consecutive_ignored,
    responsesSinceLastChange: row.responses_since_last_change,
    firstSelectedLocalDate: row.first_selected_local_date,
    lastSelectedLocalDate: row.last_selected_local_date,
    coachEscalatedAt: row.coach_escalated_at,
    coachEscalationReason: row.coach_escalation_reason,
  };
}

/**
 * Every thread this member has. Keyed by thread key, which is what the
 * pure engine takes.
 *
 * Deliberately unbounded rather than paged: a thread is created only when
 * a rule genuinely won for this member, so the row count is bounded by the
 * number of distinct things Root has ever raised with her, which is small.
 */
export async function listCoachingThreads(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<string, CoachingThreadState>> {
  const { data, error } = await supabase
    .from('member_coaching_threads')
    .select(THREAD_COLUMNS)
    .eq('member_id', memberId);

  if (error || !data) {
    if (error) console.error('listCoachingThreads failed', error);
    return new Map();
  }

  return new Map((data as unknown as ThreadRow[]).map((row) => [row.thread_key, fromThreadRow(row)]));
}

/**
 * Records that a thread was selected today. Creates the thread on first
 * sight, and never resets a counter: the counters are moved only by a
 * recorded response or by an approach change, both of which have their own
 * functions below.
 */
export async function touchCoachingThread(
  supabase: SupabaseClient,
  memberId: string,
  input: {
    threadKey: string;
    rule: string;
    actionType: CoachingActionType;
    approach: number;
    localDate: string;
  }
): Promise<void> {
  const { data: existing } = await supabase
    .from('member_coaching_threads')
    .select('id, first_selected_local_date')
    .eq('member_id', memberId)
    .eq('thread_key', input.threadKey)
    .maybeSingle();

  const patch = {
    member_id: memberId,
    thread_key: input.threadKey,
    rule: input.rule,
    action_type: input.actionType,
    approach: input.approach,
    last_selected_local_date: input.localDate,
    first_selected_local_date:
      (existing?.first_selected_local_date as string | null) ?? input.localDate,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('member_coaching_threads')
    .upsert(patch, { onConflict: 'member_id,thread_key' });

  if (error) console.error('touchCoachingThread failed', error);
}

/**
 * Applies an approach change: the new framing, one more change on the
 * record, the ignore streak cleared (it is what triggered the change and
 * counting it twice would trigger another immediately), and the response
 * counter reset so "no response since the last change" starts from here.
 */
export async function applyApproachChange(
  supabase: SupabaseClient,
  memberId: string,
  threadKey: string,
  approach: number
): Promise<void> {
  const { data } = await supabase
    .from('member_coaching_threads')
    .select('approach_changes')
    .eq('member_id', memberId)
    .eq('thread_key', threadKey)
    .maybeSingle();

  const { error } = await supabase
    .from('member_coaching_threads')
    .update({
      approach,
      approach_changes: ((data?.approach_changes as number | undefined) ?? 0) + 1,
      consecutive_ignored: 0,
      responses_since_last_change: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('thread_key', threadKey);

  if (error) console.error('applyApproachChange failed', error);
}

/**
 * Marks a thread coach-escalated. This is the queryable flag: a thread
 * carrying it is never selected again by the engine, which is enforced in
 * lib/coaching-direction/adaptation.ts's `adaptThread` rather than here.
 *
 * Deliberately conditional on the flag still being null, so a thread's
 * escalation timestamp records the FIRST escalation and cannot be pushed
 * forward by a later render.
 */
export async function escalateCoachingThread(
  supabase: SupabaseClient,
  memberId: string,
  threadKey: string,
  approach: number,
  reason: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_coaching_threads')
    .update({
      approach,
      approach_changes: 2,
      coach_escalated_at: new Date().toISOString(),
      coach_escalation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('thread_key', threadKey)
    .is('coach_escalated_at', null)
    .select('id');

  if (error) {
    console.error('escalateCoachingThread failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Every escalated thread. The queryable flag, as a query. */
export async function listEscalatedCoachingThreads(
  supabase: SupabaseClient,
  memberId: string
): Promise<CoachingThreadState[]> {
  const { data, error } = await supabase
    .from('member_coaching_threads')
    .select(THREAD_COLUMNS)
    .eq('member_id', memberId)
    .not('coach_escalated_at', 'is', null);

  if (error || !data) {
    if (error) console.error('listEscalatedCoachingThreads failed', error);
    return [];
  }
  return (data as unknown as ThreadRow[]).map(fromThreadRow);
}

/** Moves a thread's counters for a recorded response. Arithmetic lives in ./adaptation.ts. */
async function moveThreadCountersForResponse(
  supabase: SupabaseClient,
  memberId: string,
  threadKey: string,
  response: MemberResponse
): Promise<void> {
  const { data } = await supabase
    .from('member_coaching_threads')
    .select(THREAD_COLUMNS)
    .eq('member_id', memberId)
    .eq('thread_key', threadKey)
    .maybeSingle();

  if (!data) return;

  const next = threadCountersAfterResponse(fromThreadRow(data as unknown as ThreadRow), response);

  const { error } = await supabase
    .from('member_coaching_threads')
    .update({
      consecutive_ignored: next.consecutiveIgnored,
      responses_since_last_change: next.responsesSinceLastChange,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('thread_key', threadKey);

  if (error) console.error('moveThreadCountersForResponse failed', error);
}

// ---------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------

const DECISION_COLUMNS =
  'id, local_date, rule, action_type, thread_key, approach, is_follow_on, signal_evidence, ' +
  'member_response, responded_at, comparison_reference_date, comparison_window_days, ' +
  'comparison_after_complete_on';

type DecisionRow = {
  id: string;
  local_date: string;
  rule: string;
  action_type: string;
  thread_key: string;
  approach: number;
  is_follow_on: boolean;
  signal_evidence: SignalEvidence | null;
  member_response: MemberResponse | null;
  responded_at: string | null;
  comparison_reference_date: string;
  comparison_window_days: number;
  comparison_after_complete_on: string;
};

function fromDecisionRow(row: DecisionRow): CoachingDecisionRecord {
  return {
    id: row.id,
    localDate: row.local_date,
    rule: row.rule,
    actionType: isCoachingActionType(row.action_type) ? row.action_type : 'reflection',
    threadKey: row.thread_key,
    approach: row.approach,
    isFollowOn: row.is_follow_on,
    signalEvidence: row.signal_evidence ?? {},
    memberResponse: row.member_response,
    respondedAt: row.responded_at,
    comparisonReferenceDate: row.comparison_reference_date,
    comparisonWindowDays: row.comparison_window_days,
    comparisonAfterCompleteOn: row.comparison_after_complete_on,
  };
}

/**
 * The default before/after window, taken from the comparison primitive's
 * own default rather than declared a second time here. Importing the
 * constant is the point: if that primitive ever changes its default, a
 * decision recorded today and a comparison run tomorrow still agree.
 */
export { DEFAULT_COMPARISON_WINDOW_DAYS } from '../analytics-service/comparison';

/** Plain local-date arithmetic on the 'YYYY-MM-DD' string, no timezone maths. */
export function shiftLocalDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getCoachingDecision(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<CoachingDecisionRecord | null> {
  const { data, error } = await supabase
    .from('member_coaching_decisions')
    .select(DECISION_COLUMNS)
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .maybeSingle();

  if (error || !data) return null;
  return fromDecisionRow(data as unknown as DecisionRow);
}

/**
 * Records a delivered decision, if today has no row yet.
 *
 * Deliberately an insert-if-absent, matching claimDailyPriority's own
 * discipline for exactly the same reason: once Root has decided, that
 * decision is fixed for the day, and a concurrent second render must not
 * be able to rewrite it or to produce a second ledger row.
 */
export async function recordCoachingDecision(
  supabase: SupabaseClient,
  memberId: string,
  input: RecordDecisionInput,
  windowDays: number
): Promise<CoachingDecisionRecord | null> {
  const { error } = await supabase.from('member_coaching_decisions').upsert(
    {
      member_id: memberId,
      local_date: input.localDate,
      rule: input.rule,
      action_type: input.actionType,
      thread_key: input.threadKey,
      approach: input.approach,
      is_follow_on: input.isFollowOn,
      signal_evidence: sanitizeSignalEvidence(input.signalEvidence),
      // The reference day is the day the decision was delivered, and it
      // belongs to neither window: it is the pivot. Counting it in the
      // after window would mean the action's own day counted as its own
      // result. See lib/analytics-service/comparison.ts.
      comparison_reference_date: input.localDate,
      comparison_window_days: windowDays,
      comparison_after_complete_on: shiftLocalDate(input.localDate, windowDays),
    },
    { onConflict: 'member_id,local_date', ignoreDuplicates: true }
  );

  if (error) {
    console.error('recordCoachingDecision failed', error);
    return null;
  }
  return getCoachingDecision(supabase, memberId, input.localDate);
}

/**
 * Records what she did about today's action, and moves the thread's
 * counters to match.
 *
 * Conditional on the response still being null so the FIRST thing she did
 * is what the ledger keeps. Tapping "Help me" and then "Done" records
 * 'help', which is the honest answer to "what did this action produce":
 * the smaller step is what she actually needed.
 */
export async function recordCoachingResponse(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  response: MemberResponse
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_coaching_decisions')
    .update({
      member_response: response,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .is('member_response', null)
    .select('thread_key');

  if (error) {
    console.error('recordCoachingResponse failed', error);
    return false;
  }

  const threadKey = (data?.[0] as { thread_key: string } | undefined)?.thread_key;
  if (!threadKey) return false;

  await moveThreadCountersForResponse(supabase, memberId, threadKey, response);
  return true;
}

/**
 * Every delivered decision before today that never got an outcome.
 *
 * Bounded to a recent window rather than all of history: a member who was
 * away for three months does not need ninety rows resolved on the render
 * she comes back on, and a decision that old tells the adaptation
 * guardrails nothing useful anyway.
 */
export const UNRESOLVED_LOOKBACK_DAYS = 30;

export async function listUnresolvedDecisions(
  supabase: SupabaseClient,
  memberId: string,
  beforeLocalDate: string
): Promise<CoachingDecisionRecord[]> {
  const { data, error } = await supabase
    .from('member_coaching_decisions')
    .select(DECISION_COLUMNS)
    .eq('member_id', memberId)
    .is('member_response', null)
    .lt('local_date', beforeLocalDate)
    .gte('local_date', shiftLocalDate(beforeLocalDate, -UNRESOLVED_LOOKBACK_DAYS))
    .order('local_date', { ascending: true });

  if (error || !data) {
    if (error) console.error('listUnresolvedDecisions failed', error);
    return [];
  }
  return (data as unknown as DecisionRow[]).map(fromDecisionRow);
}

/**
 * How many of the last `windowDays` days ended with the priority set
 * aside. Read from the card's own table, not from analytics: "she saved
 * the last several priorities for later" is a fact about this feature,
 * recorded by this feature, and asking an admin-scoped analytics RPC for
 * it would be both slower and less true.
 */
export async function countRecentSavedPriorities(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string,
  windowDays: number
): Promise<number> {
  const { count, error } = await supabase
    .from('member_daily_priorities')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('status', 'saved')
    .lt('local_date', todayLocalDate)
    .gte('local_date', shiftLocalDate(todayLocalDate, -windowDays));

  if (error) {
    console.error('countRecentSavedPriorities failed', error);
    return 0;
  }
  return count ?? 0;
}
