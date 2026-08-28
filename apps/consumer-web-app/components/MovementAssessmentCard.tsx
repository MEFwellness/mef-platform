import Link from 'next/link';
import type { Route } from 'next';
import { PersonStanding, CheckCircle2, Hourglass } from 'lucide-react';
import type { BodyAssessment } from '@mef/shared-types-contracts';
import { LockedCardButton } from '@/components/locked/LockedCardButton';
import { LockedBadge } from '@/components/locked/LockedBadge';
import { PROGRAM_PLAN_LOCK_MESSAGE } from '@/lib/locked-content/copy';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Home dashboard redesign — "image-backed card" treatment, opted into by
 * app/dashboard/page.tsx only (`variant="imageBacked"`); Today
 * (app/today/page.tsx) keeps the original plain white `card` variant
 * unchanged. No photo asset of a person mid-movement-capture exists in
 * this repo, so this is a CSS-only stand-in for one: a deep-green-to-
 * black diagonal gradient with a soft radial glow and a faint oversized
 * silhouette icon standing in for photographic depth, rather than
 * fabricating or sourcing a stock photo. Cream/white text throughout,
 * matching how real image-backed sections are lit elsewhere on the
 * redesigned dashboard (the hero, the Unlock Smarter Coaching panel).
 */
const IMAGE_BACKED =
  'relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0F241C] via-[#1B3A2D] to-[#2A4A3A] text-[#FAFAF8]';

