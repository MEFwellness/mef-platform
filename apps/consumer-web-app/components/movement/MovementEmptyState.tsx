import type { Route } from 'next';
import Link from 'next/link';
import { Activity } from 'lucide-react';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Shown before a member's first-ever check-in, same gating condition as
 * FirstCheckInWelcome on Dashboard/Today — Movement Intelligence has no
 * real pain/stress/sleep/energy signal to personalize a session from yet,
 * so it never auto-generates one against a blank slate. One calm welcome
 * moment with a single CTA, same "premium empty state" pattern as every
 * other pre-data screen in this app.
 */
export function MovementEmptyState({ firstName }: { firstName: string }) {
  return (
    <section className={`${CARD} mef-animate-in relative overflow-hidden p-8 text-center sm:p-10`}>
      <div
        className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#F5B700]/10"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full bg-[#1B3A2D]/[0.04]"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5B700]/15">
        <Activity className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="relative mt-5 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
        Your movement, intelligently designed
      </h2>
      <p className="relative mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#6B7A72]">
        {firstName}, Root builds each session from your check-ins, recovery, and assessment results
        — not a fixed workout plan. Complete your first check-in and your first personalized session
        appears here.
      </p>
      <Link
        href={'/checkin' as Route}
        className="relative mt-6 inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
      >
        Complete your first check-in
      </Link>
      <p className="relative mt-4 text-xs text-[#6B7A72]">Takes about a minute.</p>
    </section>
  );
}
