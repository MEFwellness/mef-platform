import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isEligibleForWelcomeFlow } from '@/lib/welcome/eligibility';
import { redirect } from 'next/navigation';

const SHELL =
  'min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]';
const CONTAINER = 'mx-auto w-full max-w-md px-5 py-10 sm:px-6 md:max-w-2xl md:px-10';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';

/**
 * Reserved route for the future four-screen welcome flow. Not linked from
 * anywhere yet: app/page.tsx only sends members here once
 * WELCOME_FLOW_ENABLED (lib/welcome/eligibility.ts) is turned on. This
 * placeholder exists purely so the route is protected and safe to land on
 * if a member types the URL directly before that happens: coach and
 * administrator role bounces happen in middleware.ts (same pattern as
 * /admin, /coach, /onboarding); an ineligible member goes back to the
 * normal routing hub, never a loop, since that hub only ever sends an
 * eligible member here and this page's own eligibility check is the same
 * check. An eligible member gets a minimal holding page with a safe way
 * forward, not an unfinished production experience.
 */
export default async function WelcomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const eligible = await isEligibleForWelcomeFlow(supabase, user.id);
  if (!eligible) redirect('/');

  return (
    <div className={SHELL}>
      <main className={CONTAINER}>
        <h1 className={HEADING}>Welcome</h1>
        <p className="mt-2 text-[15px] text-[#6B7A72]">
          Your welcome experience is still being finished. Continue to your onboarding assessment
          for now.
        </p>
        <Link
          href="/onboarding"
          className="mt-6 inline-block rounded-full bg-[#1B3A2D] px-6 py-3 text-sm font-medium text-white"
        >
          Continue to onboarding
        </Link>
      </main>
    </div>
  );
}
