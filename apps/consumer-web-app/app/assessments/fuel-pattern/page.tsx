/**
 * Rooted Reset Fuel Pattern Assessment overview.
 *
 * Mirrors app/assessments/readiness-pulse/page.tsx's structure exactly:
 * the same access check before any runtime read, the same
 * draft-outranks-completion rule for the call to action, and the same
 * shared Begin and Completed controls. Nothing about the gate is written
 * here; lib/assessment-registry/access.ts decides it, and this screen
 * only prints what it decided.
 *
 * This assessment sits at the Monthly plan minimum, inherited from the
 * retired Primal Pattern Diet Type, so a member below it reads the shared
 * plan sentence rather than a bespoke one.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Clock3, ListChecks, Sparkles } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { describeLockReason } from '@/lib/assessment-registry/status';
import { lockOffersPlanLink } from '@/lib/locked-content/copy';
import {
  getUnifiedAssessmentDefinitionByKey,
  getUnifiedAssessmentQuestions,
} from '@/lib/assessment-foundation/repository';
import { findInProgressSession, findLatestCompletedSession } from '@/lib/assessment-runtime';
import { CompletedExperienceActions } from '@/components/assessments/CompletedExperienceActions';
import { BeginAssessmentForm } from '@/components/assessments/BeginAssessmentForm';
import { beginFpaAction, retakeFpaAction } from '@/app/actions/fuelPattern';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { FPA_KEY, FPA_LABEL, FPA_ROUTE } from '@/lib/fuel-pattern/constants';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { CenterStage, Card } from '@/components/layout';
import { getCachedUser } from '@/lib/supabase/currentUser';

export default async function FuelPatternOverviewPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [isCoach, access] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    checkAssessmentAccess(supabase, user.id, FPA_KEY, { intent: 'view' }),
  ]);

  if (!access.allowed) {
    return (
      <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
        <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
          <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />
          <CenterStage>
            <Card className="mef-animate-in text-center">
              <h1 className={`${CVS_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}>{FPA_LABEL}</h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{describeLockReason(access.reason)}</p>
              {lockOffersPlanLink(access.reason) && (
                <Link
                  href={'/membership' as Route}
                  className="mef-focus-ring mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
                >
                  View Membership
                </Link>
              )}
              <Link
                href={'/questionnaires' as Route}
                className="mef-focus-ring mt-3 block rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
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

  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, FPA_KEY);
  if (!definition) redirect('/questionnaires');

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
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />

        <Card className="mef-animate-in mt-4">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Nutrition</p>
          </div>
          <h1 className={`${CVS_DISPLAY_FONT} mt-3 text-4xl leading-tight text-[#1B3A2D]`}>{FPA_LABEL}</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
            How meals actually land for you, and the fuel pattern your answers suggest.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-2xl bg-[#F5F0E4] px-4 py-2.5 text-sm text-[#1B3A2D]">
              <Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              About 7 minutes
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
              resultsHref={`${FPA_ROUTE}/results/${latestCompleted!.id}`}
              retakeAction={retakeFpaAction}
            />
          ) : (
            <BeginAssessmentForm action={beginFpaAction} label={ctaLabel} className="mt-6" />
          )}
        </Card>
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
