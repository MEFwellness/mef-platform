/**
 * Life Signal Check's Weekly Experiment destination — mirrors
 * app/assessments/core-values-snapshot/experiment/page.tsx exactly.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { getMyLscExperimentStatusAction } from '@/app/actions/lifeSignalCheck';
import { SIGNALS, SIGNAL_LABEL, type Signal } from '@/lib/life-signal-check/constants';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { CVS_CARD, CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { LscExperimentPanel } from '@/components/life-signal-check/LscExperimentPanel';

function signalFromLabel(label: string): Signal {
  return SIGNALS.find((s) => SIGNAL_LABEL[s] === label) ?? 'energy';
}

export default async function LscExperimentPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [status, isCoach] = await Promise.all([getMyLscExperimentStatusAction(), hasActiveRole(supabase, user.id, 'coach')]);

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md space-y-4 px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" forceFallback />

        {status ? (
          <LscExperimentPanel
            sessionId={status.experiment.sourceSessionId ?? ''}
            chosenSignal={signalFromLabel(status.experiment.title)}
            scoring={null}
            initialStatus={status}
          />
        ) : (
          <section className={`${CVS_CARD} mef-animate-in p-7 text-center`}>
            <p className={`${CVS_DISPLAY_FONT} text-2xl text-[#1B3A2D]`}>No experiment running right now</p>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
              Your five-minute experiment starts at the end of the Life Signal Check.
            </p>
          </section>
        )}
      </main>
      <BottomNav isCoach={isCoach} />
    </div>
  );
}
