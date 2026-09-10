/**
 * The MEF Body Systems Survey's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyBodySystemsSurvey the pop-up chain and Home's card read.
 *
 * A FINISHED SITTING IS NOT A REDIRECT. She gets her results back rather
 * than being silently bounced. Which of the screens she sees is decided
 * inside BodySystemsExperience rather than here, for the reason its own
 * header states: a Server Action re-renders this route.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. The row
 * this survey does keep while she is partway through is created by her
 * Continue button and by nothing else.
 *
 * IT LOADS THE MEMBER BUNDLE, NEVER THE COACH ONE. loadMemberContent does
 * not ask for the association library or for a coach copy row, so there is
 * nothing on this page to leak even by accident, and the database would
 * refuse the request anyway.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyBodySystemsSurvey } from '@/lib/body-systems/view';
import { loadMemberContent } from '@/lib/body-systems/contentData';
import { listBodySystemsSessions } from '@/lib/body-systems/data';
import { buildMemberResultsView } from '@/lib/body-systems/memberView';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { BodySystemsExperience } from '@/components/body-systems/BodySystemsExperience';

export default async function BodySystemsPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyBodySystemsSurvey();
  if (!state) redirect('/dashboard');

  const supabase = createClient();
  const content = await loadMemberContent(supabase);

  // Her two most recent finished sittings, so a completed screen can show
  // this time beside last time. Two, never one: the newest is the sitting
  // being read and the one behind it is what it is compared against.
  const history =
    state.status === 'completed' ? await listBodySystemsSessions(supabase, user.id, 2) : null;

  const completedView =
    state.status === 'completed' && state.session.results
      ? buildMemberResultsView({
          sections: content.sections,
          bands: content.bands,
          results: state.session.results,
          previousResults:
            history?.records.find((record) => record.id !== state.session.id)?.results ?? null,
          minDeltaPercent: content.minDeltaPercent,
        })
      : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="body_systems_survey" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          <BodySystemsExperience
            status={state.status}
            content={content}
            rememberedBranch={state.status === 'completed' ? null : state.rememberedBranch}
            resumeAnswers={state.status === 'in_progress' ? state.session.answers : {}}
            resumeRedFlagAnswers={
              state.status === 'in_progress' ? state.session.redFlagAnswers : {}
            }
            resumeStepIndex={state.status === 'in_progress' ? state.session.stepIndex : 0}
            completedView={completedView}
          />
        </div>
      </main>
    </div>
  );
}
