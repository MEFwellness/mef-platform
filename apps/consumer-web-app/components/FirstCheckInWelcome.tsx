import type { Route } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Premium UX Milestone 2: replaces the pre-first-check-in Dashboard and
 * Today from a wall of "Not logged yet" / "Not enough data" cards (empty
 * trackers, an empty trend chart, an empty wellness index, an empty
 * lesson) with one calm welcome moment — the same component on both
 * pages ("do not duplicate components") since it's the same member state
 * either way: Root has nothing personalized to show yet because there's
 * no check-in to build from.
 *
 * Gated by the host page on `recentCheckins.length === 0` — every check-in
 * a member has ever made, not merely a recent-days window, so this is
 * true only for a member who has genuinely never completed one.
 */
export function FirstCheckInWelcome({ firstName }: { firstName: string }) {
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
        <Sparkles className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="relative mt-5 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-4xl">
        Welcome, {firstName}
      </h2>
      <p className="relative mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#6B7A72]">
        Root builds everything here — your Daily Brief, your Wellness Index, recovery trends, and
        daily coaching — from your check-ins. Complete your first one and this page starts to come
        alive.
      </p>
      <Link
        href={'/checkin' as Route}
        className="relative mt-6 inline-flex items-center justify-center rounded-full bg-[#F5B700] px-7 py-3.5 text-sm font-semibold text-[#1B3A2D] shadow-[0_10px_24px_-6px_rgba(245,183,0,0.55)] transition hover:brightness-95"
      >
        Complete your first check-in
      </Link>
      <p className="relative mt-4 text-xs text-[#6B7A72]">Takes about a minute.</p>
    </section>
  );
}
