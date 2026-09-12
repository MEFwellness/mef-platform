/**
 * =====================================================================
 * LAYER 2, COACH SIDE. What a practitioner reads, and nobody else.
 * =====================================================================
 *
 * COACH ONLY, AND THE FENCE IS THIS MODULE. It holds the name of the
 * underlying instrument, the score sentence, the reference threshold
 * sentence and the coaching prompt library. No member surface imports it,
 * and tests/breathing-check-in-layers.test.ts walks the import graph of
 * every member facing file in this feature and fails if any path reaches
 * here. That is the reason the instrument's name is in this file and not
 * in ./constants.ts beside the member facing one: a fence a component
 * author has to remember is not a fence.
 *
 * WHAT THE THRESHOLD SENTENCE MAY NOT SAY. It may not say that reaching
 * the reference figure diagnoses anything, identifies a condition, or
 * means a member has dysfunctional breathing. It reports a higher burden
 * of the symptoms the instrument asks about and hands the reading back to
 * the practitioner. A test asserts the forbidden words are absent.
 *
 * THE COACHING PROMPTS CLAIM NO CAUSATION. Every one is a question to ask
 * her, not a conclusion about her. A test scans them for cause, caused,
 * causing, because, leads to, due to, explains and diagnos, exactly as the
 * Health & Lifestyle Intake's own prompts are scanned.
 *
 * NO EM DASHES.
 */

import { BPC_REFERENCE_THRESHOLD } from './instrument';

/**
 * What the underlying instrument is called.
 *
 * A COACH READS THIS AND A MEMBER NEVER DOES. She is told what the thing
 * measures, in her own words, on her own screens. He is told which
 * published instrument produced the number he is looking at, because a
 * score with no instrument beside it cannot be interpreted at all.
 */
export const BPC_INSTRUMENT_NAME = 'Nijmegen Questionnaire';

export const BPC_COACH_COPY = {
  /** The coach's card heading. Names the instrument, because that is what a coach needs. */
  instrumentHeading: BPC_INSTRUMENT_NAME,

  /** The label above the score. The number itself is formatted from stored results. */
  totalLabel: 'Total Score',

  /** The reference figure, said as a reference figure. */
  thresholdLabel: `Traditional reference threshold: ${BPC_REFERENCE_THRESHOLD}+`,

  /**
   * The one sentence that says what the threshold means, and it stops
   * where the evidence stops.
   */
  thresholdNote:
    'Scores at or above the traditional reference threshold may indicate a higher burden of breathing-related symptoms and should be interpreted alongside history and clinical context.',

  /** An unfinished sitting. Named honestly rather than scored as though it were complete. */
  partialNote:
    'This sitting is not finished, so the total covers only the questions answered so far.',

  responsesHeading: 'All 16 responses',
  responseColumnQuestion: 'Question',
  responseColumnResponse: 'Response',
  responseColumnScore: 'Score',
  unansweredLabel: 'Not answered',

  highestHeading: 'Highest-response symptoms',
  highestEmpty: 'Nothing came back above the quiet end of the scale.',
  /**
   * The line under the highest-response list.
   *
   * IT REFUSES THE CAUSAL READ EXPLICITLY, because a list ordered by
   * magnitude invites one. What is listed is what she answered highest,
   * and that is all it is.
   */
  highestNote:
    'These are the items she answered highest. Order says nothing about which came first or what is driving what.',

  coachingHeading: 'Coaching Questions',
  coachingNote: 'Questions to explore what she is experiencing, without interpreting it for her.',

  historyHeading: 'Previous sittings',
  historyNote: 'Each completed sitting is kept. Nothing is overwritten by a later one.',

  notAssignedNote: 'Not assigned. Nothing about this is offered to them until you send it.',
} as const;

/**
 * The coaching prompt library.
 *
 * RULE BASED AND FIXED. Every prompt is asked of every reading, in this
 * order, and nothing here is selected by a score. That is deliberate: a
 * prompt list that changed with the total would be the app telling a coach
 * what it thinks is going on, which is the interpretation this layer
 * refuses to make. What the reading DOES surface is which symptoms came
 * back highest (./coachView.ts), and these four questions are how a coach
 * explores any of them.
 */
export const BPC_COACHING_QUESTIONS: readonly string[] = [
  'When do you notice this sensation most?',
  'Does it tend to appear during stress, activity, rest, meals, or at another time?',
  'What happens when you intentionally slow your breathing?',
  'Do you notice tension in your jaw, neck, shoulders, chest, or abdomen when this happens?',
] as const;
