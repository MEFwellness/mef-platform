/**
 * The Weekly Experiment's own dedicated destination — where the "From
 * Root" dashboard tile sends a member for the day-3/day-7 follow-ups (see
 * components/dashboard/CoachingMessageCard.tsx), and where the daily
 * Yes/Not-today tap lives between visits to the full Core Values Snapshot
 * flow. Reads the same real experiment/daily-log data the in-flow
 * CvsExperimentPanel does — no separate state.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { getMyCvsExperimentStatusAction } from '@/app/actions/coreValuesSnapshot';
import { areaFromLabel } from '@/lib/core-values-snapshot/constants';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { CvsExperimentPanel } from '@/components/core-values-snapshot/CvsExperimentPanel';
import { CenterStage, Card } from '@/components/layout';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function CvsExperimentPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [status, isCoach] = await Promise.all([
    getMyCvsExperimentStatusAction(),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md space-y-4 px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" forceFallback />

        {status ? (
          <CvsExperimentPanel
            sessionId={status.experiment.sourceSessionId ?? ''}
            topValue={areaFromLabel(status.experiment.title) ?? 'health'}
            scoring={null}
            initialStatus={status}
          />
        ) : (
          <CenterStage>
            <Card className="mef-animate-in text-center">
              <p className={`${CVS_DISPLAY_FONT} text-2xl text-[#1B3A2D]`}>No experiment running right now</p>
              <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                Your five-minute experiment starts at the end of the Core Values Snapshot.
              </p>
            </Card>
          </CenterStage>
        )}
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
