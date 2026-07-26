import { createClient } from '@/lib/supabase/server';
import { isEligibleForWelcomeFlow } from '@/lib/welcome/eligibility';
import { redirect } from 'next/navigation';
import { WelcomeFlow, GOAL_SELECTION_STEP } from './WelcomeFlow';

/**
 * Protected route for the premium welcome experience (Prompt 1 foundation,
 * Prompt 2 interface, cinematic-intro rebuild). app/page.tsx only sends an
 * eligible member here once WELCOME_FLOW_ENABLED (lib/welcome/eligibility.ts)
 * is on. Coach and administrator role bounces happen in middleware.ts (same
 * pattern as /admin, /coach, /onboarding); an ineligible member goes back to
 * the normal routing hub, never a loop, since that hub only ever sends an
 * eligible member here and this page's own eligibility check is the same
 * check used there.
 *
 * A member who has already sat through (or skipped) the cinematic intro
 * pages once (profiles.welcome_intro_seen_at, migration 102) starts at
 * GOAL_SELECTION_STEP instead of Page 1, so returning to /welcome — e.g.
 * after closing the tab mid-flow — never replays the intro.
 */
export default async function WelcomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const eligible = await isEligibleForWelcomeFlow(supabase, user.id);
  if (!eligible) redirect('/');

  const { data: profile } = await supabase
    .from('profiles')
    .select('welcome_intro_seen_at')
    .eq('id', user.id)
    .maybeSingle();

  // Skip straight to the goal-selection page (Page 8) for a returning or
  // previously-interrupted member instead of replaying the cinematic intro.
  const initialStep = profile?.welcome_intro_seen_at ? GOAL_SELECTION_STEP : 1;

  return <WelcomeFlow initialStep={initialStep} />;
}
