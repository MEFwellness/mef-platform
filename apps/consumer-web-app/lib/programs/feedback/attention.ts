/**
 * What a member said about an exercise, on the coach dashboard's existing
 * needs-attention surface.
 *
 * Deliberately NOT a new notification system and not a new panel, for the
 * same reason lib/program-lifecycle/coachAttention.ts is not: app/coach/
 * lib.ts already computes an `attentionReasons` list per client, the coach
 * dashboard already renders it as the Priority Queue, and the client list
 * already shows it per row. A member who stopped an exercise because it
 * hurt is exactly the kind of thing that list exists for.
 *
 * Two reasons, both about something the coach has to decide:
 *
 *   "Exercise stopped, member reported pain"   safety. Leads the list.
 *   "An exercise felt too easy, ready to
 *    progress"                                 a progression decision the
 *                                              app deliberately did not
 *                                              make for him.
 *
 * A reason clears when the coach marks the report reviewed. It does not
 * clear on a timer, because neither of these is a thing that stops being
 * true by itself.
 *
 * NO EM DASHES, per the house rule.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const PAIN_STOP_REASON = 'Exercise stopped, member reported pain';
export const READY_TO_PROGRESS_REASON = 'An exercise felt too easy, ready to progress';

export interface FeedbackAttentionRow {
  member_id: string;
  branch: string;
  coach_reviewed_at: string | null;
}

/** The reasons one client's unreviewed reports produce. Pure, so the rules are testable without a database. */
export function feedbackAttentionReasons(rows: FeedbackAttentionRow[]): string[] {
  const reasons: string[] = [];
  const open = rows.filter((row) => row.coach_reviewed_at === null);
  if (open.some((row) => row.branch === 'safety')) reasons.push(PAIN_STOP_REASON);
  if (open.some((row) => row.branch === 'progression_note')) {
    reasons.push(READY_TO_PROGRESS_REASON);
  }
  return reasons;
}

/**
 * One read for every client on the dashboard, not one per client. RLS
 * (coach_read_assigned_exercise_feedback) is what decides which rows come
 * back; this only asks.
 */
export async function loadFeedbackAttention(
  supabase: SupabaseClient,
  memberIds: string[]
): Promise<Map<string, string[]>> {
  const byMember = new Map<string, string[]>();
  if (memberIds.length === 0) return byMember;

  const { data, error } = await supabase
    .from('member_exercise_feedback')
    .select('member_id, branch, coach_reviewed_at')
    .in('member_id', memberIds)
    .is('coach_reviewed_at', null)
    .in('branch', ['safety', 'progression_note']);
  if (error) {
    console.error('loadFeedbackAttention failed', error);
    return byMember;
  }

  const rowsByMember = new Map<string, FeedbackAttentionRow[]>();
  for (const row of (data ?? []) as FeedbackAttentionRow[]) {
    const list = rowsByMember.get(row.member_id) ?? [];
    list.push(row);
    rowsByMember.set(row.member_id, list);
  }

  for (const [memberId, rows] of rowsByMember) {
    const reasons = feedbackAttentionReasons(rows);
    if (reasons.length > 0) byMember.set(memberId, reasons);
  }
  return byMember;
}
