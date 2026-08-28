/**
 * Home dashboard redesign — the full-bleed hero replacing the old plain
 * header + white RootScoreCard at the top of the page. Same two states
 * RootScoreCard.tsx used to render (a real score, or the "building your
 * baseline" premium empty state before one exists) and the exact same
 * copy for both — this changes where and how that copy is presented, not
 * what it says. RootScoreCard.tsx itself is now unused (it was
 * dashboard-only) and has been removed.
 *
 * The photo switches with time of day — public/images/home-hero-day.jpg
 * for morning/afternoon, public/images/home-hero-evening.jpg for evening —
 * on the exact same hour boundary lib/feed/timeContext.ts's greetingForHour
 * already uses for "Good morning"/"Good afternoon"/"Good evening", via the
 * greetingWord this component already receives (see heroImageForGreeting
 * below), so the two can never drift out of sync. Both are framed with the
 * same object-position biased toward the lower-right, and the same
 * two-layer dark gradient (stronger left/top) keeps the cream header and
 * score text legible regardless of which photo or light source is showing.
 */

import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { AvatarLink } from '@/components/AvatarLink';
import { Breathe } from '@/components/motion/Breathe';
import { heroOverlayForGreeting } from '@/lib/dashboard/timeOfDayPalette';
import { greetingHeadline } from '@/lib/profile/greeting';
import { RootScoreCountUp } from './RootScoreCountUp';
import { HeroAmbientGlow } from './HeroAmbientGlow';

/**
 * Trust cleanup, 2026-08-17: Home no longer prints a confidence label
 * beside the Root Score. It read "HIGH CONFIDENCE" on the first screen
 * after login while all five domains underneath it read "Building", because
 * the roll-up's history term counts how many times the score has been
 * calculated (a daily cron, whether or not the member logs anything), not
 * how much of her evidence exists. lib/scoring/confidence.ts still runs and
 * `snapshot.root_confidence_level` is still stored and still read by
 * everything that isn't a member's screen; it is the *claim* that is gone,
 * so that nothing tells her how sure we are until that number means it.
 *
 * The one state still worth saying out loud is the baseline state, and it
 * says only that: no confidence level, no ranking.
 */
const BASELINE_NOTE = 'Still building your baseline';

const TREND_TINT: Record<'good' | 'attention' | 'poor', string> = {
  good: 'text-emerald-300',
  attention: 'text-amber-300',
  poor: 'text-red-300',
};

const HERO_IMAGE_DAY = '/images/home-hero-day.jpg';
const HERO_IMAGE_EVENING = '/images/home-hero-evening.jpg';

/** Same "Good morning" / "Good afternoon" / "Good evening" boundary as lib/feed/timeContext.ts's greetingForHour — reuses the already-computed word instead of recomputing the hour, so the image can't disagree with the greeting. */
function heroImageForGreeting(greetingWord: string): string {
  return greetingWord === 'Good evening' ? HERO_IMAGE_EVENING : HERO_IMAGE_DAY;
}

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

