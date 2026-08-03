/**
 * Dashboard Evolution (Prompt 5), requirement 2: Time-of-Day Adaptation.
 * Pure, no I/O, no hooks — plain Tailwind class strings keyed by the
 * same greeting band lib/dashboard/greeting.ts already derives from
 * lib/feed/timeContext.ts's `greetingWord`, so the palette can never
 * drift out of sync with the greeting or the hero photo (both already
 * key off the exact same word, see components/dashboard/HomeHero.tsx's
 * own heroImageForGreeting). Every value stays within the locked design
 * system (forest green #1B3A2D, gold #F5B700/amber, cream #FAFAF8) —
 * this is atmosphere layered on top of the existing hero
 * darkening-for-legibility overlay, not a new color, and not a redesign.
 */

import type { TimeContext } from '../feed/timeContext';
import { greetingBandFromWord, type GreetingBand } from './greeting';

export type HeroOverlayClasses = {
  /** The stronger, diagonal (top/left) wash — was a flat `black/80 -> black/40 -> black/10` for every time of day; now carries a faint band-specific undertone in its lightest stop only, so legibility is never affected. */
  diagonal: string;
  /** The secondary top/bottom wash. */
  vertical: string;
};

/**
 * Morning: slightly lighter overall (a touch less black) with a faint
 * forest-green undertone in the lightest corner, for "brighter and
 * fresher." Afternoon: unchanged from the original values (the neutral
 * default). Evening: slightly darker overall with a faint warm gold
 * undertone, for "warmer and calmer."
 */
const HERO_OVERLAY: Record<GreetingBand, HeroOverlayClasses> = {
  morning: {
    diagonal: 'bg-gradient-to-br from-black/74 via-black/36 to-[#1B3A2D]/15',
    vertical: 'bg-gradient-to-b from-black/45 via-transparent to-black/40',
  },
  afternoon: {
    diagonal: 'bg-gradient-to-br from-black/80 via-black/40 to-black/10',
    vertical: 'bg-gradient-to-b from-black/50 via-transparent to-black/45',
  },
  evening: {
    diagonal: 'bg-gradient-to-br from-black/84 via-black/44 to-[#7A5900]/20',
    vertical: 'bg-gradient-to-b from-black/55 via-transparent to-black/50',
  },
};

export function heroOverlayForGreeting(greetingWord: TimeContext['greetingWord']): HeroOverlayClasses {
  return HERO_OVERLAY[greetingBandFromWord(greetingWord)];
}

/** The page shell's own background wash (app/dashboard/page.tsx), same subtle-warmth treatment: unchanged mint/cream by day, a touch of cream/gold warmth in the evening. */
const PAGE_BACKGROUND: Record<GreetingBand, string> = {
  morning: 'bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8]',
  afternoon: 'bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8]',
  evening: 'bg-gradient-to-b from-[#F5EFDD] to-[#FAFAF8]',
};

export function pageBackgroundForGreeting(greetingWord: TimeContext['greetingWord']): string {
  return PAGE_BACKGROUND[greetingBandFromWord(greetingWord)];
}
