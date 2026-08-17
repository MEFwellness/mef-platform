/**
 * Core Values Snapshot overview — mirrors app/assessments/wbsa/page.tsx's
 * structure (same Unified Adaptive Assessment Foundation/Runtime reads,
 * same access-check-before-runtime ordering), CVS design tokens instead of
 * WBSA's.
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
import { findInProgressSession } from '@/lib/assessment-runtime';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { CVS_KEY } from '@/lib/core-values-snapshot/constants';
import { CVS_DISPLAY_FONT, CVS_PAGE_BG } from '@/components/core-values-snapshot/theme';
import { CenterStage, Card } from '@/components/layout';

export default async function CoreValuesSnapshotOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, access] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    checkAssessmentAccess(supabase, user.id, CVS_KEY),
  ]);

  if (!access.allowed) {
    return (
      <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
        <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
          <BackButton fallbackHref="/dashboard" label="Back" forceFallback />
          <CenterStage>
            <Card className="mef-animate-in text-center">
              <h1 className={`${CVS_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}>Core Values Snapshot</h1>
              <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{describeLockReason(access.reason)}</p>
              <Link
                href={'/dashboard' as Route}
                className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
              >
                Back to Dashboard
              </Link>
            </Card>
          </CenterStage>
        </main>
        <MemberBottomNav isCoach={isCoach} />
      </div>
    );
  }

  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, CVS_KEY);
  if (!definition) redirect('/dashboard');

  const [questions, draftSession] = await Promise.all([
    getUnifiedAssessmentQuestions(supabase, definition.id),
    findInProgressSession(supabase, user.id, definition.id),
  ]);

  const ctaLabel = draftSession ? 'Resume' : "Let's begin";

  return (
    <div className={`${CVS_PAGE_BG} font-[family-name:var(--font-dm-sans)]`}>
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back to Dashboard" forceFallback />

        <Card className="mef-animate-in mt-4">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Free with Root</p>
          </div>
          <h1 className={`${CVS_DISPLAY_FONT} mt-3 text-4xl leading-tight text-[#1B3A2D]`}>Core Values Snapshot</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
            Before we talk about your health, I want to know what you&apos;re protecting.
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

          <Link
            href={'/assessments/core-values-snapshot/take' as Route}
            className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
          >
            {ctaLabel}
          </Link>
        </Card>
      </main>
      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
