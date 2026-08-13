/**
 * Adaptive Coaching Direction, Part 3 — the escalation columns migration
 * 152 adds to member_coaching_threads, and the resolve function.
 *
 * Same reason ./gradesData.ts exists separately from ./data.ts: ./data.ts's
 * THREAD_COLUMNS is selected on Part 1's own render path on every load, so
 * adding migration 152's four columns to it would make every Part 1 thread
 * read fail with an unknown-column error in the window between this code
 * deploying and the migration being applied. That would silently switch off
 * all three adaptation guardrails on the live site.
 *
 * So every function here issues its own query with its own column list and
 * fails closed. Before the migration exists: no cooldowns are known (so the
 * engine behaves exactly as Part 1 did), no escalations are listed (so the
 * coach section renders empty), and resolving reports failure rather than
 * pretending. That is what lets this build ship dormant.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachingActionType } from './types';
import type { CoachingActionType, MemberResponse, SignalEvidence } from './types';
import type { EscalatedThreadDecision, EscalatedThreadRow } from './escalation';

/**
 * How long after a coach resolves an escalation before the engine may
 * select that thread again.
 *
 * Two weeks. Resolving is permission to try again LATER, not an instruction
 * to raise the same thing on the member's very next render: a coach who has
 * just picked something up in a session should not find Root putting it
 * back on the member's screen the next morning. It is deliberately shorter
 * than the 21 day dead-grade decay, because a coach has actively looked at
 * this one and decided it is worth another go, which the grader cannot
 * know.
 */
export const ESCALATION_COOLDOWN_DAYS = 14;

// ---------------------------------------------------------------------
// Cooldowns, read on the member's own render path.
// ---------------------------------------------------------------------

/**
 * Every thread that is inside a post-resolution cooldown, keyed by thread
 * key.
 *
 * Read as its own query rather than joined into listCoachingThreads for the
 * fail-closed reason in this file's header. An empty map means "no
 * cooldowns are known", which the engine treats identically to "no
 * cooldowns exist" and which is exactly the pre-migration state.
 */
export async function listThreadCooldowns(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('member_coaching_threads')
    .select('thread_key, escalation_cooldown_until')
    .eq('member_id', memberId)
    .not('escalation_cooldown_until', 'is', null);

  if (error || !data) {
    if (error) console.error('listThreadCooldowns failed', error);
    return new Map();
  }

  const rows = data as unknown as { thread_key: string; escalation_cooldown_until: string }[];
  return new Map(rows.map((row) => [row.thread_key, row.escalation_cooldown_until]));
}

/**
 * Records that a thread has now been escalated one more time.
 *
 * Deliberately separate from escalateCoachingThread, which sets the flag
 * and is on Part 1's render path with Part 1's column list. Called only
 * after that function reports it genuinely won the transition, so the count
 * moves exactly once per escalation, and best-effort so a pre-migration
 * deploy loses the count rather than the escalation.
 */
export async function incrementEscalationCount(
  supabase: SupabaseClient,
  memberId: string,
  threadKey: string
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('member_coaching_threads')
    .select('escalation_count')
    .eq('member_id', memberId)
    .eq('thread_key', threadKey)
    .maybeSingle();

  if (readError || !data) return;

  const { error } = await supabase
    .from('member_coaching_threads')
    .update({ escalation_count: ((data.escalation_count as number | null) ?? 0) + 1 })
    .eq('member_id', memberId)
    .eq('thread_key', threadKey);

  if (error) console.error('incrementEscalationCount failed', error);
}

// ---------------------------------------------------------------------
// The coach surface.
// ---------------------------------------------------------------------

const ESCALATED_COLUMNS =
  'thread_key, rule, action_type, approach_changes, coach_escalated_at, escalation_count, ' +
  'first_selected_local_date, last_selected_local_date';

type EscalatedRow = {
  thread_key: string;
  rule: string;
  action_type: string;
  approach_changes: number;
  coach_escalated_at: string;
  escalation_count: number | null;
  first_selected_local_date: string | null;
  last_selected_local_date: string | null;
};

/**
 * Every currently-flagged thread for one member, newest first.
 *
 * "Currently flagged" is `coach_escalated_at is not null`, which is the
 * queryable flag Part 1 established and which the resolve function CLEARS.
 * A resolved thread therefore leaves this list, which is what makes the
 * section a to-do rather than a growing archive.
 *
 * Read through the caller's own client, so migration 150's
 * coach_read_assigned_coaching_threads policy is what decides whether this
 * coach may see this member's threads at all.
 */
