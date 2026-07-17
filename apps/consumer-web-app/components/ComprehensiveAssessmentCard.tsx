import Link from 'next/link';
import type { Route } from 'next';
import { Compass, Sparkles } from 'lucide-react';
import type { BaselineAssessment } from '@/lib/onboarding/baseline';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Premium UX Milestone 4, part 6 — the daily check-in captures how a
 * member feels TODAY; the Comprehensive Assessment (the onboarding
 * baseline questionnaire, lib/onboarding/baseline.ts) is what lets Root
 * explain WHY. Stays prominent on Dashboard and Today — never buried in
 * Profile — for as long as `baseline` is null, then automatically swaps
 * to a compact real-data summary once one exists. No new data source:
 * `baseline` is read straight from the member's own onboarding submission.
 */
export function ComprehensiveAssessmentCard({
  baseline,
  className = '',
}: {
  baseline: BaselineAssessment | null;
  className?: string;
}) {
  if (!baseline) {
    return (
      <section
        className={`${CARD} relative overflow-hidden p-8 text-center sm:p-10 ${className}`}
      >
        <div
          className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#F5B700]/10"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full bg-[#1B3A2D]/[0.04]"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5B700]/15">
          <Compass className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h2 className="relative mt-5 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D] md:text-3xl">
          Unlock Your Personalized Wellness Roadmap
        </h2>
        <p className="relative mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#6B7A72]">
          Your daily check-in tells Root how you feel today. Your Comprehensive Assessment helps
          Root understand why — so it can personalize your coaching, recommendations, and future
          insights.
        </p>
        <p className="relative mt-4 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
          Estimated time: 8–10 minutes
        </p>
        <Link
          href={'/onboarding' as Route}
          className="relative mt-6 inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
        >
          Start Assessment
        </Link>
      </section>
    );
  }

  return (
    <section className={`${CARD} p-6 ${className}`}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Personalized Insights</p>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
        Your Comprehensive Assessment, completed {formatDate(baseline.localDate)}, is helping Root
        personalize your coaching, recommendations, and insights.
      </p>
      <Link
        href="/profile/baseline"
        className="mt-3 inline-flex items-center text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
      >
        Review your assessment
      </Link>
    </section>
  );
}
