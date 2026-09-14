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
 *
 * A MASTHEAD, NOT THE SCREEN (Home presentation pass, 2026-09-13).
 *
 * This band used to be 500px tall with a 60px numeral in it, which on a
 * phone is the entire first screen: a member opened Home, read a
 * photograph and a reading, and had to scroll to find the one thing the
 * day's engine had actually chosen for her. The dominant element on Home
 * is that card, so the hero now says who she is, what time it is and how
 * her score stands, in a band short enough that the card begins inside
 * the first screenful.
 *
 * The score itself is `RootScoreRing` beside the greeting rather than
 * under it, which is what bought most of the height back. Nothing it
 * reports changed: the same snapshot, the same explanation sentence, the
 * same link to the full screen, the same baseline state.
 */

import Image from 'next/image';
import { QuietLink } from '@/components/nav/QuietLink';
import { ArrowRight } from 'lucide-react';
import type { RootScoreSnapshot } from '@mef/shared-types-contracts';
import { AvatarLink } from '@/components/AvatarLink';
import { Breathe } from '@/components/motion/Breathe';
import { heroOverlayForGreeting } from '@/lib/dashboard/timeOfDayPalette';
import { greetingHeadline } from '@/lib/profile/greeting';
import { RootScoreRing } from './RootScoreRing';
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

const HERO_IMAGE_DAY = '/images/home-hero-day.jpg';
const HERO_IMAGE_EVENING = '/images/home-hero-evening.jpg';

/** Same "Good morning" / "Good afternoon" / "Good evening" boundary as lib/feed/timeContext.ts's greetingForHour — reuses the already-computed word instead of recomputing the hour, so the image can't disagree with the greeting. */
function heroImageForGreeting(greetingWord: string): string {
  return greetingWord === 'Good evening' ? HERO_IMAGE_EVENING : HERO_IMAGE_DAY;
}

/**
 * How her score moved since the last one, in words, under the ring.
 *
 * It was a bordered, blurred chip beside a 60px numeral. A second framed
 * object next to the number was one object too many for a reading this
 * size, and the colour it carried (emerald / amber / red) is a status
 * colour spent on a difference of one point. The words are the same
 * words; the tint is now the one distinction that carries meaning, a
 * gentle lift for up and the plain cream for everything else.
 */
function ChangeNote({ change }: { change: number | null }) {
  if (change === null) return null;
  const text =
    change === 0
      ? 'Steady'
      : `${Math.abs(change)} pt${Math.abs(change) === 1 ? '' : 's'} ${change > 0 ? 'up' : 'down'}`;
  return (
    <span
      className={`mt-2 block text-center text-[11px] font-medium tracking-wide [text-shadow:0_1px_6px_rgba(0,0,0,0.55)] ${
        change > 0 ? 'text-[#EBD29A]' : 'text-[#FAFAF8]/85'
      }`}
    >
      {text}
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
            : // ONE COMMITTED HEIGHT (performance and stability audit,
              // 2026-09-06), and it is still one. It was 440px on a phone
              // and 500px from md up, and the tall hero's real content sat
              // between the two, so the page dropped 59px the moment the
              // score landed inside a box reserved at 440: that one swap
              // was 0.060 of Home's 0.061 layout shift. Committing to a
              // single number means the box the body lands in is the box
              // that was reserved, whatever the length of her sentence.
              //
              // THE NUMBER CHANGED WITH THE LAYOUT (2026-09-13), and the
              // property it protects did not. The score moved from under
              // the greeting to beside it as a ring and its explanation is
              // held to two lines, and the band's real content was then
              // MEASURED at 390px rather than estimated: 396px in its
              // tallest state (with the baseline note showing), 375px
              // without it, and 340px while the body is still settling.
              // 400 is above all three, which is what makes the band the
              // same height in every one of them and the swap move
              // nothing. Both files that reserve this height carry the
              // identical value, which is the point:
              // components/dashboard/HomePlaceholders.tsx is the other.
              'min-h-[400px] pb-8 pt-8 sm:pt-9 md:pb-12'
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
          <div className="flex items-center gap-3 rounded-2xl bg-black/35 py-1.5 pl-1.5 pr-3.5">
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

        <div className="mt-auto pt-6">{children}</div>
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
        className={`font-[family-name:var(--font-cormorant-garamond)] leading-[1.12] text-[#FAFAF8] ${
          hasCheckins ? 'text-[2.125rem] md:text-[2.5rem]' : 'text-3xl md:text-4xl'
        }`}
      >
        {greetingHeadline(greetingWord, firstName)}
      </h1>
      {children}
    </HeroChrome>
  );
}

