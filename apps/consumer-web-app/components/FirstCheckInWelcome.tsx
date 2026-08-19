import type { Route } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { IntroReveal } from '@/components/IntroReveal';
import { IntroRevealFollowUp } from '@/components/IntroRevealFollowUp';

const CARD = 'mef-card'; // Screen Layout System (Prompt 2): standardized card recipe, app/globals.css
const TITLE = "Let's get started";
const BODY_LINES = [
  'Root builds everything here (your Daily Brief, your Wellness Index, recovery trends, and daily coaching) from your check-ins.',
  'Complete your first one and this page starts to come alive.',
];

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
 *
 * Home dashboard redesign: the hero above this card already greets the
 * member by name ("Good evening, {firstName}"), so this headline is
 * forward-looking instead of a second "Welcome, {firstName}" — one
 * greeting per screen, not two. No longer takes a firstName prop since
 * nothing here uses it anymore.
 */
export function FirstCheckInWelcome() {
  return (
    <section className={`${CARD} mef-animate-in relative overflow-hidden p-6 text-center sm:p-7`}>
      <div
        className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-[#C4A050]/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full bg-[#1B3A2D]/[0.06] blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F5B700]/15">
        <Sparkles className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
      </div>
      <div className="relative">
        <IntroReveal
          title={TITLE}
          titleClassName="font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D] sm:text-3xl"
          lines={BODY_LINES}
          lineClassName="mx-auto max-w-sm text-sm leading-relaxed text-[#6B7A72] sm:text-[15px]"
          storageKey="first-checkin-welcome"
        />
      </div>
      <IntroRevealFollowUp title={TITLE} lineCount={BODY_LINES.length} storageKey="first-checkin-welcome" className="relative mt-4">
        <Link
          href={'/checkin' as Route}
          className="mef-press inline-flex items-center justify-center rounded-full bg-[#1B3A2D] px-7 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)] transition hover:brightness-110"
        >
          Complete your first check-in
        </Link>
        <p className="mt-2.5 text-xs text-[#6B7A72]">Takes about a minute.</p>
      </IntroRevealFollowUp>
    </section>
  );
}
