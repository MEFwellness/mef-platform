/**
 * Rooted Reset Fuel Pattern Assessment results, Build 1 of 4.
 *
 * DELIBERATELY THE SAME SHORT REVEAL the taker ends on, and nothing more.
 * The full result page arrives in Build 2 along with the coach view, and
 * a Build 1 results screen that invented its own richer treatment would
 * have to be unpicked rather than replaced. What it must do today is be
 * somewhere real for a member returning to a finished sitting to land,
 * reading the same pattern and the same sentence she was shown on the
 * day.
 *
 * The pattern comes from her STORED row, not from a recompute, so a later
 * change to the weight map cannot quietly rewrite a reading she has
 * already been given.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionById } from '@/lib/assessment-runtime';
import { findFuelPatternResultBySession } from '@/lib/fuel-pattern/data';
import { hasActiveRole } from '@/lib/auth/guards';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { FuelPatternReveal } from '@/components/fuel-pattern/FuelPatternReveal';
import { FPA_ROUTE } from '@/lib/fuel-pattern/constants';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';

export default async function FuelPatternResultsPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [session, isCoach] = await Promise.all([
    getSessionById(supabase, params.sessionId),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  if (!session || session.memberId !== user.id || session.status !== 'completed') {
    redirect(FPA_ROUTE);
  }

  const stored = await findFuelPatternResultBySession(supabase, params.sessionId);
  if (!stored) redirect(FPA_ROUTE);

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />
        {/* startAtPattern, because a member opening her own stored result
            is not finishing anything and has no pause to sit through. */}
        <FuelPatternReveal pattern={stored.pattern} startAtPattern />
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
