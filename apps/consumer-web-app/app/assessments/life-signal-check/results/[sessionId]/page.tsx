/**
 * Life Signal Check results — for revisiting a completed session later,
 * mirrors app/assessments/core-values-snapshot/results/[sessionId]/
 * page.tsx exactly. Recomputes scoring live from the session's own real
 * stored answers plus the member's latest completed Core Values Snapshot
 * (needed only for the Body-Value Echo adjacency check), never a
 * separately persisted "results" row.
 */

import fs from 'node:fs';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionById } from '@/lib/assessment-runtime';
import { computeLscScoring } from '@/lib/life-signal-check/scoring';
import { getMyLscExperimentStatusAction, getMyLatestCvsContextForEchoAction } from '@/app/actions/lifeSignalCheck';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { hasActiveRole } from '@/lib/auth/guards';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { WhatRootLearnedSection, ResourceSection, ReturnToDashboardButton } from '@/components/life-signal-check/LscResultsView';
import { LscExperimentPanel } from '@/components/life-signal-check/LscExperimentPanel';
import { WhatRootKnowsCard } from '@/components/core-values-snapshot/WhatRootKnowsCard';
import { getCachedUser } from '@/lib/supabase/currentUser';

function checkAudioAvailable(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'audio', 'signals-not-verdicts.mp3'));
  } catch {
    return false;
  }
}

export default async function LifeSignalCheckResultsPage({ params }: { params: { sessionId: string } }) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [session, isCoach] = await Promise.all([getSessionById(supabase, params.sessionId), hasActiveRole(supabase, user.id, 'coach')]);

  if (!session || session.memberId !== user.id || session.status !== 'completed') {
    redirect('/assessments/life-signal-check');
  }

  const cvsContext = await getMyLatestCvsContextForEchoAction();
  const scoring = computeLscScoring(session.answers, cvsContext);
  const experimentStatus = await getMyLscExperimentStatusAction();
  const audioAvailable = checkAudioAvailable();

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md space-y-4 px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" forceFallback />

        <WhatRootLearnedSection scoring={scoring} />

        <LscExperimentPanel sessionId={session.id} chosenSignal={scoring.chosenSignal} scoring={scoring} initialStatus={experimentStatus} />

        <ResourceSection audioAvailable={audioAvailable} />

        <WhatRootKnowsCard sessionId={session.id} notes={['core-values-snapshot', 'life-signal-check']} />

        <ReturnToDashboardButton />
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
