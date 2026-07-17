import Link from 'next/link';
import type { Route } from 'next';
import { PersonStanding, CheckCircle2, Hourglass } from 'lucide-react';
import type { BodyAssessment } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Premium UX Milestone 4 (corrected) — the Guided Posture & Movement
 * Assessment (app/assessment/*, "Body Assessment" in code) is the next
 * major step after a member's first Daily Check-In, NOT the Comprehensive
 * Health Assessment (see ComprehensiveAssessmentCard.tsx, now demoted to a
 * secondary recommendation surfaced only after this one is done). Stays
 * prominent on Dashboard and Today until the member has completed at
 * least one guided capture, then swaps to a real, data-backed status —
 * distinguishing "submitted, still being analyzed" from "analyzed, your
 * recommendations are ready" rather than claiming findings exist before
 * they do (`completed_at` is only set once analysis actually finishes —
 * see app/actions/body-assessment.ts's analyzeAssessment path).
 */
export function MovementAssessmentCard({
  assessments,
  className = '',
}: {
  assessments: BodyAssessment[];
  className?: string;
}) {
  const analyzed = assessments.find((a) => a.completed_at !== null);
  const submitted = assessments.find((a) => a.status !== 'in_progress');

  if (analyzed) {
    return (
      <section className={`${CARD} p-6 ${className}`}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Movement Assessment Complete
          </p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
          Your personalized corrective exercise recommendations are now available.
        </p>
        <Link
          href={`/assessment/${analyzed.id}` as Route}
          className="mt-3 inline-flex items-center text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
        >
          View your results
        </Link>
      </section>
    );
  }

  if (submitted) {
    return (
      <section className={`${CARD} p-6 ${className}`}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Hourglass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Movement Assessment Submitted
          </p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
          Root is reviewing your posture and movement patterns — your personalized corrective
          exercise recommendations will appear here soon.
        </p>
      </section>
    );
  }

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
        <PersonStanding className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="relative mt-5 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D] md:text-3xl">
        Guided Posture &amp; Movement Assessment
      </h2>
      <p className="relative mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#6B7A72]">
        Build your personalized movement blueprint.
      </p>
      <p className="relative mt-4 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
        Estimated time: 5–10 minutes
      </p>
      <Link
        href={'/assessment' as Route}
        className="relative mt-6 inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
      >
        Start Assessment
      </Link>
    </section>
  );
}
