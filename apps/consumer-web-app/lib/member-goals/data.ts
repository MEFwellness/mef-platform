/**
 * Data layer for member_goal_selections (migration 104) — the insert-only
 * history of what a member said brought them here / matters most,
 * consumed by app/actions/welcome.ts (writer) and
 * app/onboarding/OnboardingForm.tsx (reader, via the confirmation
 * screen). Never updates or deletes a row; a changed answer is always a
 * new insert, so both the old and new value stay queryable with their own
 * timestamps.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type MemberGoalSource = 'welcome_flow' | 'onboarding_confirmation';

export type MemberGoalSelection = {
  id: string;
  memberId: string;
  /** WELCOME_GOALS keys (lib/welcome/goals.ts) — the full selected set at the time of this row. */
  goals: string[];
  /** One of `goals`, or null if never chosen. */
  primaryGoal: string | null;
  goalsOther: string | null;
  source: MemberGoalSource;
  createdAt: string;
};

type Row = {
  id: string;
  member_id: string;
  goals: unknown;
  primary_goal: string | null;
  goals_other: string | null;
  source: MemberGoalSource;
  created_at: string;
};

function fromRow(row: Row): MemberGoalSelection {
  return {
    id: row.id,
    memberId: row.member_id,
    goals: Array.isArray(row.goals) ? row.goals.map(String) : [],
    primaryGoal: row.primary_goal,
    goalsOther: row.goals_other,
    source: row.source,
    createdAt: row.created_at,
  };
}

/** The signed-in member's most recent goal-selection row, or null if they've never gone through the welcome flow's goal screen. */
export async function fetchLatestMemberGoalSelection(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberGoalSelection | null> {
  const { data, error } = await supabase
    .from('member_goal_selections')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data as Row);
}

/** Appends a new history row. Never overwrites a prior one — see the table's own header comment (migration 104). */
export async function insertMemberGoalSelection(
  supabase: SupabaseClient,
  params: {
    memberId: string;
    goals: string[];
    primaryGoal: string | null;
    goalsOther: string | null;
    source: MemberGoalSource;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('member_goal_selections').insert({
    member_id: params.memberId,
    goals: params.goals,
    primary_goal: params.primaryGoal,
    goals_other: params.goalsOther,
    source: params.source,
  });

  return { error: error?.message ?? null };
}
