/**
 * Primal Pattern Assessment welcome/overview screen. A literal route
 * (not the dynamic app/assessments/[questionnaireId]/ family) because
 * this questionnaire's content model genuinely differs from the
 * points-based engine those routes render — see migration 64's header
 * comment. Next.js resolves this exact literal path ahead of the dynamic
 * segment, so both families share the same /assessments/ URL space
 * without colliding. Reads only through app/actions/primal-pattern.ts.
 */

import Link from 'next/link';
import { BeginAssessmentForm } from '@/components/assessments/BeginAssessmentForm';
import { CompletedExperienceActions } from '@/components/assessments/CompletedExperienceActions';
import {
  beginPrimalPatternAction,
  retakePrimalPatternAction,
} from '@/app/actions/primal-pattern';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Clock3, ListChecks, Sparkles } from 'lucide-react';
import { getMyPrimalPatternOverview } from '@/app/actions/primal-pattern';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { describeLockReason } from '@/lib/assessment-registry/status';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { NutritionSafetyFlagsForm } from '@/components/health-safety/NutritionSafetyFlagsForm';
import { CenterStage, Card } from '@/components/layout';

const RESULT_LABEL: Record<string, string> = {
  polar: 'Polar',
  variable: 'Variable',
  equatorial: 'Equatorial',
};

export default async function PrimalPatternOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [overview, isCoach, access] = await Promise.all([
    getMyPrimalPatternOverview(),
    hasActiveRole(supabase, user.id, 'coach'),
    checkAssessmentAccess(supabase, user.id, 'primal-pattern-diet-type', { intent: 'view' }),
  ]);

  if (!overview) redirect('/login');

  if (!access.allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
        <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
          <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />

          <CenterStage>
            <Card className="mef-animate-in text-center">
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                {overview.copy.displayTitle}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                {describeLockReason(access.reason)}
              </p>
              {access.reason.kind !== 'not_assigned' && (
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

  const { copy, totalQuestions, draft, latestCompleted, safetyProfile } = overview;
  const ctaLabel = draft ? 'Resume assessment' : 'Begin assessment';
  // COMPLETION IS PERMANENT (2026-08-27). A finished Primal Pattern leads
  // with her result and offers the retake as its own labelled button. The
  // single "Retake assessment" link it used to show pointed at the take
  // URL, which started the retake as a side effect of rendering.
  const showsCompletedState = latestCompleted !== null && draft === null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" />

        <Card className="mef-animate-in mt-4">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">
              MEF Wellness Assessment
            </p>
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
              {totalQuestions} questions
            </div>
          </div>

          {draft && (
            <p className="mt-4 text-sm text-[#1B3A2D]">
              You&apos;re {draft.answered} of {draft.total} questions in. Pick up right where you
              left off.
            </p>
          )}

          {showsCompletedState ? (
            <CompletedExperienceActions
              resultsHref={`/assessments/primal-pattern-diet-type/results/${latestCompleted.id}`}
              retakeAction={retakePrimalPatternAction}
            />
          ) : (
            <>
              <BeginAssessmentForm
                action={beginPrimalPatternAction}
                label={ctaLabel}
                className="mt-6"
              />

              <p className="mt-3 text-center text-xs text-[#6B7A72]">
                One question at a time. You can select both answers when both feel true, or skip a
                question entirely. Your progress saves automatically, so you can always finish
                later.
              </p>
            </>
          )}
        </Card>

        {latestCompleted && !showsCompletedState && (
          <Card
            as={Link}
            href={`/assessments/primal-pattern-diet-type/results/${latestCompleted.id}` as Route}
            lift
            className="mef-animate-in mt-5 flex items-center justify-between gap-4 transition hover:bg-[#FAFAF8]"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Your last result
              </p>
              <p className="mt-1 text-sm text-[#1B3A2D]">
                {RESULT_LABEL[latestCompleted.result] ?? latestCompleted.result}
              </p>
            </div>
          </Card>
        )}

        <div className="mt-5">
          <NutritionSafetyFlagsForm initialProfile={safetyProfile} />
        </div>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