function HeroChrome({
  firstName,
  heroImage,
  greetingWord,
  compact = false,
  children,
}: {
  firstName: string | null;
  heroImage: string;
  greetingWord: string;
  /**
   * Before a member's first check-in, the hero has only a greeting to
   * show — FirstCheckInWelcome (app/dashboard/page.tsx) carries the rest
   * of the welcome moment right below it. A hero sized for a full score
   * display would push that card's "Complete your first check-in" CTA
   * below the fold, so this state uses a much shorter band instead.
   */
  compact?: boolean;
  children: React.ReactNode;
}) {
  // Dashboard Evolution (Prompt 5), requirement 2: the overlay tint
  // shifts a few percentage points warmer/cooler with time of day —
  // still the same two-layer legibility wash, keyed off the identical
  // greetingWord the hero image already switches on, so the two can
  // never disagree. See lib/dashboard/timeOfDayPalette.ts.
  const overlay = heroOverlayForGreeting(greetingWord as Parameters<typeof heroOverlayForGreeting>[0]);

  return (
    <section className="relative w-full overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: '75% 55%' }}
        />
        {/* Stronger on the left and top — a diagonal wash, not a flat tint,
            so the photo still reads as a photo everywhere text isn't. */}
        <div className={`absolute inset-0 ${overlay.diagonal}`} />
        <div className={`absolute inset-0 ${overlay.vertical}`} />
        {/* Requirement 4 (Ambient Motion): a barely-perceptible warm glow
            that slowly drifts — the hero's one piece of "subtle life,"
            gated behind the low-power fallback inside the component
            itself. */}
        <HeroAmbientGlow />
      </div>

      {/* `relative` (no z-index) is enough to paint this above the
          absolute image/gradient layers above — both are positioned
          elements, so plain DOM order (this div comes after them) already
          puts it on top; a z-index isn't needed for that. It matters that
          one ISN'T added here: any z-index would make this div establish
          its own stacking context, which would trap AvatarLink's
          ProfileSheet (a fixed, deeply-nested descendant) inside it —
          confirmed by an actual regression where the bottom nav and the
          floating chat button painted on top of the (correctly
          positioned) profile sheet instead of under it, because the
          sheet's z-50 was only ever being compared against other things
          inside this div's stacking context, never against the nav's
          z-20 at the page's root level. */}
      <div
        className={`relative mx-auto flex w-full max-w-md flex-col px-5 sm:px-6 md:max-w-5xl md:px-10 md:pl-28 ${
          compact
            ? 'min-h-[32vh] pb-6 pt-7 sm:pt-8 md:min-h-[250px] md:pb-8'
            : 'min-h-[440px] pb-10 pt-8 sm:pt-10 md:min-h-[500px] md:pb-14'
        }`}
      >
        <header className="flex items-center justify-between">
          {/* Solid tint only — no backdrop-blur here. backdrop-filter (like
              transform/filter) creates a new containing block for
              position:fixed descendants, so with it, AvatarLink's
              ProfileSheet (a fixed bottom sheet) would size and position
              itself against this small header chip instead of the
              viewport, then get clipped by this section's overflow-hidden.
              Confirmed by that exact regression — see git history. A plain
              semi-transparent tint gives the same corner legibility
              against the photo without creating a containing block. */}
          <div className="flex items-center gap-3 rounded-2xl bg-black/40 py-1.5 pl-1.5 pr-3">
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
          <div className="rounded-full bg-black/40 p-1">
            <AvatarLink firstName={firstName} />
          </div>
        </header>

        <div className={compact ? 'mt-auto pt-8' : 'mt-auto pt-10'}>{children}</div>
      </div>
    </section>
  );
}

/**
 * THE HERO, IN TWO PIECES (Home speed build, 2026-08-28).
 *
 * `HomeHeroFrame` is the photo, the chrome and her greeting. It needs only
 * her name, her clock and whether she has ever checked in, so it is in
 * Home's very first streamed response and her name is the first thing on
 * screen. `HomeHeroBody` is the Root Score and the line above it, which
 * needs real engine work, so it arrives inside the frame's own Suspense
 * boundary a moment later.
 *
 * The split is safe from layout shift by construction: the frame carries
 * the section's `min-h`, its content is bottom-anchored, and the body has
 * never come close to filling that height, so the score landing changes
 * what is inside the box and never how tall the box is. `HomeHeroBodyPlaceholder`
 * holds roughly the body's own height anyway, so the greeting does not
 * visibly slide either.
 */
