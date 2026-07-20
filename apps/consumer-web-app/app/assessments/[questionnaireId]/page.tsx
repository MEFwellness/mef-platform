/**
 * Assessment welcome/overview screen — what a member sees before ever
 * committing to the flow: what it covers, how long it takes, how many
 * sections, and (if applicable) that they already have progress saved.
 * Reads only through app/actions/assessments.ts — never touches Supabase
 * or the scoring engine directly.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { CheckCircle2, Clock3, ListChecks, ShieldCheck, Sparkles } from 'lucide-react';
import { getMyAssessmentOverview } from '@/app/actions/assessments';
import { fromPublicSlug, toPublicSlug } from '@/lib/assessments/publicSlug';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { describeLockReason } from '@/lib/assessment-registry/status';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { PriorityBadge } from '@/components/assessments/PriorityBadge';
import { ASSESSMENT_SAFETY_STATEMENT } from '@/lib/assessments/insights';
import { formatAssessmentDate, formatLastSaved } from '@/lib/assessments/presentation';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function AssessmentOverviewPage({
  params,
  searchParams,
}: {
  params: { questionnaireId: string };
  searchParams: { saved?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const questionnaireId = fromPublicSlug(params.questionnaireId);

  const [overview, isCoach, { data: profile }, access] = await Promise.all([
    getMyAssessmentOverview(questionnaireId),
    hasActiveRole(supabase, user.id, 'coach'),
    supabase.from('profiles').select('timezone').eq('id', user.id).single(),
    checkAssessmentAccess(supabase, user.id, questionnaireId),
  ]);

  if (!overview) redirect('/login');

  const { questionnaire, copy, sectionCount, totalQuestions, draft, latestCompleted } = overview;

  if (!access.allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
        <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
          <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />

          <section className={`${CARD} mef-animate-in mt-4 p-7 text-center`}>
            <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
              {copy.displayTitle}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
              {describeLockReason(access.reason)}
            </p>
            <Link
              href={'/membership' as Route}
              className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              View Membership
            </Link>
            <Link
              href={'/questionnaires' as Route}
              className="mt-3 block rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
            >
              Back to Questionnaires
            </Link>
          </section>
        </main>

        <BottomNav isCoach={isCoach} />
      </div>
    );
  }
  const timezone = profile?.timezone ?? 'America/New_York';
  const ctaLabel = draft ? 'Resume assessment' : 'Begin assessment';
  const ctaHref = `/assessments/${toPublicSlug(questionnaire.id)}/take` as Route;
  const justSaved = searchParams.saved === '1' && draft !== null;
  const answeredCount = draft?.answered ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />

        {justSaved && draft && (
          <section className={`${CARD} mef-animate-in mt-4 p-7 text-center`}>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F0EA] text-[#4F7A63]">
              <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
              Assessment saved.
            </p>
            <p className="mt-1 text-sm text-[#6B7A72]">You can continue anytime.</p>

            <Link
              href={ctaHref}
              className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              Resume Assessment
            </Link>
            <Link
              href={'/dashboard' as Route}
              className="mt-3 block rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
            >
              Return to Dashboard
            </Link>
          </section>
        )}

        {!justSaved && (
          <section className={`${CARD} mef-animate-in mt-4 p-7`}>
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

            <Link
              href={ctaHref}
              className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              {ctaLabel}
            </Link>

            <p className="mt-3 text-center text-xs text-[#6B7A72]">
              One question at a time. Your progress saves automatically, so you can always finish
              later.
            </p>
          </section>
        )}

        {latestCompleted && (
          <Link
            href={
              `/assessments/${toPublicSlug(questionnaire.id)}/results/${latestCompleted.id}` as Route
            }
            className={`${CARD} mef-animate-in mt-5 flex items-center justify-between gap-4 p-6 transition hover:bg-[#FAFAF8]`}
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
          </Link>
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

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
