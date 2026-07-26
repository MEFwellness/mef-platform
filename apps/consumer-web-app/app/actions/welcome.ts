'use server';

import { createClient } from '@/lib/supabase/server';
import { isValidGoalSelection, SOMETHING_ELSE_KEY } from '@/lib/welcome/goals';
import { fetchLatestMemberGoalSelection, insertMemberGoalSelection } from '@/lib/member-goals/data';
import type { ActionResult } from './auth';
import { redirect } from 'next/navigation';

/**
 * Saves the welcome flow's goal selections, marks it completed, and
 * continues into whichever destination the existing routing hub
 * (app/page.tsx) decides is next for this member (onboarding, for a
 * brand-new member). Relies entirely on member_update_own_profile
 * (id = auth.uid()) for authorization, same as updateProfile() in
 * app/actions/profile.ts. There is no separate server-side "trust me"
 * check beyond that.
 *
 * Writes two places: profiles.welcome_flow_goals/_other (migration 86,
 * kept as-is — still what marks the flow complete for eligibility
 * purposes) and a new member_goal_selections row (migration 104), the
 * queryable record other systems — starting with the onboarding
 * confirmation screen — actually read. `primaryGoal` is the "which one,
 * if it changed, would matter most right now" follow-up's answer; null
 * only if the caller somehow reached this with zero or unresolved
 * selections, which the UI itself never allows (a single selection is
 * auto-promoted to primary client-side, never left null).
 */
export async function completeWelcomeFlow(
  goals: string[],
  otherText: string | null,
  primaryGoal: string | null
): Promise<ActionResult> {
  if (!isValidGoalSelection(goals)) {
    return { error: 'Please select at least one area to continue.' };
  }
  if (primaryGoal !== null && !goals.includes(primaryGoal)) {
    return { error: 'Please choose which area matters most from what you selected.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const trimmedOther = otherText?.trim() || null;
  const resolvedOther = goals.includes(SOMETHING_ELSE_KEY) ? trimmedOther : null;

  const { error } = await supabase
    .from('profiles')
    .update({
      welcome_flow_goals: goals,
      welcome_flow_goals_other: resolvedOther,
      welcome_flow_completed_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return { error: error.message };

  const { error: goalRecordError } = await insertMemberGoalSelection(supabase, {
    memberId: user.id,
    goals,
    primaryGoal,
    goalsOther: resolvedOther,
    source: 'welcome_flow',
  });
  if (goalRecordError) return { error: goalRecordError };

  redirect('/');
}

/**
 * Records a changed primary goal from the onboarding "still true?"
 * confirmation screen (OnboardingForm.tsx) — the member's answer to "You
 * said X matters most. Still true?" was no. Appends a new
 * member_goal_selections row (never edits the prior one, per that
 * table's own history-not-mutation design) carrying the same `goals`/
 * `goals_other` forward from the member's most recent row, with only
 * `primary_goal` changed. If no prior row exists, or the chosen key
 * isn't one of that row's own selected goals, this is a no-op error —
 * the confirmation screen only ever offers keys drawn from that same
 * row, so this should never fire in normal use.
 */
export async function recordPrimaryGoalChange(newPrimaryGoal: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const latest = await fetchLatestMemberGoalSelection(supabase, user.id);
  if (!latest || !latest.goals.includes(newPrimaryGoal)) {
    return { error: 'That option is not available.' };
  }

  const { error } = await insertMemberGoalSelection(supabase, {
    memberId: user.id,
    goals: latest.goals,
    primaryGoal: newPrimaryGoal,
    goalsOther: latest.goalsOther,
    source: 'onboarding_confirmation',
  });

  return error ? { error } : {};
}

/**
 * Marks the cinematic intro pages (logo/welcome through the four benefit
 * cards) as seen, so a returning or interrupted member lands directly on
 * "What brought you here today?" instead of rewatching the intro. Fired
 * once the member reaches that page, whether by watching the full sequence
 * or tapping Skip. Idempotent (only ever sets the timestamp once) so it's
 * safe to call on every visit to that page, not just the first.
 */
export async function markWelcomeIntroSeen(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('welcome_intro_seen_at')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.welcome_intro_seen_at) return;

  await supabase
    .from('profiles')
    .update({ welcome_intro_seen_at: new Date().toISOString() })
    .eq('id', user.id);
}
