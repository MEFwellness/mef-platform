'use client';

/**
 * Premium UX Milestone 4 (corrected) — shown exactly once, immediately
 * after a member's first-ever successful check-in
 * (app/checkin/CheckinForm.tsx redirects to `/dashboard?firstCheckin=1`
 * only on that specific transition). Introduces the Guided Posture &
 * Movement Assessment (the "Body Assessment" feature, app/assessment/*)
 * as the next step — NOT the Comprehensive Health Assessment, which is
 * now a later, secondary recommendation (see ComprehensiveAssessmentCard).
 * Dismissing strips the query param via router.replace so refreshing or
 * navigating back never re-triggers it.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { X, PersonStanding } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export function FirstCheckinTransition({
  firstName,
  hasMovementAssessment,
}: {
  firstName: string;
  hasMovementAssessment: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  // Mount already-open, then flip to visible on the next frame so the
  // entrance is a real transition (opacity/scale) rather than appearing
  // instantly — the same "no abrupt UI changes" discipline as the rest of
  // this milestone.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useBodyScrollLock(true);

  function dismiss() {
    setVisible(false);
    window.setTimeout(() => {
      router.replace('/dashboard' as Route);
    }, 200);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A2D]/30 p-5 backdrop-blur-sm transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to your first check-in"
        onClick={(event) => event.stopPropagation()}
        className={`relative w-full max-w-md overflow-hidden rounded-[28px] bg-white p-8 text-center shadow-[0_24px_64px_-12px_rgba(27,58,45,0.45)] transition-all duration-200 ${
          visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.97] opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-[#1B3A2D]/40 transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D]"
        >
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </button>

        <div
          className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#F5B700]/10"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5B700]/15">
          <PersonStanding
            className="h-5 w-5 text-[#854D0E]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>

        <h2 className="relative mt-5 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
          Well done, {firstName}
        </h2>
        {!hasMovementAssessment && (
          <p className="relative mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#6B7A72]">
            Now let&apos;s understand how your body moves.
          </p>
        )}
        <p className="relative mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-[#6B7A72]">
          Your Daily Check-In tells us how you feel.
        </p>
        {!hasMovementAssessment && (
          <p className="relative mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-[#6B7A72]">
            Your Guided Posture &amp; Movement Assessment helps us identify movement imbalances,
            posture patterns, and areas that may be contributing to discomfort or poor performance —
            the foundation for your personalized corrective exercise program.
          </p>
        )}

        {hasMovementAssessment ? (
          <button
            type="button"
            onClick={dismiss}
            className="relative mt-6 inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
          >
            See my dashboard
          </button>
        ) : (
          <div className="relative mt-6 flex flex-col items-center gap-3">
            <Link
              href={'/assessment' as Route}
              className="inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
            >
              Start Assessment
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="text-xs font-medium text-[#6B7A72] underline underline-offset-2"
            >
              Maybe later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
