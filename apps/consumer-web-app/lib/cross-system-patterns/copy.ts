/**
 * EVERY SENTENCE A COACH READS ABOUT A PATTERN, in one file that no member
 * surface can reach.
 *
 * WHY IT IS ITS OWN FILE. The evaluation half of this feature is reachable
 * from a member's own submit: ingesting her finished sitting is the first
 * of the three re-evaluation triggers, so her action's import graph runs
 * through the matcher and the ledger. Those modules count rows and write
 * ids, and they must hold no word about a pattern at all. This file holds
 * the words, and only the card, the panel and their tests import it.
 * tests/cross-system-pattern-fence.test.ts asserts both halves of that:
 * that no member surface can reach this file, and that not one of these
 * strings appears in anything a member surface can reach.
 *
 * THE MATCHER COUNTS, THIS FILE SPEAKS. That is also why the strength a
 * match reaches is 'emerging' or 'stronger' rather than a sentence: the
 * arithmetic has no opinion about wording, and the wording is resolved
 * here, once, where the card is built.
 */

import type { PatternStrength } from './constants';

/** The section's coach facing name. Nothing member facing exists for it. */
export const WHOLE_BODY_PATTERNS_LABEL = 'Whole-Body Patterns';

/**
 * THE TWO DISPLAY LINES, fixed, and the only two sentences this engine
 * writes about a pattern's strength.
 *
 * Neither says anything happened, neither says anything caused anything,
 * and neither tells a coach what to do. The first offers a review; the
 * second says how many things are contributing. Everything else a coach
 * reads on a pattern card is HER OWN WORDING, stored on the relationship
 * version she wrote.
 */
export const EMERGING_DISPLAY_LINE = 'An emerging cross-system pattern may be worth reviewing.';
export const STRONGER_DISPLAY_LINE =
  'Multiple related responses are contributing to this predefined pattern.';

export const STRENGTH_DISPLAY_LINE: Record<PatternStrength, string> = {
  emerging: EMERGING_DISPLAY_LINE,
  stronger: STRONGER_DISPLAY_LINE,
};

/**
 * THE EIGHT BLOCKS OF A PATTERN CARD, in the order they are drawn, and
 * their headings.
 *
 * THEY ARE NEVER BLENDED. What the member reported, what was found
 * alongside it, how much of it there is, what the coach wrote it may mean,
 * and what she wrote is worth exploring are five different kinds of
 * statement, and a card that ran them together would turn her own careful
 * "may be relevant" into a finding. The headings live here rather than
 * inline so the card, the tests and any later reader name the same blocks
 * the same way.
 */
export const PATTERN_CARD_BLOCKS = [
  {
    key: 'observed',
    title: 'Observed',
    blurb: 'The exact signals on record, with the value each one carries.',
  },
  {
    key: 'related_signals',
    title: 'Related Signals',
    blurb: 'Each related body system this pattern names, and how many supporting responses sit under it.',
  },
  {
    key: 'pattern_strength',
    title: 'Pattern Strength',
    blurb: 'Which level of the coach own ladder these counts reached.',
  },
  {
    key: 'possible_association',
    title: 'Possible Association',
    blurb: 'Coach only, and the coach own wording from the version this match read.',
  },
  {
    key: 'why_noticed',
    title: 'Why Root noticed this',
    blurb: 'The arithmetic, said plainly.',
  },
  {
    key: 'sources',
    title: 'Sources',
    blurb: 'Every contributing signal, where it came from and the day it was captured.',
  },
  {
    key: 'coaching_considerations',
    title: 'Coaching Considerations',
    blurb: 'The coach own list, from the version this match read.',
  },
  {
    key: 'contributing_signals',
    title: 'View contributing signals',
    blurb: 'Every exact original response behind this pattern.',
  },
] as const;

export type PatternCardBlockKey = (typeof PATTERN_CARD_BLOCKS)[number]['key'];

/**
 * WHAT THE SAFETY OVERRIDE PUTS THERE INSTEAD.
 *
 * The existing red flag system always wins. Where a contributing response
 * carries a safety response, the whole card is withheld and these words
 * are drawn in its place, in the safety treatment the Body Systems Survey
 * card already uses. No pattern name, no strength, no possible
 * association and no coaching consideration is rendered beside them,
 * because the point of withholding a card is that its explanation is not
 * the thing to read.
 */
export const SAFETY_SUPPRESSION_HEADING = 'Safety response on record';
export const SAFETY_SUPPRESSION_BODY =
  'One of the responses behind this entry already has a safety response on record. Nothing about a whole-body pattern is shown here. Follow the existing safety process first.';
export const SAFETY_SUPPRESSION_ACTION = 'Open the red flags pinned on her Body Systems Survey';

export const SAFETY_SUPPRESSION_ANCHOR_ID = 'detail-card-body-systems';
