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
 * Premium UX Milestone 4 (corrected) — the Comprehensive Health Assessment
 * (the onboarding baseline questionnaire, lib/onboarding/baseline.ts) is
 * now a SECONDARY recommendation, surfaced only after the member has
 * completed the Guided Posture & Movement Assessment
 * (MovementAssessmentCard.tsx, the actual next step after a first Daily
 * Check-In). It never disappears once a baseline exists — that compact
 * "Personalized Insights" summary still always shows — it just no longer
 * competes with the movement assessment's own big hero pitch before that
 * one is done.
 */
export function ComprehensiveAssessmentCard({
  baseline,
  movementCompleted,
  className = '',
}: {
  baseline: BaselineAssessment | null;
  movementCompleted: boolean;
  className?: string;
}) {
  if (baseline) {
    return (
      <section className={`${CARD} p-6 ${className}`}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Personalized Insights</p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
          Your Comprehensive Health Assessment, completed {formatDate(baseline.localDate)}, is
          helping Root personalize your coaching, recommendations, and insights.
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

  // Not shown at all until the movement assessment is done — the movement
  // assessment's own hero card is the one prominent CTA right after a
  // member's first check-in; this only becomes the "recommended next"
  // nudge once that's out of the way.
  if (!movementCompleted) return null;

  return (
    <section className={`${CARD} p-6 ${className}`}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Recommended Next</p>
      </div>
      <h3 className="mt-2 text-lg font-semibold text-[#1B3A2D]">Comprehensive Health Assessment</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
        A deeper look at your health history and lifestyle so Root can understand why you feel the
        way you do, day to day — not just what your movement assessment shows.
      </p>
      <Link
        href={'/onboarding' as Route}
        className="mt-3 inline-flex items-center text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
      >
        Start Comprehensive Assessment
      </Link>
    </section>
  );
}