type Variant = 'card' | 'imageBacked';

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
  variant = 'card',
  className = '',
  locked = false,
  lockMessage,
  lockReason,
  lockPlanHref,
}: {
  assessments: BodyAssessment[];
  variant?: Variant;
  className?: string;
  /**
   * True when checkAssessmentAccess('body-assessment') says she may not
   * start one. Since Build 2 (2026-08-27) that is her plan talking: the
   * camera capture is part of the 24 week program, and a coach assignment
   * can additionally open it for one member. Only ever meaningful for the
   * invite state below (no analyzed/submitted assessment exists yet) — a
   * member with any real history is always let through by
   * checkAssessmentAccess itself, so the analyzed/submitted branches above
   * never need to check this.
   */
  locked?: boolean;
  /** Root's note for this exact lock, built by lib/locked-content/copy.ts's lockNoteMessage. Required whenever `locked` is true; the fallback is the 24 week program sentence, which is what this particular card's lock always is. */
  lockMessage?: string | undefined;
  /** Which lock this is, for the paywall analytics event. */
  lockReason?: string | undefined;
  /** Set only for a lock she can act on herself. */
  lockPlanHref?: Route | undefined;
}) {
  const analyzed = assessments.find((a) => a.completed_at !== null);
  const submitted = assessments.find((a) => a.status !== 'in_progress');
  const imageBacked = variant === 'imageBacked';
  const shell = imageBacked ? IMAGE_BACKED : CARD;
  const labelTone = imageBacked ? 'text-[#FAFAF8]/70' : 'text-[#6B7A72]';
  const bodyTone = imageBacked ? 'text-[#FAFAF8]' : 'text-[#1B3A2D]';

  if (analyzed) {
    return (
      <section className={`${shell} relative overflow-hidden p-6 ${className}`}>
        {imageBacked && (
          <PersonStanding
            className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-white/10"
            strokeWidth={1}
            aria-hidden="true"
          />
        )}
        <div className={`relative flex items-center gap-2 ${labelTone}`}>
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Movement Assessment Complete
          </p>
        </div>
        <p className={`relative mt-3 text-sm leading-relaxed ${bodyTone}`}>
          Your personalized corrective exercise recommendations are now available.
        </p>
        <Link
          href={`/assessment/${analyzed.id}` as Route}
          className={`mef-press relative mt-3 inline-flex items-center text-sm font-medium underline underline-offset-2 ${bodyTone}`}
        >
          View your results
        </Link>
      </section>
    );
  }

  if (submitted) {
    return (
      <section className={`${shell} relative overflow-hidden p-6 ${className}`}>
        {imageBacked && (
          <Hourglass
            className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-white/10"
            strokeWidth={1}
            aria-hidden="true"
          />
        )}
        <div className={`relative flex items-center gap-2 ${labelTone}`}>
          <Hourglass className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">
            Movement Assessment Submitted
          </p>
        </div>
        <p className={`relative mt-3 text-sm leading-relaxed ${bodyTone}`}>
          Root is reviewing your posture and movement patterns. Your personalized corrective
          exercise recommendations will appear here soon.
        </p>
      </section>
    );
  }

  if (imageBacked) {
    const body = (
      <section
        className={`${shell} p-8 text-center sm:p-10 ${locked ? 'opacity-60 grayscale-[0.4]' : ''} ${className}`}
      >
        <div
          className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#F5B700]/15 blur-2xl"
          aria-hidden="true"
        />
        <PersonStanding
          className="pointer-events-none absolute -bottom-10 -left-10 h-56 w-56 text-white/[0.06]"
          strokeWidth={1}
          aria-hidden="true"
        />
        <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5B700]/20">
          <PersonStanding className="h-5 w-5 text-[#F5B700]" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h2 className="relative mt-5 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#FAFAF8] md:text-3xl">
          Guided Posture &amp; Movement Assessment
        </h2>
        <p className="relative mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#FAFAF8]/75">
          Build your personalized movement blueprint.
        </p>
        <p className="relative mt-4 text-xs font-medium uppercase tracking-wider text-[#FAFAF8]/60">
          Estimated time: 5–10 minutes
        </p>
        {!locked && (
          <Link
            href={'/assessment' as Route}
            className="mef-press relative mt-6 inline-flex items-center justify-center rounded-full bg-[#F5B700] px-7 py-3.5 text-sm font-semibold text-[#1B3A2D] shadow-[0_10px_24px_-6px_rgba(0,0,0,0.35)] transition hover:brightness-105"
          >
            Start Assessment
          </Link>
        )}
      </section>
    );

    if (locked) {
      return (
        <div className="relative">
          <LockedCardButton
            ariaLabel="Guided Posture and Movement Assessment, locked. Tap to hear from Root about it."
            analyticsFeature="body-assessment"
            message={lockMessage ?? PROGRAM_PLAN_LOCK_MESSAGE}
            lockReason={lockReason}
            planHref={lockPlanHref}
          >
            {body}
          </LockedCardButton>
          <LockedBadge />
        </div>
      );
    }
    return body;
  }

  const plainBody = (
    <section
      className={`${shell} relative overflow-hidden p-8 text-center sm:p-10 ${locked ? 'opacity-60 grayscale-[0.4]' : ''} ${className}`}
    >
      <div
        className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#C4A050]/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full bg-[#1B3A2D]/[0.06] blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5B700]/15">
        <PersonStanding className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="relative mt-5 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D] md:text-3xl">
        Guided Posture &amp; Movement Assessment
      </h2>
      <p className="relative mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#4F645A]">
        Build your personalized movement blueprint.
      </p>
      <p className="relative mt-4 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
        Estimated time: 5–10 minutes
      </p>
      {!locked && (
        <Link
          href={'/assessment' as Route}
          className="mef-press relative mt-6 inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
        >
          Start Assessment
        </Link>
      )}
    </section>
  );

  if (locked) {
    return (
      <div className="relative">
        <LockedCardButton
          ariaLabel="Guided Posture and Movement Assessment, locked. Tap to hear from Root about it."
          analyticsFeature="body-assessment"
          message={lockMessage ?? PROGRAM_PLAN_LOCK_MESSAGE}
          lockReason={lockReason}
          planHref={lockPlanHref}
        >
          {plainBody}
        </LockedCardButton>
        <LockedBadge />
      </div>
    );
  }
  return plainBody;
}
