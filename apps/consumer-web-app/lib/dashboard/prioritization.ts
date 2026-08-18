/**
 * Dashboard Evolution (Prompt 5), requirement 3: Card Prioritization.
 * Pure, no I/O, no randomness — the same real state always produces the
 * same order (per this prompt's own "rules-based and predictable, not
 * random" requirement). app/dashboard/page.tsx already fetches every
 * fact these functions read (whether today's check-in exists); this
 * module only decides what order to render the already-fetched cards
 * in. Nothing here changes which cards exist, what they say, or what
 * section they live in — only their position within that section.
 *
 * Navigation, the bottom bar, and Quick Actions are deliberately not
 * covered here — the prompt's own hard boundary keeps those fixed.
 */

/**
 * The "Today" zone's blocks, in their base visual order — see
 * app/dashboard/page.tsx.
 *
 * Home cleanup pass (2026-08-14) removed two of the original four:
 * 'wellness_reflection' (the Today's Wellness panel: "Daily Reset" and
 * "Daily Wellness Score", two unexplained numbers competing with the Root
 * Score) is gone from Home entirely, and the numbers half of
 * 'numbers_or_prompt' moved to the Today tab
 * (components/today/TodaysNumbersGrid.tsx). What is left of that block on
 * Home is only its other half, the honest line for a day with nothing
 * logged yet, so the key now says what it actually is: 'checkin_prompt'.
 *
 * The program card polish pass (2026-08-18) removed a third,
 * 'assigned_programs'. It did not leave Home: it was promoted OUT of this
 * zone into its own, above Quick Actions, as the screen's hero. A card
 * that is the hero of the page is not a card whose position within a zone
 * needs deciding, so it no longer has a key here. See
 * app/dashboard/page.tsx and components/AssignedProgramsCard.tsx.
 */
export type TodayCardKey = 'morning_brief' | 'checkin_prompt';

const TODAY_BASE_ORDER: TodayCardKey[] = ['morning_brief', 'checkin_prompt'];

/**
 * The single dynamic rule for the Today zone: whichever block is most
 * actionable right now leads.
 *  - Check-in not yet done today -> the check-in line ('checkin_prompt')
 *    rises to the top, since it is the one thing on this zone she can act
 *    on right now.
 *  - Check-in already done -> that block renders nothing at all, and the
 *    zone falls back to its base order with Root's own brief leading.
 * Every other block keeps its original relative order beneath the
 * leader — this is a promotion, not a full re-sort, so a member never
 * sees the *rest* of the zone reshuffle from one day to the next.
 */
export function orderTodayCards(hasCheckinToday: boolean): TodayCardKey[] {
  if (hasCheckinToday) return [...TODAY_BASE_ORDER];
  const leader: TodayCardKey = 'checkin_prompt';
  return [leader, ...TODAY_BASE_ORDER.filter((key) => key !== leader)];
}

/** The "What Root Is Noticing" carousel's tiles. A new discovery moment (RootDiscoveryCard) always takes the lead slot when one exists — per this prompt's "a new discovery card outranks routine cards whenever one exists" rule. Each tile is its own self-fetching, self-gating component that renders nothing when it has nothing real to show, so a discovery-less day simply never occupies this lead slot rather than needing a second code path here. */
export type NoticingCardKey =
  | 'discovery'
  | 'what_were_noticing'
  | 'root_map'
  | 'coaching_message'
  | 'recommendations';

export const NOTICING_CARD_ORDER: NoticingCardKey[] = [
  'discovery',
  'what_were_noticing',
  'root_map',
  'coaching_message',
  'recommendations',
];
