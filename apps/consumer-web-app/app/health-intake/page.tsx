/**
 * The Health & Lifestyle Intake's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyHealthIntake the pop-up chain and Home's card read.
 *
 * A FINISHED SITTING IS NOT A REDIRECT. She gets her three cards back
 * rather than being silently bounced. Which of the screens she sees is
 * decided inside HealthIntakeExperience rather than here, for the reason
 * its own header states: a Server Action re-renders this route.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. The row
 * this intake keeps while she is partway through is created by her own
 * Continue and by nothing else.
 *
 * THE DAY IS DECIDED HERE, IN HER OWN ZONE. The date of birth field needs
 * an upper bound, and a client component asking the browser what today is
 * would ask a different question in every timezone. It is resolved on the
 * server from her stored zone and handed down as a prop, which is the rule
 * lib/time/memberToday.ts exists to keep.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { memberTodayLocalDate } from '@/lib/time/memberToday';
import { getHealthIntakePrefill, getMyHealthIntake } from '@/lib/health-intake/view';
import { buildMemberSummary } from '@/lib/health-intake/memberSummary';
import { evaluateIntakeSafety } from '@/lib/health-intake/safety';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { HealthIntakeExperience } from '@/components/health-intake/HealthIntakeExperience';

export default async function HealthIntakePage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyHealthIntake();
  if (!state) redirect('/dashboard');

  const supabase = createClient();
  const [prefill, maxDate] = await Promise.all([
    getHealthIntakePrefill(),
    memberTodayLocalDate(supabase, user.id),
  ]);

  const completedView =
    state.status === 'completed'
      ? buildMemberSummary(state.session.answers, {
          safetyTriggered: evaluateIntakeSafety(state.session.answers).length > 0,
        })
      : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="health_intake" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          <HealthIntakeExperience
            status={state.status}
            resumeAnswers={state.status === 'completed' ? {} : (state.status === 'in_progress' ? state.session.answers : {})}
            resumeStepIndex={state.status === 'in_progress' ? state.session.stepIndex : 0}
            prefillName={prefill.displayName}
            maxDate={maxDate}
            completedView={completedView}
          />
        </div>
      </main>
    </div>
  );
}
