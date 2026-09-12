/**
 * The MEF Whole-Body Signal Assessment's own route.
 *
 * ACCESS IS ENFORCED HERE, SERVER SIDE, not merely hidden in the UI. A
 * member her coach has not assigned this to is redirected to Home before
 * any content renders, and the rule that decides it is the identical
 * getMyWholeBodySignal the pop-up chain and Home's card read.
 *
 * A FINISHED SITTING IS NOT A REDIRECT. She gets her results back rather
 * than being silently bounced. Which of the screens she sees is decided
 * inside WholeBodySignalExperience rather than here, for the reason its
 * own header states: a Server Action re-renders this route.
 *
 * THIS RENDER WRITES NOTHING. No claim, no draft row, no session. The row
 * this assessment keeps while she is partway through is created by her own
 * answer and by nothing else.
 *
 * TWO BUNDLES, AND ONLY ONE OF THEM CROSSES TO THE BROWSER.
 * `loadMemberContent` is what the answering component is handed: question
 * rows carrying a prompt, a position and whether Prefer not to answer is
 * offered, and nothing else. `loadReadingContent` is read here on the
 * server, to build her results view, and it never leaves this function.
 * Everything a client component receives is serialised into this page, so
 * a practitioner column left in the first bundle would be in the payload
 * whether a component drew it or not.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { getMyWholeBodySignal } from '@/lib/whole-body-signal/view';
import { loadMemberContent, loadReadingContent } from '@/lib/whole-body-signal/contentData';
import { buildMemberResultsView } from '@/lib/whole-body-signal/memberView';
import { CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { WholeBodySignalExperience } from '@/components/whole-body-signal/WholeBodySignalExperience';

export default async function WholeBodySignalPage() {
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const state = await getMyWholeBodySignal();
  if (!state) redirect('/dashboard');

  const supabase = createClient();
  const content = await loadMemberContent(supabase);

  const completedView =
    state.status === 'completed' && state.session.results
      ? await (async () => {
          const reading = await loadReadingContent(supabase);
          return buildMemberResultsView({
            sections: reading.sections,
            questions: reading.questions,
            scale: reading.scale,
            bands: reading.bands,
            branchRules: reading.branchRules,
            answers: state.session.answers,
            results: state.session.results!,
            settings: reading.settings,
          });
        })()
      : null;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <TrackSurfaceView surface="whole_body_signal" />
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="mt-4">
          <WholeBodySignalExperience
            status={state.status}
            content={content}
            resumeAnswers={state.status === 'in_progress' ? state.session.answers : {}}
            resumeRoutingOptionKey={
              state.status === 'in_progress' ? state.session.routingOptionKey : null
            }
            completedView={completedView}
          />
        </div>
      </main>
    </div>
  );
}
