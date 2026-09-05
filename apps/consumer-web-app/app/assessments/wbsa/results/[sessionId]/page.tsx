/**
 * WBSA result screen — uses the existing shared result architecture's
 * primitives (PriorityBadge-style calm labeling, the same card shell every
 * other assessment's results page uses) with WBSA-specific band language
 * per the content brief, computed via lib/wbsa/results.ts directly from
 * the completed session's own findings (Unified Runtime, unmodified).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { getSessionById } from '@/lib/assessment-runtime';
import { getUnifiedAssessmentSections } from '@/lib/assessment-foundation/repository';
import { listRegistryEntriesForMember } from '@/lib/registry/data';
import { suggestAssessmentsFromFindings } from '@/lib/assessment-registry/findingRecommendations';
import { getAssessmentRegistryEntry } from '@/lib/assessment-registry/registry';
import {
  computeWbsaSystemBreakdown,
  hasAnySkippedQuestion,
  rankSystemsNeedingAttention,
  systemsWithLowerPattern,
} from '@/lib/wbsa/results';
import {
  WBSA_BAND_DESCRIPTION,
  WBSA_BAND_LABEL,
  WBSA_RED_FLAG_MEMBER_MESSAGE,
  WBSA_RESULT_INTRO,
  WBSA_SAFETY_STATEMENT,
  WBSA_SKIPPED_QUESTIONS_NOTE,
} from '@/lib/wbsa/copy';
import { BackButton } from '@/components/BackButton';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { KeyFindingReveal } from '@/components/closing-screen/KeyFindingReveal';
import { getCachedUser } from '@/lib/supabase/currentUser';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const BAND_BADGE_CLASS: Record<string, string> = {
  needs_context: 'bg-orange-50 text-orange-700',
  watch: 'bg-amber-50 text-amber-700',
  lower: 'bg-emerald-50 text-emerald-700',
};

export default async function WbsaResultsPage({ params }: { params: { sessionId: string } }) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const [session, isCoach] = await Promise.all([
    getSessionById(supabase, params.sessionId),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  if (!session || session.memberId !== user.id || session.status !== 'completed') {
    redirect('/assessments/wbsa');
  }

  const sections = await getUnifiedAssessmentSections(supabase, session.assessmentId);
  const breakdown = computeWbsaSystemBreakdown(
    sections,
    session.visibleQuestions,
    session.answers,
    session.findings
  );
  const needsAttention = rankSystemsNeedingAttention(breakdown);
  const lowerPattern = systemsWithLowerPattern(breakdown);
  const skipped = hasAnySkippedQuestion(breakdown);
  const hasSafetyFlag = session.findings.some((f) => f.severity === 'significant');

  const activeFindings = await listRegistryEntriesForMember(supabase, user.id, {
    statusFilter: ['active'],
  });
  const suggestions = suggestAssessmentsFromFindings(activeFindings, {
    excludeAssessmentKeys: ['wbsa'],
  }).slice(0, 2);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref={'/assessments/wbsa' as Route} label="Back" forceFallback />

        <section className={`${CARD} mef-animate-in mt-4 p-7 text-center`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Assessment complete
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
            Your Whole-Body Systems results
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{WBSA_RESULT_INTRO}</p>
        </section>

        {hasSafetyFlag && (
          <section className="mef-animate-in mt-4 flex items-start gap-3 rounded-[28px] bg-[#FDEEEE] p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#9B4040]" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-[#9B4040]">{WBSA_RED_FLAG_MEMBER_MESSAGE.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#9B4040]">{WBSA_RED_FLAG_MEMBER_MESSAGE.body}</p>
            </div>
          </section>
        )}

        {/* Progressive Reveal Engine (Prompt 3, requirement 6): the actual findings build up together, one quiet beat after the hero settles, rather than dumping instantly alongside it — first-time-only, instant on every revisit. */}
        <KeyFindingReveal storageKey={`wbsa-close:${session.id}`} thinkingText="Looking at your answers...">
          {needsAttention.length > 0 && (
            <section className={`${CARD} mef-animate-in mt-4 p-6`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Areas with more reported patterns
              </p>
              <ul className="mt-3 space-y-3">
                {needsAttention.map((row) => (
                  <li key={row.sectionId} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[#1B3A2D]">{row.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">
                        {WBSA_BAND_DESCRIPTION[row.band]}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${BAND_BADGE_CLASS[row.band]}`}>
                      {WBSA_BAND_LABEL[row.band]}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {lowerPattern.length > 0 && (
            <section className={`${CARD} mef-animate-in mt-4 p-6`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Areas showing fewer concerns
              </p>
              <ul className="mt-3 space-y-2">
                {lowerPattern.map((row) => (
                  <li key={row.sectionId} className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[#1B3A2D]">{row.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${BAND_BADGE_CLASS.lower}`}>
                      {WBSA_BAND_LABEL.lower}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {skipped && (
            <p className="mt-4 px-1 text-center text-xs leading-relaxed text-[#6B7A72]">
              {WBSA_SKIPPED_QUESTIONS_NOTE}
            </p>
          )}

          {suggestions.length > 0 && (
            <section className={`${CARD} mef-animate-in mt-4 p-6`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                Worth exploring next
              </p>
              <ul className="mt-3 space-y-3">
                {suggestions.map((suggestion) => {
                  const entry = getAssessmentRegistryEntry(suggestion.assessmentKey);
                  return (
                    <li key={suggestion.assessmentKey}>
                      <Link
                        href={entry.route as Route}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#1B3A2D]/10 px-4 py-3 text-sm text-[#1B3A2D] transition hover:bg-[#FAFAF8]"
                      >
                        <span>
                          <span className="font-medium">{entry.displayName}</span>
                          <span className="mt-0.5 block text-xs text-[#6B7A72]">{suggestion.reason}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </KeyFindingReveal>

        <section className="mt-6 flex items-start gap-3 px-1">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-xs leading-relaxed text-[#6B7A72]">{WBSA_SAFETY_STATEMENT}</p>
        </section>

        <Link
          href={'/dashboard' as Route}
          className="mt-6 block rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
        >
          Back to Home
        </Link>
      </main>

      <MemberBottomNav isCoach={isCoach} />
    </div>
  );
}
