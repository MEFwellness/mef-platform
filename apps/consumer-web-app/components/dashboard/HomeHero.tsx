/**
 * Home dashboard redesign — the full-bleed hero replacing the old plain
 * header + white RootScoreCard at the top of the page. Same two states
 * RootScoreCard.tsx used to render (a real score, or the "building your
 * baseline" premium empty state before one exists) and the exact same
 * copy for both — this changes where and how that copy is presented, not
 * what it says. RootScoreCard.tsx itself is now unused (it was
 * dashboard-only) and has been removed.
 *
 * The photo (public/images/home-hero.jpg) is framed with object-position
 * biased toward the lower-right so the tree line stays in frame rather
 * than empty sky, and a two-layer dark gradient (stronger left/top) keeps
 * the cream header and score text legible regardless of where the photo's
 * own light source falls at a given viewport width.
 */

import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { AvatarLink } from '@/components/AvatarLink';
import { RootScoreCountUp } from './RootScoreCountUp';

const CONFIDENCE_LABEL: Record<RootScoreSnapshot['root_confidence_level'], string> = {
  building: 'Building your baseline',
  low: 'Low confidence',
  moderate: 'Moderate confidence',
  high: 'High confidence',
};

const TREND_TINT: Record<'good' | 'attention' | 'poor', string> = {
  good: 'text-emerald-300',
  attention: 'text-amber-300',
  poor: 'text-red-300',
};

function ChangePill({ change }: { change: number | null }) {
  if (change === null) return null;
  const status = change > 0 ? 'good' : change < 0 ? 'poor' : 'attention';
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur-sm ${TREND_TINT[status]}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      {change === 0
        ? 'Steady'
        : `${Math.abs(change)} pt${Math.abs(change) === 1 ? '' : 's'} ${change > 0 ? 'up' : 'down'}`}
    </span>
  );
}

function HeroChrome({ firstName, children }: { firstName: string; children: React.ReactNode }) {
  return (
    <section className="relative w-full overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/images/home-hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: '75% 55%' }}
        />
        {/* Stronger on the left and top — a diagonal wash, not a flat tint,
            so the photo still reads as a photo everywhere text isn't. */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/40 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/45" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[440px] w-full max-w-md flex-col px-5 pb-10 pt-8 sm:px-6 sm:pt-10 md:min-h-[500px] md:max-w-5xl md:px-10 md:pb-14 md:pl-28">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3 rounded-2xl bg-black/25 py-1.5 pl-1.5 pr-3 backdrop-blur-sm">
            <Image
              src="/images/rooted-reset-logo.png"
              alt="Rooted Reset"
              width={36}
              height={36}
              style={{ objectFit: 'contain', borderRadius: '8px', flexShrink: 0 }}
            />
            <div className="leading-tight">
              <span className="block font-[family-name:var(--font-cormorant-garamond)] text-lg tracking-wide text-[#FAFAF8]">
                Rooted Reset
              </span>
              <span className="block text-[11px] font-medium uppercase tracking-wider text-[#FAFAF8]/70">
                by MEF Wellness
              </span>
            </div>
          </div>
          <div className="rounded-full bg-black/25 p-1 backdrop-blur-sm">
            <AvatarLink firstName={firstName} />
          </div>
        </header>

        <div className="mt-auto pt-10">{children}</div>
      </div>
    </section>
  );
}

export function HomeHero({
  firstName,
  greetingWord,
  snapshot,
  hasCheckins,
}: {
  firstName: string;
  greetingWord: string;
  snapshot: RootScoreSnapshot | null;
  /**
   * Before a member's first completed check-in, FirstCheckInWelcome (see
   * app/dashboard/page.tsx) carries the whole welcome moment below the
   * hero — the hero itself shows only the greeting, not a "building your
   * score" message that would compete with it. Matches the original
   * page's own gating: RootScoreCard never rendered pre-first-checkin
   * either.
   */
  hasCheckins: boolean;
}) {
  if (!hasCheckins) {
    return (
      <HeroChrome firstName={firstName}>
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#FAFAF8] md:text-[2.75rem]">
          {greetingWord}, {firstName}
        </h1>
      </HeroChrome>
    );
  }

  if (!snapshot || snapshot.root_score === null) {
    return (
      <HeroChrome firstName={firstName}>
        <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#FAFAF8] md:text-[2.75rem]">
          {greetingWord}, {firstName}
        </h1>
        <h2 className="mt-5 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#FAFAF8]">
          Building your Root Score
        </h2>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#FAFAF8]/85">
          {snapshot?.explanation_summary ||
            'Complete a few check-ins and MEF Wellness will begin calculating your Root Score from real patterns — never a guess.'}
        </p>
        <Link
          href="/root-score"
          className="mef-press mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#FAFAF8] underline underline-offset-4"
        >
          See what strengthens your score
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </HeroChrome>
    );
  }

  return (
    <HeroChrome firstName={firstName}>
      <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#FAFAF8] md:text-[2.75rem]">
        {greetingWord}, {firstName}
      </h1>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="flex items-baseline gap-1">
          <RootScoreCountUp
            value={snapshot.root_score}
            className="font-[family-name:var(--font-cormorant-garamond)] text-6xl leading-none text-[#FAFAF8]"
          />
          <span className="text-lg font-medium text-[#FAFAF8]/60">/100</span>
        </div>
        <ChangePill change={snapshot.root_score_change} />
      </div>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#F5B700]">
        {CONFIDENCE_LABEL[snapshot.root_confidence_level]}
      </p>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#FAFAF8]/85">
        {snapshot.explanation_summary}
      </p>

      <Link
        href="/root-score"
        className="mef-press mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#FAFAF8] underline underline-offset-4"
      >
        See your full Root Score
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </HeroChrome>
  );
}
