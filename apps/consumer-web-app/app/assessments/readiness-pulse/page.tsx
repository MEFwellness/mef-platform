/**
 * Readiness Pulse overview — mirrors
 * app/assessments/life-signal-check/page.tsx's structure exactly (same
 * Unified Adaptive Assessment Foundation/Runtime reads, same
 * access-check-before-runtime ordering). The access check enforces this
 * experience's prerequisite (Life Signal Check must be completed first)
 * via the real, existing lib/assessment-registry prerequisiteKeys
 * mechanism.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Clock3, ListChecks, Sparkles } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { describeLockReason } from '@/lib/assessment-registry/status';
import { getUnifiedAssessmentDefinitionByKey, getUnifiedAssessmentQuestions } from '@/lib/assessment-foundation/repository';
import { findInProgressSession, findLatestCompletedSession } from '@/lib/assessment-runtime';
import { CompletedExperienceActions } from '@/components/assessments/CompletedExperienceActions';
import { BeginAssessmentForm } from '@/components/assessments/BeginAssessmentForm';
import { beginRplAction, retakeRplAction } from '@/app/actions/readinessPulse';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { RPL_KEY } from '@/lib/readiness-pulse/constants';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { CenterStage, Card } from '@/components/layout';

export default async function ReadinessPulseOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, access] = await Promise.all([hasActiveRole(supabase, user.id, 'coach'), checkAssessmentAccess(supabase, user.id, RPL_KEY, { intent: 'view' })]);

  if (!access.allowed) {
    return (
      <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
        <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
          <BackButton fallbackHref="/dashboard" label="Back" forceFallback />
          <CenterStage>
            <Card className="mef-animate-in text-center">
              <h1 className={`${CVS_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}>Readiness Pulse</h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{describeLockReason(access.reason, ['Life Signal Check'])}</p>
              <Link
                href={'/assessments/life-signal-check' as Route}
                className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
              >
                Go to Life Signal Check
              </Link>
            </Card>
          </CenterStage>
        </main>
        <MemberBottomNav isCoach={isCoach} />
      </div>
    );
  }

  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, RPL_KEY);
  if (!definition) redirect('/dashboard');

  // A draft she is part-way through, and whether she has ever finished this
  // one, are two independent facts, and this screen used to ask only the
  // first. See components/assessments/CompletedExperienceActions.tsx.
  const [questions, draftSession, latestCompleted] = await Promise.all([
    getUnifiedAssessmentQuestions(supabase, definition.id),
    findInProgressSession(supabase, user.id, definition.id),
    findLatestCompletedSession(supabase, user.id, definition.id),
  ]);

  const ctaLabel = draftSession ? 'Resume' : "Let's begin";
  // A draft outranks a past completion HERE and only here: she is in the
  // middle of a retake and picking it up is the honest offer.
  const showsCompletedState = Boolean(latestCompleted) && !draftSession;

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" forceFallback />

        <Card className="mef-animate-in mt-4">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Free with Root · Final conversation</p>
          </div>
          <h1 className={`${CVS_DISPLAY_FONT} mt-3 text-4xl leading-tight text-[#1B3A2D]`}>Readiness Pulse</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">Are you actually ready, or just curious? Zero judgment either way.</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-2xl bg-[#F5F0E4] px-4 py-2.5 text-sm text-[#1B3A2D]">
              <Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              About 4 minutes
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-[#F5F0E4] px-4 py-2.5 text-sm text-[#1B3A2D]">
              <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {questions.filter((q) => q.active).length} questions
            </div>
          </div>

          {draftSession && (
            <p className="mt-4 text-sm text-[#1B3A2D]">
              {draftSession.progress.answered} of {draftSession.progress.visible} questions answered, pick up right where you left off.
            </p>
          )}

          {showsCompletedState ? (
            <CompletedExperienceActions
              resultsHref={`/assessments/readiness-pulse/results/${latestCompleted!.id}`}
              retakeAction={retakeRplAction}
            />
          ) : (
            <BeginAssessmentForm action={beginRplAction} label={ctaLabel} className="mt-6" />
          )}
        </Card>
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
