/**
 * Primal Pattern results screen — foundation only. Displays the
 * already-computed, already-verified result (Polar / Variable /
 * Equatorial) and letter counts; nothing here recomputes a score. The
 * premium results experience (deeper educational content, coaching tie-
 * ins) is explicitly out of scope for this prompt and lands in a later
 * phase.
 *
 * The "For practitioner reference." line is the only attribution surface
 * this feature shows a member, kept intentionally small and placed at
 * the very bottom — the assessment itself is presented as a MEF Wellness
 * assessment throughout, never under any other name.
 */

import { redirect, notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getMyPrimalPatternResult } from '@/app/actions/primal-pattern';
import { hasActiveRole } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { BackButton } from '@/components/BackButton';
import { BottomNav } from '@/components/BottomNav';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const RESULT_COPY: Record<string, { label: string; description: string }> = {
  polar: {
    label: 'Polar',
    description:
      'Your answers lean toward a pattern that tends to feel best with more protein and fat, and comparatively fewer carbohydrates.',
  },
  variable: {
    label: 'Variable',
    description:
      'Your answers are fairly balanced between the two patterns, without a strong lean toward either one.',
  },
  equatorial: {
    label: 'Equatorial',
    description:
      'Your answers lean toward a pattern that tends to feel best with more carbohydrates, and comparatively less protein and fat.',
  },
};

export default async function PrimalPatternResultsPage({
  params,
}: {
  params: { assessmentId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [view, isCoach] = await Promise.all([
    getMyPrimalPatternResult(params.assessmentId),
    hasActiveRole(supabase, user.id, 'coach'),
  ]);

  if (!view) notFound();

  const { record, copy } = view;
  const resultCopy = record.result ? RESULT_COPY[record.result] : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/assessments/primal-pattern-diet-type" label="Back" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">{copy.displayTitle}</p>
        </div>

        <section className={`${CARD} mef-animate-in mt-3 p-7 text-center`}>
          <span className="inline-flex items-center rounded-full bg-[#F3F6F4] px-4 py-1.5 text-sm font-semibold text-[#1B3A2D]">
            {resultCopy?.label ?? 'Result unavailable'}
          </span>
          <p className="mt-4 text-sm leading-relaxed text-[#1B3A2D]">
            {resultCopy?.description ?? 'We could not determine a result for this assessment.'}
          </p>
        </section>

        <section className={`${CARD} mt-5 p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Your answers
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-[#F3F6F4] p-4 text-center">
              <p className="text-2xl font-semibold text-[#1B3A2D]">{record.aCount}</p>
              <p className="mt-1 text-xs text-[#6B7A72]">A answers</p>
            </div>
            <div className="rounded-2xl bg-[#F3F6F4] p-4 text-center">
              <p className="text-2xl font-semibold text-[#1B3A2D]">{record.bCount}</p>
              <p className="mt-1 text-xs text-[#6B7A72]">B answers</p>
            </div>
            <div className="rounded-2xl bg-[#F3F6F4] p-4 text-center">
              <p className="text-2xl font-semibold text-[#1B3A2D]">{record.bothCount}</p>
              <p className="mt-1 text-xs text-[#6B7A72]">Both selected</p>
            </div>
            <div className="rounded-2xl bg-[#F3F6F4] p-4 text-center">
              <p className="text-2xl font-semibold text-[#1B3A2D]">{record.skippedCount}</p>
              <p className="mt-1 text-xs text-[#6B7A72]">Skipped</p>
            </div>
          </div>
        </section>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-[#6B7A72]/70">
          {copy.practitionerFooter}
        </p>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
