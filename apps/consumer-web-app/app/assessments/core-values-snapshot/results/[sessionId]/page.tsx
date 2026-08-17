/**
 * Core Values Snapshot results — for revisiting a completed session later
 * (the in-flow taker already shows this same content once, right after
 * finishing; this route is what a saved link, a coach hand-off, or a
 * second visit lands on). Recomputes scoring live from the session's own
 * real stored answers (lib/core-values-snapshot/scoring.ts), same as the
 * in-flow view — never a separately persisted "results" row.
 */

import fs from 'node:fs';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionById } from '@/lib/assessment-runtime';
import { computeCvsScoring } from '@/lib/core-values-snapshot/scoring';
import { getMyCvsExperimentStatusAction } from '@/app/actions/coreValuesSnapshot';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { hasActiveRole } from '@/lib/auth/guards';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { WhatRootLearnedSection, ResourceSection, ReturnToDashboardButton } from '@/components/core-values-snapshot/CvsResultsView';
import { CvsExperimentPanel } from '@/components/core-values-snapshot/CvsExperimentPanel';
import { WhatRootKnowsCard } from '@/components/core-values-snapshot/WhatRootKnowsCard';

function checkAudioAvailable(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'audio', 'values-before-habits.mp3'));
  } catch {
    return false;
  }
}

export default async function CoreValuesSnapshotResultsPage({ params }: { params: { sessionId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [session, isCoach] = await Promise.all([
    getSessionById(supabase, params.sessionId),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  if (!session || session.memberId !== user.id || session.status !== 'completed') {
    redirect('/assessments/core-values-snapshot');
  }

  const scoring = computeCvsScoring(session.answers);
  const experimentStatus = await getMyCvsExperimentStatusAction();
  const audioAvailable = checkAudioAvailable();

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md space-y-4 px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" forceFallback />

        <WhatRootLearnedSection scoring={scoring} />

        <CvsExperimentPanel
          sessionId={session.id}
          topValue={scoring.topValue}
          scoring={scoring}
          initialStatus={experimentStatus}
        />

        <ResourceSection audioAvailable={audioAvailable} />

        <WhatRootKnowsCard sessionId={session.id} />

        <ReturnToDashboardButton />
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
