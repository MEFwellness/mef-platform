/**
 * The Personal Reset Plan creation flow — entered only from the dashboard
 * entry card. Access is enforced here server-side (profiles.reset_plan_granted_at),
 * never only hidden in the UI: an ungranted member hitting this URL
 * directly is redirected to /dashboard before any plan content renders.
 * startOrResumeResetPlanAction is idempotent, so loading this page always
 * resumes the member's one real current plan rather than ever creating a
 * second one, including on refresh/back-button/re-entry.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasResetPlanAccess } from '@/lib/reset-plan/eligibility';
import { startOrResumeResetPlanAction } from '@/app/actions/resetPlan';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { BackButton } from '@/components/BackButton';
import { ResetPlanTaker } from '@/components/reset-plan/ResetPlanTaker';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';

export default async function ResetPlanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const granted = await hasResetPlanAccess(supabase, user.id);
  if (!granted) redirect('/dashboard');

  const result = await startOrResumeResetPlanAction();
  if (!result.ok) redirect('/dashboard');

  // Once active, this creation flow is done — the persistent dashboard
  // card is the plan's permanent home from here on.
  if (result.plan.status === 'active') redirect('/dashboard');

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="reset_plan" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" forceFallback />
        <h1 className="sr-only">Your Personal Reset Plan</h1>
        <div className="mt-4">
          <ResetPlanTaker initialPlan={result.plan} />
        </div>
      </main>
    </div>
  );
}
