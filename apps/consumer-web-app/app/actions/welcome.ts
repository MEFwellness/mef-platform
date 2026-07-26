'use server';

import { createClient } from '@/lib/supabase/server';
import { isValidGoalSelection, SOMETHING_ELSE_KEY } from '@/lib/welcome/goals';
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
 */
export async function completeWelcomeFlow(
  goals: string[],
  otherText: string | null
): Promise<ActionResult> {
  if (!isValidGoalSelection(goals)) {
    return { error: 'Please select at least one area to continue.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const trimmedOther = otherText?.trim() || null;

  const { error } = await supabase
    .from('profiles')
    .update({
      welcome_flow_goals: goals,
      welcome_flow_goals_other: goals.includes(SOMETHING_ELSE_KEY) ? trimmedOther : null,
      welcome_flow_completed_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return { error: error.message };

  redirect('/');
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
