/**
 * The interactive half of the Happiness deep-dive treatment, in numbers and
 * pure functions.
 *
 * A STANDING RULE FOR THIS FAMILY, AND THIS IS WHERE IT IS WRITTEN DOWN.
 * These templates mix written questions with interactive elements, and an
 * interactive element always SETS UP writing rather than replacing it. She
 * commits to a position or a choice, and then she writes about why. Depth
 * of writing is the soul of a deep-dive; the interactions exist so that she
 * has already committed by the time she starts explaining.
 *
 * That is why nothing in this file scores anything, ranks anything or reads
 * meaning into a position. A slider position is a position. A chosen card
 * is a chosen card. The only thing built here on top of a raw value is
 * putting it back into WORDS, so a coach reading a client screen is not
 * asked to interpret the number 78.
 *
 * PLAIN MODULE, NO 'use client', for the reason ./motion.ts documents: Next
 * treats every export of a 'use client' file as a client reference, so a
 * Server Component or a test importing this math from a component file
 * would break at runtime. The math lives here, the behaviour lives in
 * components/happiness-deep-dive/.
 *
 * REDUCED MOTION IS NOT A SLOWER VERSION OF ANY OF THIS, it is none of it.
 * A card appears placed with a gentle fade instead of travelling, a lifted
 * card is a static gold state instead of a warm, and no duration below is
 * read at all. That branch lives in the components.
 */

/** How long a card takes to settle once she has placed it. A settle, not a flight. */
export const HDD_CARD_SETTLE_MS = 420;

/** How long a lifted card takes to rise off the shelf and warm to gold. */
export const HDD_CARD_LIFT_MS = 520;

/** The step between one card and the next when a whole shelf arrives at once, on the closing. */
export const HDD_SHELF_STAGGER_MS = 130;

/** The longest a whole shelf may spend arriving, however many cards are on it. */
export const HDD_SHELF_MAX_ARRIVAL_MS = 1600;

/** How far a card is dragged before it counts as a drag rather than a tap. */
export const HDD_DRAG_THRESHOLD_PX = 8;

/**
 * When one card of an arriving shelf is due, measured from the moment the
 * shelf appears.
 *
 * Capped as a whole rather than per card, so a member with twelve cards
 * does not wait four times as long as a member with three. The stagger
 * shortens instead.
 */
export function hddShelfCardDelayMs(index: number, total: number): number {
  const safeIndex = Math.max(0, index);
  const safeTotal = Math.max(1, total);
  const step = Math.min(HDD_SHELF_STAGGER_MS, HDD_SHELF_MAX_ARRIVAL_MS / safeTotal);
  return Math.round(step * safeIndex);
}

/**
 * A two-pole position, in words.
 *
 * WHY THIS EXISTS. A coach opening a client screen should read a sentence,
 * not a number, and "78" is not a sentence. The bands below are
 * deliberately coarse: five of them, with a wide middle, because the
 * difference between 71 and 74 is not a difference she meant.
 *
 * IT DESCRIBES THE POSITION AND NOTHING ELSE. There is no band here that
 * says a position is far, worrying, better or worse. The two pole labels
 * are the caller's own words, and this puts her mark between them.
 */
export function hddPolePositionInWords(
  value: number,
  poles: { near: string; far: string }
): string {
  const clamped = Math.min(100, Math.max(0, value));
  if (clamped <= 12) return poles.near.toLowerCase();
  if (clamped < 40) return `closer to ${poles.near}`;
  if (clamped <= 60) return `halfway between ${poles.near} and ${poles.far}`;
  if (clamped < 88) return `closer to ${poles.far}`;
  return poles.far.toLowerCase();
}

/**
 * The lines of a written answer that become cards, in the order she wrote
 * them.
 *
 * HER WORDS ARE NOT EDITED. This splits on the line breaks SHE typed, trims
 * the surrounding whitespace off each line so an accidental trailing space
 * is not a different card, and drops the lines that are empty. It does not
 * split sentences, re-wrap, capitalise, add punctuation or merge anything:
 * every card's text is one line she typed, character for character, minus
 * the whitespace at its ends.
 *
 * A single line answer is ONE card. That is the honest result: she wrote
 * one ending, and inventing more by splitting her sentence would be Root
 * putting words on her shelf.
 */
export function hddLinesToCardTexts(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
