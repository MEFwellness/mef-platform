/**
 * WBSA welcome/overview screen — mirrors app/assessments/[questionnaireId]
 * /page.tsx's structure exactly, but reads through the Unified Adaptive
 * Assessment Foundation/Runtime (lib/assessment-foundation,
 * lib/assessment-runtime) instead of the generic questionnaire engine,
 * since WBSA's content lives in unified_assessment_* tables, not
 * wellness_assessments.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { Clock3, ListChecks, ShieldCheck, Sparkles } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { describeLockReason } from '@/lib/assessment-registry/status';
import { getAssessmentRegistryEntry } from '@/lib/assessment-registry/registry';
import {
  getUnifiedAssessmentDefinitionByKey,
  getUnifiedAssessmentQuestions,
  getUnifiedAssessmentSections,
} from '@/lib/assessment-foundation/repository';
import { findInProgressSession } from '@/lib/assessment-runtime';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';
import { WBSA_INTRO_COPY, WBSA_SAFETY_STATEMENT, WBSA_DISPLAY_TITLE } from '@/lib/wbsa/copy';
import { WBSA_KEY } from '@/lib/wbsa/constants';
import { CenterStage, Card } from '@/components/layout';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function WbsaOverviewPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, access] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    checkAssessmentAccess(supabase, user.id, WBSA_KEY),
  ]);

  if (!access.allowed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
        <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
          <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />

          <CenterStage>
            <Card className="mef-animate-in text-center">
              <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
                {WBSA_DISPLAY_TITLE}
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

        <BottomNav isCoach={isCoach} />
      </div>
    );
  }

  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, WBSA_KEY);
  if (!definition) redirect('/questionnaires');

  const [sections, questions, draftSession] = await Promise.all([
    getUnifiedAssessmentSections(supabase, definition.id),
    getUnifiedAssessmentQuestions(supabase, definition.id),
    findInProgressSession(supabase, user.id, definition.id),
  ]);

  const registryEntry = getAssessmentRegistryEntry(WBSA_KEY);
  const { data: latestCompletedRow } = await supabase
    .from('assessment_attempts')
    .select('source_id, completed_at')
    .eq('member_id', user.id)
    .eq('assessment_definition_id', registryEntry.databaseId)
    .eq('source_table', 'unified_assessment_sessions')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const totalQuestions = questions.filter((q) => q.active).length;
  const ctaLabel = draftSession ? 'Resume assessment' : 'Begin assessment';
  const ctaHref = '/assessments/wbsa/take' as Route;
  const justSaved = searchParams.saved === '1' && draftSession !== null;
  const answeredCount = draftSession?.progress.answered ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />

        {!justSaved && (
          <Card className="mef-animate-in mt-4">
            <div className="flex items-center gap-2 text-[#6B7A72]">
              <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider">Whole-Body Systems</p>
            </div>
            <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D]">
              {WBSA_DISPLAY_TITLE}
            </h1>
            {WBSA_INTRO_COPY.body.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
                {paragraph}
              </p>
            ))}

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-2xl bg-[#F3F6F4] px-4 py-2.5 text-sm text-[#1B3A2D]">
                <Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                About 20 minutes
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-[#F3F6F4] px-4 py-2.5 text-sm text-[#1B3A2D]">
                <ListChecks className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {sections.length} sections
              </div>
            </div>

            {draftSession && (
              <p className="mt-4 text-sm text-[#1B3A2D]">
                {answeredCount} of {totalQuestions} questions completed, pick up right where you left off.
              </p>
            )}

            <Link
              href={ctaHref}
              className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              {ctaLabel}
            </Link>

            <p className="mt-3 text-center text-xs text-[#6B7A72]">
              {WBSA_INTRO_COPY.structureNote}
            </p>
          </Card>
        )}

        {justSaved && (
          <CenterStage>
            <Card className="mef-animate-in text-center">
              <p className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
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
            </Card>
          </CenterStage>
        )}

        {latestCompletedRow && (
          <Card
            as={Link}
            href={`/assessments/wbsa/results/${latestCompletedRow.source_id}` as Route}
            lift
            className="mef-animate-in mt-5 flex items-center justify-between gap-4 transition hover:bg-[#FAFAF8]"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Your last assessment
              </p>
              <p className="mt-1 text-sm text-[#1B3A2D]">
                {formatDate(latestCompletedRow.completed_at as string)}
              </p>
            </div>
          </Card>
        )}

        <section className="mt-6 flex items-start gap-3 px-1">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-[#6B7A72]">{WBSA_SAFETY_STATEMENT}</p>
        </section>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
