/**
 * Readiness Pulse results — for revisiting a completed session later,
 * mirrors app/assessments/life-signal-check/results/[sessionId]/page.tsx
 * exactly. Recomputes scoring live from the session's own real stored
 * answers plus the member's latest completed Life Signal Check (needed
 * only for Question 8's comparison and the experiment's own target
 * signal/timing), never a separately persisted "results" row.
 */

import fs from 'node:fs';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSessionById } from '@/lib/assessment-runtime';
import { computeRplScoring } from '@/lib/readiness-pulse/scoring';
import { getMyRplExperimentStatusAction, getMyLatestLscContextForRplAction, getMyEvidenceEchoAction } from '@/app/actions/readinessPulse';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { hasActiveRole } from '@/lib/auth/guards';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { WhatRootLearnedSection, ResourceSection, ReturnToDashboardButton } from '@/components/readiness-pulse/RplResultsView';
import { RplExperimentPanel } from '@/components/readiness-pulse/RplExperimentPanel';
import { WhatRootKnowsCard } from '@/components/core-values-snapshot/WhatRootKnowsCard';

function checkAudioAvailable(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'audio', 'readiness-is-evidence.mp3'));
  } catch {
    return false;
  }
}

export default async function ReadinessPulseResultsPage({ params }: { params: { sessionId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [session, isCoach] = await Promise.all([getSessionById(supabase, params.sessionId), hasActiveRole(supabase, user.id, 'coach')]);

  if (!session || session.memberId !== user.id || session.status !== 'completed') {
    redirect('/assessments/readiness-pulse');
  }

  const lscContext = await getMyLatestLscContextForRplAction();
  const scoring = computeRplScoring(session.answers, lscContext);
  const [experimentStatus, evidenceEcho] = await Promise.all([getMyRplExperimentStatusAction(), getMyEvidenceEchoAction()]);
  const audioAvailable = checkAudioAvailable();

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md space-y-4 px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" forceFallback />

        <WhatRootLearnedSection scoring={scoring} evidenceEcho={evidenceEcho} />

        <RplExperimentPanel sessionId={session.id} scoring={scoring} initialStatus={experimentStatus} />

        <ResourceSection audioAvailable={audioAvailable} />

        <WhatRootKnowsCard sessionId={session.id} notes={['core-values-snapshot', 'life-signal-check', 'readiness-pulse']} />

        <ReturnToDashboardButton />
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
