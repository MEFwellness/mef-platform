/**
 * Program lifecycle, on the coach dashboard's existing needs-attention
 * surface.
 *
 * Deliberately NOT a new notification system and not a new dashboard
 * panel. app/coach/lib.ts already computes an `attentionReasons` list per
 * client, the coach dashboard already renders it as the Priority Queue and
 * the client list already shows it per row. A program that just finished,
 * or one about to, is exactly the kind of thing that list exists for, so
 * it goes there.
 *
 * Two reasons, both about something the coach has to decide:
 *
 *   "Program complete, needs review"  a program finished recently and
 *                                     nothing has replaced it
 *   "Program ends this week"          one is inside its last seven days
 *
 * The decision itself (progress, rotate, or start something new) is not
 * this file's business and is not built here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { daysBetween } from './transitions';

export const PROGRAM_COMPLETE_REASON = 'Program complete, needs review';
export const PROGRAM_ENDING_REASON = 'Program ends this week';

/** How long a finished program keeps flagging its coach. Long enough to survive a holiday, short enough that a stale flag does not become furniture. */
export const RECENTLY_COMPLETED_DAYS = 14;
/** How far ahead "ending soon" looks. */
export const ENDING_SOON_DAYS = 7;

export interface ProgramAttentionRow {
  member_id: string;
  status: string;
  end_date: string | null;
  completed_at: string | null;
  replaced_by_assignment_id: string | null;
}

/**
 * The attention reasons one client's programs produce today. Pure, so the
 * rules are testable without a database.
 *
 * A program that was replaced is not flagged: the coach already decided
 * what came next, which is what the flag was asking for. A completed
 * program stops flagging once the member has something live again.
 */
export function programAttentionReasons(rows: ProgramAttentionRow[], today: string): string[] {
  const reasons: string[] = [];
  const hasLiveProgram = rows.some(
    (row) => row.status === 'active' || row.status === 'upcoming' || row.status === 'paused'
  );

  const recentlyCompleted = rows.some((row) => {
    if (row.status !== 'completed') return false;
    if (row.replaced_by_assignment_id) return false;
    const finishedOn = row.completed_at?.slice(0, 10) ?? row.end_date;
    if (!finishedOn) return false;
    const age = daysBetween(finishedOn, today);
    return age >= 0 && age <= RECENTLY_COMPLETED_DAYS;
  });
  if (recentlyCompleted && !hasLiveProgram) reasons.push(PROGRAM_COMPLETE_REASON);

  const endingSoon = rows.some((row) => {
    if (row.status !== 'active' || !row.end_date) return false;
    const remaining = daysBetween(today, row.end_date);
    return remaining >= 0 && remaining <= ENDING_SOON_DAYS;
  });
  if (endingSoon) reasons.push(PROGRAM_ENDING_REASON);

  return reasons;
}

/**
 * One read for every client on the dashboard, not one per client. RLS
 * (coach_read_assigned_program_assignments) is what decides which rows come
 * back; this only asks.
 */
export async function loadProgramAttention(
  supabase: SupabaseClient,
  memberIds: string[],
  today: string
): Promise<Map<string, string[]>> {
  const byMember = new Map<string, string[]>();
  if (memberIds.length === 0) return byMember;

  const { data, error } = await supabase
    .from('coach_program_assignments')
    .select('member_id, status, end_date, completed_at, replaced_by_assignment_id')
    .in('member_id', memberIds)
    .eq('visibility', 'published');
  if (error) {
    console.error('loadProgramAttention failed', error);
    return byMember;
  }

  const rowsByMember = new Map<string, ProgramAttentionRow[]>();
  for (const row of (data ?? []) as ProgramAttentionRow[]) {
    const list = rowsByMember.get(row.member_id) ?? [];
    list.push(row);
    rowsByMember.set(row.member_id, list);
  }

  for (const [memberId, rows] of rowsByMember) {
    const reasons = programAttentionReasons(rows, today);
    if (reasons.length > 0) byMember.set(memberId, reasons);
  }
  return byMember;
}
