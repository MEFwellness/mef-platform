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

/** The "Today" zone's four blocks, in their original (pre-Prompt-5) visual order — see app/dashboard/page.tsx. */
export type TodayCardKey = 'morning_brief' | 'assigned_programs' | 'wellness_reflection' | 'numbers_or_prompt';

const TODAY_BASE_ORDER: TodayCardKey[] = [
  'morning_brief',
  'assigned_programs',
  'wellness_reflection',
  'numbers_or_prompt',
];

/**
 * The single dynamic rule for the Today zone: whichever block is most
 * actionable right now leads.
 *  - Check-in not yet done today -> the check-in entry point
 *    ('numbers_or_prompt', which renders the "complete today's check-in"
 *    prompt when there's nothing logged yet) rises to the top.
 *  - Check-in already done -> the day's real progress/reflection content
 *    ('wellness_reflection', DailyWellnessSection) leads instead.
 * Every other block keeps its original relative order beneath the
 * leader — this is a promotion, not a full re-sort, so a member never
 * sees the *rest* of the zone reshuffle from one day to the next.
 */
export function orderTodayCards(hasCheckinToday: boolean): TodayCardKey[] {
  const leader: TodayCardKey = hasCheckinToday ? 'wellness_reflection' : 'numbers_or_prompt';
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
