/**
 * Large hero card for the premium Primal Pattern results dashboard.
 * Assessment title, member result, a short educational overview, and
 * completion date — the "signature experience" opening moment. All
 * fields come from the already-computed record (Prompt 1) plus static
 * copy; nothing here recomputes a score or invents a clinical claim.
 */

import { Sparkles } from 'lucide-react';
import { formatAssessmentDate } from '@/lib/assessments/presentation';
import type { PrimalPatternResult } from '@/lib/primal-pattern/types';

const RESULT_COPY: Record<PrimalPatternResult, { label: string; overview: string }> = {
  polar: {
    label: 'Polar',
    overview:
      'Your answers lean toward a pattern that tends to feel best with more protein and healthy fat, and comparatively fewer carbohydrates.',
  },
  variable: {
    label: 'Variable',
    overview:
      'Your answers are fairly balanced between the two patterns, without a strong lean toward either one.',
  },
  equatorial: {
    label: 'Equatorial',
    overview:
      'Your answers lean toward a pattern that tends to feel best with more carbohydrates, and comparatively less protein and fat.',
  },
};

export function HeroResultCard({
  displayTitle,
  result,
  completedAt,
}: {
  displayTitle: string;
  result: PrimalPatternResult | null;
  completedAt: string | null;
}) {
  const copy = result ? RESULT_COPY[result] : null;

  return (
    <section className="mef-animate-in relative overflow-hidden rounded-[36px] bg-gradient-to-br from-[#1B3A2D] to-[#12261D] p-8 text-center shadow-[0_16px_56px_-16px_rgba(27,58,45,0.55)] sm:p-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C9A227]/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[#F59E0B]/10 blur-3xl"
      />

      <div className="relative flex items-center justify-center gap-2 text-[#E9EFEA]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-[0.14em]">{displayTitle}</p>
      </div>

      <p className="relative mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-[#C9A227]">
        Your Result
      </p>
      <h1 className="relative mt-2 font-[family-name:var(--font-cormorant-garamond)] text-5xl leading-none text-white sm:text-6xl">
        {copy?.label ?? 'Unavailable'}
      </h1>

      <p className="relative mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-[#D8E2DC]">
        {copy?.overview ?? 'We could not determine a result for this assessment.'}
      </p>

      {completedAt && (
        <p className="relative mt-6 text-xs font-medium uppercase tracking-wider text-[#93A69A]">
          Completed {formatAssessmentDate(completedAt)}
        </p>
      )}
    </section>
  );
}