export function HomeHeroFrame({
  firstName,
  greetingWord,
  hasCheckins,
  children,
}: {
  firstName: string | null;
  greetingWord: string;
  /**
   * Before a member's first completed check-in, FirstCheckInWelcome (see
   * app/dashboard/page.tsx) carries the whole welcome moment below the
   * hero, and the hero uses a much shorter band. That is a geometry
   * decision, which is why it is answered in the first response rather
   * than streamed: see lib/home/frame.ts.
   */
  hasCheckins: boolean;
  children: React.ReactNode;
}) {
  return (
    <HeroChrome
      firstName={firstName}
      heroImage={heroImageForGreeting(greetingWord)}
      greetingWord={greetingWord}
      compact={!hasCheckins}
    >
      <h1
        className={`font-[family-name:var(--font-cormorant-garamond)] leading-tight text-[#FAFAF8] ${
          hasCheckins ? 'text-4xl md:text-[2.75rem]' : 'text-3xl md:text-4xl'
        }`}
      >
        {greetingHeadline(greetingWord, firstName)}
      </h1>
      {children}
    </HeroChrome>
  );
}

/** What sits under the greeting while the score is still being computed. Same rhythm as the real body, so the greeting above it does not move when it lands. */
export function HomeHeroBodyPlaceholder({ hasCheckins }: { hasCheckins: boolean }) {
  return (
    <div data-settling="true" aria-hidden="true" className="mt-2">
      <div className="mef-settling-on-photo h-4 w-3/4 rounded-full" />
      {hasCheckins && (
        <>
          <div className="mef-settling-on-photo mt-6 h-12 w-32 rounded-2xl" />
          <div className="mef-settling-on-photo mt-4 h-4 w-full max-w-md rounded-full" />
          <div className="mef-settling-on-photo mt-2 h-4 w-5/6 max-w-md rounded-full" />
          <div className="mef-settling-on-photo mt-5 h-4 w-48 rounded-full" />
        </>
      )}
    </div>
  );
}

export function HomeHeroBody({
  greetingLine,
  snapshot,
  hasCheckins,
}: {
  /**
   * Dashboard Evolution (Prompt 5), requirement 1: a short, Root-voiced
   * second line under the greeting — lib/dashboard/greeting.ts's
   * buildGreetingLine, computed by app/dashboard/page.tsx from real
   * context only (the hour and whether today's check-in exists) and
   * rotated by the member's own local date so it doesn't repeat daily.
   * Never computed in this component — presentation only.
   */
  greetingLine: string;
  snapshot: RootScoreSnapshot | null;
  hasCheckins: boolean;
}) {
  const line = <p className="mt-2 text-[15px] leading-relaxed text-[#FAFAF8]/85">{greetingLine}</p>;

  if (!hasCheckins) return line;

  if (!snapshot || snapshot.root_score === null) {
    return (
      <>
        {line}
        <h2 className="mt-5 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#FAFAF8]">
          Building your Root Score
        </h2>
        <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#FAFAF8]/85">
          {snapshot?.explanation_summary ||
            'Complete a few check-ins and MEF Wellness will begin calculating your Root Score from real patterns, never a guess.'}
        </p>
        <Link
          href="/root-score"
          className="mef-press mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#FAFAF8] underline underline-offset-4"
        >
          See what strengthens your score
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </>
    );
  }

  return (
    <>
      {line}

      <div className="mt-6 flex flex-wrap items-end gap-4">
        {/* Requirement 5 (Living Progress): the count-up (already built,
            Prompt 1) is how the Root Score arrives; requirement 4/6
            (Ambient Motion / Subtle State Moments) is how it idles once
            settled — a gentle breathe rather than sitting frozen, the
            one ambient breathing element this page uses (Bible §10: at
            most one breathing/pulsing/floating element visible at once). */}
        <Breathe className="flex items-baseline gap-1">
          <RootScoreCountUp
            value={snapshot.root_score}
            className="font-[family-name:var(--font-cormorant-garamond)] text-6xl leading-none text-[#FAFAF8]"
          />
          <span className="text-lg font-medium text-[#FAFAF8]/60">/100</span>
        </Breathe>
        <ChangePill change={snapshot.root_score_change} />
      </div>

      {snapshot.root_confidence_level === 'building' && (
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-[#F5B700]">
          {BASELINE_NOTE}
        </p>
      )}
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
    </>
  );
}
