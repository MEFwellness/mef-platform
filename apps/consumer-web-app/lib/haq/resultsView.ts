/**
 * HER RESULTS, AS THE SCREEN ARRANGES THEM. Pure, and deliberately kept
 * apart from lib/haq/results.ts.
 *
 * WHY A SECOND MODULE. results.ts reads the database, so it pulls the
 * Supabase client and the assessment runtime onto anything that imports it.
 * Her results map is now interactive (the summary strip emphasises a colour,
 * a row opens), so the component is a client component, and a client
 * component's imports are shipped to her browser. Everything the browser
 * actually needs here is arithmetic over cards it already has, so it lives
 * in a module that imports nothing but types.
 *
 * NO NUMBER OF THE INSTRUMENT IS IN HERE EITHER. The three counts are
 * counted from the cards themselves, and the bar widths are three fixed
 * strings chosen by band. Nothing in this file has ever seen a section
 * total, a hidden value or a cutoff, and tests/haq-member-safety.test.ts
 * holds it to that.
 */

import type {
  HaqMemberResultLabel,
  HaqPartId,
  HaqResultColor,
  HaqSectionId,
  HaqTrend,
} from './types';

/**
 * RED, THEN YELLOW, THEN GREEN. The order the summary strip names the three
 * states. It is NO LONGER the order the map stands in: the map is grouped by
 * the instrument's own ten Parts, so she can see WHERE her results fall in
 * the body system structure, and the strip is what tells her how many of
 * each she has.
 */
export const HAQ_RESULT_COLOR_ORDER: readonly HaqResultColor[] = ['red', 'yellow', 'green'];

/** One section, as her results page shows it. Words only. */
export type HaqResultCard = {
  sectionId: HaqSectionId;
  /** The section's own stored name. Locked content, never reworded for a screen. */
  sectionTitle: string;
  /** The Part this section belongs to, which is the group it is drawn under. */
  partId: HaqPartId;
  /** The Part's real name, "Gastrointestinal". Never the numeral: "Part I" belongs to the question flow. */
  partName: string;
  resultColor: HaqResultColor;
  memberResultLabel: HaqMemberResultLabel;
  /** The approved explanation for this colour, and the only one it ever gets. */
  explanation: string;
  /** Null unless she has an earlier finished sitting to compare this one with. */
  trend: HaqTrend | null;
};

export type HaqResultCounts = Record<HaqResultColor, number>;

/**
 * How many areas stand in each state. Counted from the cards themselves, so
 * the summary strip and the map below it cannot disagree, and so the three
 * always sum to the number of cards.
 */
export function haqResultCounts(cards: readonly HaqResultCard[]): HaqResultCounts {
  const counts: HaqResultCounts = { red: 0, yellow: 0, green: 0 };
  for (const card of cards) counts[card.resultColor] += 1;
  return counts;
}

/** One Part of the instrument, with its sections in their original order. */
export type HaqResultGroup = {
  partId: HaqPartId;
  partName: string;
  cards: HaqResultCard[];
};

/**
 * The cards under their ten Part headings.
 *
 * A RUN, NOT A LOOKUP. The cards arrive in the instrument's own section
 * order (buildHaqResultCards sorts them that way and nothing reorders them
 * after), and the instrument's sections are contiguous within a Part, so
 * grouping is one pass that starts a new group whenever the Part changes.
 * That keeps both the Parts and the sections inside them in the order the
 * questionnaire itself uses, WITHOUT this module importing the question
 * bank: thirty kilobytes of question text has no business in her browser
 * just to print ten headings.
 */
export function haqResultGroups(cards: readonly HaqResultCard[]): HaqResultGroup[] {
  const groups: HaqResultGroup[] = [];
  for (const card of cards) {
    const open = groups[groups.length - 1];
    if (open && open.partId === card.partId) open.cards.push(card);
    else groups.push({ partId: card.partId, partName: card.partName, cards: [card] });
  }
  return groups;
}

/**
 * HOW FULL THE BAR IS DRAWN, BY BAND, AND NEVER BY THE SCORE BEHIND IT.
 *
 * The sections do not share a scale. One turns Red at 8, another at 16,
 * another at 32, so a bar drawn from a raw total would say that one Red
 * section is worse than another Red section, which is not something this
 * instrument measures. Three fixed widths instead: every Green reads the
 * same, every Yellow reads the same, every Red reads the same, and the only
 * thing a bar claims is which band the section landed in.
 *
 * Strings, because they go straight into a CSS width and never into a
 * number she could read.
 */
export const HAQ_BAND_FILL: Record<HaqResultColor, string> = {
  green: '33%',
  yellow: '66%',
  red: '100%',
};
