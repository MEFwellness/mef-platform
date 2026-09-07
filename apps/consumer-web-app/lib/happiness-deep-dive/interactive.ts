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
 * THE SECOND STANDING RULE: THE FORMAT ROTATES. No two consecutive
 * templates share an interactive signature, because a set of nine-question
 * sittings that all feel alike is one experience delivered seven times.
 * What You Put Down's signature is the shelf, the drag and the two-pole
 * line. Your Own Company uses NONE of those: its signature is the instinct
 * pick, fast this-or-that pairs answered from the gut, each one feeding the
 * writing that slows her down to examine what the gut just said. Every
 * piece below is built to be reached for again in a different combination
 * rather than to belong to the template that needed it first, and none of
 * them knows which template is using it (asserted in
 * tests/happiness-interactive.test.tsx).
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

// ---------------------------------------------------------------------
// The instinct pick, and the round of them.
// ---------------------------------------------------------------------

/**
 * WHAT AN INSTINCT PICK IS FOR, and why it is in this file rather than
 * inside the template that needed it first.
 *
 * A pick is a this-or-that answered from the gut: two cards, one tap, no
 * scale and no third option. It exists to make the WRITING after it
 * specific, which is the standing rule at the top of this file. She commits
 * to something in half a second, and then the written half asks her to look
 * at what she just said. Nothing about a pick is scored, ranked, or read
 * for meaning: it is a fact about which card she tapped, and the only thing
 * ever built on top of it is putting a COUNT of her own answers back into
 * words.
 *
 * TWO SIDES, NAMED RATHER THAN NUMBERED. 'a' and 'b' are positions in the
 * pair the template authored, so a stored pick stays readable when a
 * template's card wording is corrected, and a coach card can print the
 * question beside the answer.
 */
export type HddInstinctSide = 'a' | 'b';

/** True for a value that is genuinely one of the two sides. Everything else is no pick at all. */
export function hddIsInstinctSide(value: unknown): value is HddInstinctSide {
  return value === 'a' || value === 'b';
}

/** How long a pick stays on screen, lit, before the round moves to the next pair. */
export const HDD_RAPID_ADVANCE_MS = 520;

/** How long the tally takes to arrive once the last pair of a round has been answered. */
export const HDD_RAPID_TALLY_MS = 700;

/** How long a chosen card takes to light up. Short, because the point of a round is speed. */
export const HDD_INSTINCT_PICK_MS = 220;

/** How long a superseded sentence takes to fade back as the one replacing it arrives. */
export const HDD_SUPERSEDED_FADE_MS = 900;

/**
 * A count of her own answers, in a sentence.
 *
 * WHAT THIS IS ALLOWED TO SAY, and it is the only number any of these
 * templates prints. It is HER count of HER taps, out of the number of
 * questions she was actually asked, and it says nothing about what the
 * count means. There is no band here, no threshold, no "most people" and no
 * adjective.
 *
 * IT NAMES THE ANSWER SHE GAVE MORE OFTEN, and counts that one, because a
 * fixed side would print "You said Never 0 times out of 5" at somebody who
 * answered the other way every time. Which side is named is decided by her
 * answers and nothing else, and the total is always the whole round, so the
 * sentence can never quietly count a subset.
 *
 * PURE, and read by the member's screen and her coach's card alike, so the
 * two can never disagree about a number she was shown.
 */
export function hddRoundTallySentence(
  counts: { a: number; b: number },
  labels: { a: string; b: string }
): string {
  const total = counts.a + counts.b;
  const side: HddInstinctSide = counts.a >= counts.b ? 'a' : 'b';
  const count = side === 'a' ? counts.a : counts.b;
  return `You said ${labels[side]} ${count} ${count === 1 ? 'time' : 'times'} out of ${total}.`;
}

/**
 * When one pair of a rapid round is due, measured from the moment the round
 * appears.
 *
 * A ROUND IS PACED BY HER, NOT BY A TIMER. Nothing here advances on its
 * own: this is only the short beat between her tap landing and the next
 * pair replacing it, so a card she tapped is visibly lit before it goes. A
 * member who takes a minute on pair three simply takes a minute.
 */
export function hddRapidAdvanceMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : HDD_RAPID_ADVANCE_MS;
}
