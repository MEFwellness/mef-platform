import { createClient } from '@/lib/supabase/server';
import { isEligibleForWelcomeFlow } from '@/lib/welcome/eligibility';
import { redirect } from 'next/navigation';
import { WelcomeFlow } from './WelcomeFlow';

/**
 * Protected route for the four-screen premium welcome experience
 * (Prompt 1 foundation, Prompt 2 interface). app/page.tsx only sends an
 * eligible member here once WELCOME_FLOW_ENABLED (lib/welcome/eligibility.ts)
 * is on. Coach and administrator role bounces happen in middleware.ts (same
 * pattern as /admin, /coach, /onboarding); an ineligible member goes back to
 * the normal routing hub, never a loop, since that hub only ever sends an
 * eligible member here and this page's own eligibility check is the same
 * check used there.
 */
export default async function WelcomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const eligible = await isEligibleForWelcomeFlow(supabase, user.id);
  if (!eligible) redirect('/');

  return <WelcomeFlow />;
}