/**
 * What sits under the greeting while the score is still being computed.
 *
 * BLOCK FOR BLOCK, WITH THE REAL BODY'S OWN MEASUREMENTS. Every bar here is
 * the height and the top margin of the element it stands in for in
 * `HomeHeroBody` below: the summary line, the ring on the right of that
 * same row with its change note under it, the explanation held to two
 * lines, and the link. It used to be a rough rhythm of 16px bars, which
 * came to 59px short of the real body and was most of the layout shift on
 * this screen.
 *
 * Two lines for the explanation because the real one is held to two
 * (`line-clamp-2` below), so this is not an estimate of it any more: it is
 * the same number of lines the body can ever draw.
 *
 * AND THE RING'S CHANGE NOTE IS PART OF THAT COLUMN (2026-09-13). The
 * placeholder reserved the ring alone, 64px, against a real column of 89
 * (a 66px ring, then "3 pts down" under it). The body is bottom-anchored
 * inside a band of committed height, so eighteen missing pixels did not
 * leave a gap at the foot, they moved HER GREETING: measured on
 * production, the greeting settled 18px upwards about a second after the
 * page arrived, which was the last layout shift left on Home (0.0057 of
 * it, and all of it). Every number below was read off the real rendered
 * hero at 390px.
 *
 * THE ONE THING IT CANNOT KNOW is which of the body's two variable lines
 * she gets: the change note needs a previous score, and the "still
 * building your baseline" line appears only while her confidence level is
 * building. What is reserved is the established shape, which is also
 * within two pixels of the building one, because a member who has no
 * change note to show is usually the same member who has the baseline
 * line instead, and those two are the same size.
 */
export function HomeHeroBodyPlaceholder({ hasCheckins }: { hasCheckins: boolean }) {
  if (!hasCheckins) {
    return (
      <div data-settling="true" aria-hidden="true" className="mt-2">
        <div className="mef-settling-on-photo h-[22px] w-3/4 rounded-full" />
      </div>
    );
  }

  return (
    // 1px, not 8: the real body's first row starts immediately under the
    // greeting's own line box.
    <div data-settling="true" aria-hidden="true" className="mt-px">
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1 pt-2">
          <div className="mef-settling-on-photo h-[21px] w-3/4 rounded-full" />
        </div>
        {/* The ring, and the change note that sits under it. 66 + 8 + 15
            is the 89px column the real one measures. */}
        <div className="shrink-0">
          <div className="mef-settling-on-photo h-[66px] w-[66px] rounded-full" />
          <div className="mef-settling-on-photo mx-auto mt-2 h-[15px] w-[68px] rounded-full" />
        </div>
      </div>
      <div className="mef-settling-on-photo mt-3 h-[46px] w-full max-w-md rounded-2xl" />
      <div className="mef-settling-on-photo mt-3 h-[38px] w-56 rounded-full" />
    </div>
  );
}

/**
 * The link out of the hero, in the one treatment both its states use.
 *
 * It was an underlined sentence with a chevron after it. Underlined body
 * text on a photograph is the least legible thing this screen could draw,
 * and the chevron was a fifth icon weight in a band that has three. This
 * is a quiet capsule: same words, same destination, one obvious target.
 */
function HeroLink({ href, children }: { href: '/root-score'; children: React.ReactNode }) {
  return (
    <QuietLink
      href={href}
      className="mef-press mef-focus-ring mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#FAFAF8]/25 px-4 py-2 text-[13px] font-medium text-[#FAFAF8] transition hover:bg-[#FAFAF8]/10"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
    </QuietLink>
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
  const line = <p className="mt-2 text-[15px] leading-snug text-[#FAFAF8]/85">{greetingLine}</p>;

  if (!hasCheckins) return line;

  if (!snapshot || snapshot.root_score === null) {
    return (
      <>
        {line}
        <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#FAFAF8]">
          Building your Root Score
        </h2>
        <p className="mt-2 line-clamp-2 max-w-md text-sm leading-relaxed text-[#FAFAF8]/80">
          {snapshot?.explanation_summary ||
            'Complete a few check-ins and MEF Wellness will begin calculating your Root Score from real patterns, never a guess.'}
        </p>
        <HeroLink href="/root-score">See what strengthens your score</HeroLink>
      </>
    );
  }

  return (
    <>
      {/* THE SCORE SITS BESIDE THE GREETING, NOT UNDER IT. That is the
          whole of where this band's height went: a 60px numeral, a `/100`
          and a bordered chip on their own row cost about 150px of the
          first screen, and the card below is what that screen is for. */}
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">{line}</div>

        {/* Requirement 5 (Living Progress): the count-up (already built,
            Prompt 1) is still how the number arrives, inside the ring now;
            requirement 4/6 (Ambient Motion / Subtle State Moments) is how
            it idles once settled — a gentle breathe rather than sitting
            frozen, the one ambient breathing element this page uses
            (Bible §10: at most one breathing/pulsing/floating element
            visible at once). */}
        <Breathe className="relative block shrink-0">
          <RootScoreRing score={snapshot.root_score} />
          <ChangeNote change={snapshot.root_score_change} />
        </Breathe>
      </div>

      {snapshot.root_confidence_level === 'building' && (
        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C4A050]">
          {BASELINE_NOTE}
        </p>
      )}
      {/* HELD TO TWO LINES, with the whole of it one tap away underneath.
          The engine writes anything from one line to six here, and a band
          that commits to a height cannot also let one sentence decide it.
          Two is what the placeholder above reserves, exactly, and it is
          what the measured band came to at 380px with the baseline note
          also showing. */}
      <p
        className={`line-clamp-2 max-w-md text-sm leading-relaxed text-[#FAFAF8]/80 ${
          snapshot.root_confidence_level === 'building' ? 'mt-2' : 'mt-3'
        }`}
      >
        {snapshot.explanation_summary}
      </p>

      <HeroLink href="/root-score">See your full Root Score</HeroLink>
    </>
  );
}
