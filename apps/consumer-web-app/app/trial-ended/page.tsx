/**
 * The lock screen. Where a member whose free trial is complete lands, and
 * the only member-facing screen this whole build adds.
 *
 * WHAT IT IS. A door, not a wall. The member is still signed in, their
 * account is untouched, every row of their data is exactly where it was,
 * and signing in still works so they can come straight back after paying.
 * The lock sits after authentication and before the member experience: see
 * middleware.ts, which redirects every member surface here while
 * decideMemberAccess() says the app is shut.
 *
 * THIS PAGE IS THE ONE THAT CHECKS ITSELF. An account that is allowed in
 * never sees this screen, whichever way it arrives (a bookmark, a typed
 * URL, a link from a stale tab), because the same decision runs here too
 * and sends them home. That is what stops the screen being reachable by
 * somebody who has just paid.
 *
 * ANALYTICS. One paywall_viewed event, feature member_app, lockReason
 * trial_expired. An existing event type with an added lockReason value, not
 * a new event type.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Sprout } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { staffHomePath } from '@/lib/auth/staffRouting';
import { fetchMemberAccessFacts } from '@/lib/membership/service';
import { decideMemberAccess, trialLengthDaysOf } from '@/lib/membership/access';
import { membershipPricingUrl } from '@/lib/config/conversionLinks';
import { TRIAL_ENDED_COPY, trialEndedHeading } from '@/lib/membership/copy';
import { TrackPaywallView } from '@/components/analytics/TrackSurfaceView';
import { SignOutButton } from '@/components/SignOutButton';
import { getCachedUser } from '@/lib/supabase/currentUser';

// Static, so it names no number: the tab title is the same markup for a
// member given 7 days and one given 30, and only the heading below can
// safely tell them apart.
export const metadata: Metadata = { title: 'Your free trial is complete' };

export const dynamic = 'force-dynamic';

export default async function TrialEndedPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  // Staff never belong here. They are redirected off member surfaces
  // everywhere else in the app and this is no different.
  const [isCoach, isAdmin] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    hasActiveRole(supabase, user.id, 'platform_administrator'),
  ]);
  const staffHome = staffHomePath({ isCoach, isAdmin });
  if (staffHome) redirect(staffHome);

  const facts = await fetchMemberAccessFacts(supabase, user.id);
  const decision = decideMemberAccess({ ...facts, now: new Date() });
  if (decision.allowed) redirect('/dashboard');

  // Measured off her own stored window, never off today's trial length. An
  // account stamped before migration 198 was given 30 days and this screen
  // says 30 to her, while a new account is told 7. See lib/membership/copy.ts.
  const trialLengthDays = facts.subscription
    ? trialLengthDaysOf(facts.subscription.trialStartedAt, facts.subscription.trialEndsAt)
    : null;

  // NULL IS A REAL ANSWER AND THIS SCREEN HONORS IT. Until a membership
  // page is configured there is no button here at all. It used to render one
  // pointing at a hard coded placeholder token, which is a link that does
  // not move and a placeholder a member could read. The support line below
  // is on this screen either way, so nobody reaching it is ever left without
  // a way to continue.
  const pricingUrl = membershipPricingUrl();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <TrackPaywallView feature="member_app" lockReason="trial_expired" />

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-12 pt-safe-header sm:px-8">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Sprout className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em]">
            {TRIAL_ENDED_COPY.eyebrow}
          </p>
        </div>

        <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[2.5rem] leading-[1.1] text-[#1B3A2D]">
          {trialEndedHeading(trialLengthDays)}
        </h1>

        <div className="mt-5 space-y-4">
          {TRIAL_ENDED_COPY.body.map((paragraph) => (
            <p key={paragraph} className="text-[15px] leading-relaxed text-[#4F645A]">
              {paragraph}
            </p>
          ))}
        </div>

        {pricingUrl ? (
          <a
            href={pricingUrl}
            className="mef-focus-ring mef-press mt-8 block rounded-full bg-[#1B3A2D] px-6 py-4 text-center text-[15px] font-semibold text-[#FAFAF8] transition hover:brightness-110"
          >
            {TRIAL_ENDED_COPY.primaryCta}
          </a>
        ) : (
          <p className="mt-8 text-center text-sm leading-relaxed text-[#6B7A72]">
            {TRIAL_ENDED_COPY.unconfiguredNote}
          </p>
        )}

        <p className="mt-6 text-center text-sm leading-relaxed text-[#6B7A72]">
          {TRIAL_ENDED_COPY.supportLead}{' '}
          <a
            href={`mailto:${TRIAL_ENDED_COPY.supportEmail}`}
            className="font-medium text-[#1B3A2D] underline underline-offset-2"
          >
            {TRIAL_ENDED_COPY.supportEmail}
          </a>
        </p>

        <div className="mt-10 rounded-[24px] bg-white/70 px-5 py-4 text-center">
          <p className="text-sm leading-relaxed text-[#4F645A]">{TRIAL_ENDED_COPY.dataNote}</p>
          <p className="mt-1.5 text-xs text-[#6B7A72]">
            {TRIAL_ENDED_COPY.signedInAs} {user.email}
          </p>
        </div>

        <div className="mt-6">
          <SignOutButton variant="block" />
        </div>
      </main>
    </div>
  );
}
