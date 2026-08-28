/**
 * Assessment welcome/overview screen — what a member sees before ever
 * committing to the flow: what it covers, how long it takes, how many
 * sections, and (if applicable) that they already have progress saved.
 * Reads only through app/actions/assessments.ts — never touches Supabase
 * or the scoring engine directly.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, Clock3, ListChecks, ShieldCheck, Sparkles } from 'lucide-react';
import {
  beginAssessmentAction,
  getMyAssessmentOverview,
  retakeAssessmentAction,
} from '@/app/actions/assessments';
import { BeginAssessmentForm } from '@/components/assessments/BeginAssessmentForm';
import { CompletedExperienceActions } from '@/components/assessments/CompletedExperienceActions';
import { fromPublicSlug, toPublicSlug } from '@/lib/assessments/publicSlug';
import { findAssessmentDefinition } from '@/lib/assessment-registry/registry';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { describeLockReason } from '@/lib/assessment-registry/status';
import { lockOffersPlanLink } from '@/lib/locked-content/copy';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { PriorityBadge } from '@/components/assessments/PriorityBadge';
import { ASSESSMENT_SAFETY_STATEMENT } from '@/lib/assessments/insights';
import { formatAssessmentDate, formatLastSaved } from '@/lib/assessments/presentation';
import { CenterStage, Card } from '@/components/layout';
import { TrackSurfaceView } from '@/components/analytics/TrackSurfaceView';
import { memberTimezone } from '@/lib/time/memberToday';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function AssessmentOverviewPage({
  params,
  searchParams,
}: {
  params: { questionnaireId: string };
  searchParams: { saved?: string };
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const questionnaireId = fromPublicSlug(params.questionnaireId);
  // Same rule as the take route: an unknown slug is a 404, never a crash.
  if (!findAssessmentDefinition(questionnaireId)) notFound();

  const [overview, isCoach, timezone, access] = await Promise.all([
    getMyAssessmentOverview(questionnaireId),
    hasActiveRole(supabase, user.id, 'coach'),
    memberTimezone(supabase, user.id),
    checkAssessmentAccess(supabase, user.id, questionnaireId, { intent: 'view' }),
  ]);

  if (!overview) redirect('/login');

  const { questionnaire, copy, sectionCount, totalQuestions, draft, latestCompleted } = overview;

  if (!access.allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
        <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
          <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />

          <CenterStage>
            <Card className="mef-animate-in text-center">
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                {copy.displayTitle}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                {describeLockReason(access.reason)}
              </p>
              {lockOffersPlanLink(access.reason) && (
                <Link
                  href={'/membership' as Route}
                  className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
                >
                  View Membership
                </Link>
              )}
              <Link
                href={'/questionnaires' as Route}
                className="mt-3 block rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
              >
                Back to Questionnaires
              </Link>
            </Card>
          </CenterStage>
        </main>

        <MemberBottomNav isCoach={isCoach} />
      </div>
    );
  }
  const ctaLabel = draft ? 'Resume assessment' : 'Begin assessment';
  const justSaved = searchParams.saved === '1' && draft !== null;
  const answeredCount = draft?.answered ?? 0;
  // COMPLETION IS PERMANENT (2026-08-27). A questionnaire she has finished
  // leads with her results, and a retake is its own labelled button. It
  // used to offer only "Begin assessment", which opened the take route,
  // which silently started a blank retake on render.
  const showsCompletedState = latestCompleted !== null && draft === null;
  const beginThis = beginAssessmentAction.bind(null, questionnaire.id);
  const retakeThis = retakeAssessmentAction.bind(null, questionnaire.id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <TrackSurfaceView surface="questionnaire" />
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />

        {justSaved && draft && (
          <CenterStage>
            <Card className="mef-animate-in text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F0EA] text-[#4F7A63]">
                <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
                Assessment saved.
              </p>
              <p className="mt-1 text-sm text-[#6B7A72]">You can continue anytime.</p>

              <BeginAssessmentForm action={beginThis} label="Resume Assessment" className="mt-6" />
              <Link
                href={'/dashboard' as Route}
                className="mt-3 block rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
              >
                Return to Dashboard
              </Link>
            </Card>
          </CenterStage>
        )}

        {!justSaved && (
          <Card className="mef-animate-in mt-4">
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Wellness Assessment</p>
            </div>
            <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D]">
              {copy.displayTitle}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{copy.welcomeSubtitle}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-2xl bg-[#F3F6F4] px-4 py-2.5 text-sm text-[#1B3A2D]">
                <Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                About {copy.estimatedMinutes} minutes
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-[#F3F6F4] px-4 py-2.5 text-sm text-[#1B3A2D]">
                <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {sectionCount} sections · {totalQuestions} questions
              </div>
            </div>

            <p className="mt-4 text-sm text-[#1B3A2D]">
              {answeredCount} of {totalQuestions} questions completed
              {draft ? ', pick up right where you left off.' : ''}
            </p>
            {draft && (
              <p className="mt-1 text-xs text-[#6B7A72]">
                Last saved: {formatLastSaved(draft.updatedAt, timezone)}
              </p>
            )}

            {showsCompletedState ? (
              <CompletedExperienceActions
                resultsHref={`/assessments/${toPublicSlug(questionnaire.id)}/results/${latestCompleted.id}`}
                retakeAction={retakeThis}
              />
            ) : (
              <>
                <BeginAssessmentForm action={beginThis} label={ctaLabel} className="mt-6" />

                <p className="mt-3 text-center text-xs text-[#6B7A72]">
                  One question at a time. Your progress saves automatically, so you can always
                  finish later.
                </p>
              </>
            )}
          </Card>
        )}

        {latestCompleted && !showsCompletedState && (
          <Card
            as={Link}
            href={
              `/assessments/${toPublicSlug(questionnaire.id)}/results/${latestCompleted.id}` as Route
            }
            lift
            className="mef-animate-in mt-5 flex items-center justify-between gap-4 transition hover:bg-[#FAFAF8]"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Your last assessment
              </p>
              <p className="mt-1 text-sm text-[#1B3A2D]">
                {formatAssessmentDate(latestCompleted.completedAt)} · {latestCompleted.totalScore}{' '}
                of {latestCompleted.totalMaxScore}
              </p>
            </div>
            <PriorityBadge priority={latestCompleted.totalPriority} />
          </Card>
        )}

        {latestCompleted && (
          <Link
            href={`/assessments/${toPublicSlug(questionnaire.id)}/history` as Route}
            className="mt-3 block text-center text-sm font-medium text-[#1B3A2D] hover:underline"
          >
            View your full assessment history
          </Link>
        )}

        <section className="mt-6 flex items-start gap-3 px-1">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-[#6B7A72]">{ASSESSMENT_SAFETY_STATEMENT}</p>
        </section>

        {copy.attribution && (
          <p className="mt-4 px-1 text-center text-[11px] leading-relaxed text-[#6B7A72]/70">
            {copy.attribution}
          </p>
        )}
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