export async function listEscalatedThreadRows(
  supabase: SupabaseClient,
  memberId: string
): Promise<EscalatedThreadRow[]> {
  const { data, error } = await supabase
    .from('member_coaching_threads')
    .select(ESCALATED_COLUMNS)
    .eq('member_id', memberId)
    .not('coach_escalated_at', 'is', null)
    .order('coach_escalated_at', { ascending: false });

  if (error || !data) {
    if (error) console.error('listEscalatedThreadRows failed', error);
    return [];
  }

  return (data as unknown as EscalatedRow[]).map((row) => ({
    threadKey: row.thread_key,
    rule: row.rule,
    actionType: isCoachingActionType(row.action_type)
      ? (row.action_type as CoachingActionType)
      : ('reflection' as CoachingActionType),
    approachChanges: row.approach_changes,
    coachEscalatedAt: row.coach_escalated_at,
    escalationCount: row.escalation_count ?? 1,
    firstSelectedLocalDate: row.first_selected_local_date,
    lastSelectedLocalDate: row.last_selected_local_date,
  }));
}

/**
 * The ledger rows behind a set of threads.
 *
 * Only the three fields the escalation view is allowed to see. Notably NOT
 * the approach, the rule's own copy or the comparison window: the view
 * answers what Root tried and what she did, and reading more than that
 * would be collecting for the sake of it.
 */
export async function listDecisionsForThreads(
  supabase: SupabaseClient,
  memberId: string,
  threadKeys: readonly string[]
): Promise<EscalatedThreadDecision[]> {
  if (threadKeys.length === 0) return [];

  const { data, error } = await supabase
    .from('member_coaching_decisions')
    .select('thread_key, member_response, signal_evidence')
    .eq('member_id', memberId)
    .in('thread_key', [...threadKeys]);

  if (error || !data) {
    if (error) console.error('listDecisionsForThreads failed', error);
    return [];
  }

  const rows = data as unknown as {
    thread_key: string;
    member_response: MemberResponse | null;
    signal_evidence: SignalEvidence | null;
  }[];

  return rows.map((row) => ({
    threadKey: row.thread_key,
    memberResponse: row.member_response,
    signalEvidence: row.signal_evidence ?? {},
  }));
}

/**
 * One thread's action type.
 *
 * Read server side, before a resolve, so the analytics event for that
 * resolve says which KIND of thing was resolved without taking the answer
 * from the browser. A client-supplied slug would be validated against the
 * closed set anyway and would still be a fact about the page rather than
 * about the row.
 */
export async function getThreadActionType(
  supabase: SupabaseClient,
  memberId: string,
  threadKey: string
): Promise<CoachingActionType | null> {
  const { data, error } = await supabase
    .from('member_coaching_threads')
    .select('action_type')
    .eq('member_id', memberId)
    .eq('thread_key', threadKey)
    .maybeSingle();

  if (error || !data) return null;
  return isCoachingActionType(data.action_type) ? (data.action_type as CoachingActionType) : null;
}

/**
 * A coach clears one escalation.
 *
 * Goes through migration 152's `resolve_coaching_escalation` SECURITY
 * DEFINER function rather than through a direct update, and the reason is
 * worth stating: a coach needs to write four columns on a row belonging to
 * someone else, row level security can say WHO may update a row but not
 * WHICH COLUMNS, and a coach UPDATE policy on this table would therefore
 * also hand a coach every adaptation counter on it. The function checks the
 * coach relationship with the same two database functions every RLS policy
 * in this codebase uses, and the set of columns that can possibly change is
 * fixed by its body.
 *
 * Returns false when nothing was resolved, which covers both "that thread
 * was not flagged" and "the function does not exist yet". Neither is an
 * error the coach needs to see as a crash.
 */
export async function resolveCoachingEscalation(
  supabase: SupabaseClient,
  memberId: string,
  threadKey: string,
  cooldownDays: number = ESCALATION_COOLDOWN_DAYS
): Promise<{ resolved: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('resolve_coaching_escalation', {
    p_member: memberId,
    p_thread_key: threadKey,
    p_cooldown_days: cooldownDays,
  });

  if (error) {
    console.error('resolveCoachingEscalation failed', error);
    return { resolved: false, error: error.message };
  }
  return { resolved: data === true, error: null };
}
