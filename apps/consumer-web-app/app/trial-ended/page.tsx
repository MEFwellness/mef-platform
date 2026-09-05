/**
 * DAY 8 AND AFTER: the soft continuation state.
 *
 * WHAT IT USED TO BE. A lock screen. One heading, two paragraphs and a
 * button, identical for everybody who reached it, and nothing on it about
 * the week she had just spent here.
 *
 * WHAT IT IS NOW. The day 8 state of the trial arc for a prospect. Her own
 * Week 1 outcome is preserved on it, her recap is one tap away, both doors
 * are offered with no pressure of any kind, and the fact that her free week
 * is complete is stated plainly and never weaponised. It is still a door
 * and not a wall: she is still signed in, her account is untouched, every
 * row of her data is exactly where it was, and signing in still works.
 *
 * ONLY A PROSPECT LANDS HERE, and that is enforced twice.
 *
 *   In the middleware, which now reads her relationship beside her
 *   entitlement and refuses to send anybody but a PROSPECT to this path
 *   (lib/membership/routing.ts).
 *
 *   And here, on the page itself, for a bookmark, a typed URL or a link
 *   from a stale tab. Every sentence on this screen is true of somebody who
 *   came in on the automatic free trial and false of a coaching client or a
 *   paid member, so a non-prospect is sent home rather than shown a story
 *   about a trial they never had.
 *
 * WHAT IT READS. Her stored close (migration 206) and her stored recap
 * (migration 205), through the gate-free read path days 6 and 7 were built
 * to hand it, plus her own subscription row for the counts the no-arc state
 * may name. No assessment registry gate, no plan gate, no recomputation of
 * anything: the close and the recap were each composed once, during her
 * week, and they say the same thing today that they said then.
 *
 * THIS RENDER WRITES NOTHING. Not a row, not a stamp, not a receipt. A page
 * reached by a redirect must be especially careful about that: a
 * render-time write here would fire for every locked account on every
 * screen it tried to open.
 *
 * ANALYTICS. One paywall_viewed event, feature member_app, lockReason
 * trial_expired, unchanged from the lock screen this replaces.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { staffHomePath } from '@/lib/auth/staffRouting';
import { fetchMemberAccessFacts } from '@/lib/membership/service';
import { decideMemberAccess } from '@/lib/membership/access';
import { deriveRelationship, fetchRelationshipFacts } from '@/lib/membership/relationship';
import { conversionLinks } from '@/lib/config/conversionLinks';
import { memberTimezone } from '@/lib/time/memberToday';
import { resolveTrialEndedState } from '@/lib/trial-ended/continuationData';
import { renderTrialEndedContinuation } from '@/lib/trial-ended/continuationCopy';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackPaywallView } from '@/components/analytics/TrackSurfaceView';
import { TrialEndedContinuationView } from '@/components/trial-ended/TrialEndedContinuationView';
import { SignOutButton } from '@/components/SignOutButton';
import { getCachedUser } from '@/lib/supabase/currentUser';

// Static, and it names no number: the same markup for a member given 7 free
// days and one given 30. Every screen in this app that names a length reads
// it off her own stored window, and a tab title cannot.
export const metadata: Metadata = { title: 'Your free week is complete' };

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

  const [facts, relationshipFacts] = await Promise.all([
    fetchMemberAccessFacts(supabase, user.id),
    fetchRelationshipFacts(supabase, user.id),
  ]);

  // An account that is allowed in never sees this screen, whichever way it
  // arrives, which is what stops it being reachable by somebody who has
  // just paid.
  const decision = decideMemberAccess({ ...facts, now: new Date() });
  if (decision.allowed) redirect('/dashboard');

  // And neither does an account this screen would be lying to. A coaching
  // client and an app member are not prospects, nothing here is written for
  // them, and the middleware already refuses to send them; this is the same
  // rule for the request the middleware never saw.
  if (deriveRelationship(relationshipFacts) !== 'PROSPECT') redirect('/dashboard');

  const timeZone = await memberTimezone(supabase, user.id);
  const state = await resolveTrialEndedState(supabase, user.id, {
    subscription: facts.subscription,
    timeZone,
  });

  // The addresses are resolved on the server on every render and handed
  // down. A stored URL is a URL that goes stale, and a membership page set
  // in Vercel for the first time must make the second door appear with no
  // deploy and no migration.
  const screen = renderTrialEndedContinuation(state, conversionLinks());
  const hasStoredClose = state.kind === 'full' || state.kind === 'close_unopened';

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackPaywallView feature="member_app" lockReason="trial_expired" />
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10">
        <div className="mt-4">
          <TrialEndedContinuationView
            screen={screen}
            revealKey={state.kind}
            recordDoors={hasStoredClose}
          />

          <div className="mt-8 text-center">
            <p className="text-xs text-[#6B7A72]">Signed in as {user.email}</p>
          </div>
          <div className="mt-4">
            <SignOutButton variant="block" />
          </div>
        </div>
      </main>
    </div>
  );
}
