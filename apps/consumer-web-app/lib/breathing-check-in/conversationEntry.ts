/**
 * =====================================================================
 * LAYER 2. WHAT ROOT IS TOLD WHEN SHE ARRIVES FROM HER RESULTS.
 * =====================================================================
 *
 * "Review With My Coach" on her results screen opens a Root conversation.
 * This module turns her already built member view into the two strings
 * that conversation needs: the line Root opens with, and the short context
 * string handed to the model with her first message.
 *
 * IT IS A PURE BUILDER AND IT READS NOTHING. It takes the view the page
 * already built for its own rendering, exactly like
 * lib/conversation-coach/entryContext.ts's other builders, so it cannot
 * fetch, cannot write and cannot reach a second copy of her sitting.
 *
 * THE OPENER IS DRAWN, NEVER STORED. The conversation page prints it in
 * place of the generic empty state line. A render that inserted a message
 * row would insert one again on every re-render of that route, and a
 * Server Action on that page re-renders it.
 *
 * THE CONTEXT STRING IS MODEL FACING AND A MEMBER NEVER READS IT. It
 * carries her total, the reference figure and the answers she gave
 * highest, because a conversation about a result that cannot see the
 * result is a conversation about nothing. It also carries the standing
 * rules in words, on top of the system prompt's own HARD_LIMITS, because
 * this is the one entry point that hands Root a clinical instrument's
 * output: no diagnosis, no clinical vocabulary, never the name of the
 * underlying instrument, and one clear next step at a time.
 *
 * IT IS INSIDE THE MEMBER FENCE. It imports ./copy.ts and ./signals.ts and
 * nothing else, so it can reach neither ./coachCopy.ts nor ./coachView.ts,
 * and tests/breathing-check-in-layers.test.tsx walks this file's import
 * graph with the rest of her surfaces.
 *
 * NO EM DASHES.
 */

import { BPC_CONVERSATION_OPENER } from './copy';
import type { BpcMemberView } from './signals';

export type BpcConversationSeed = {
  /** Root's opening line, drawn above the message box on an empty thread. */
  opener: string;
  /** The short context string sent with her first message. Model facing. */
  entryContext: string;
};

/** Her strongest answers as one clause, or a plain statement that none qualified. */
function strongestClause(view: BpcMemberView): string {
  if (view.strongest.length === 0) {
    return 'No single answer came back at the higher end of the scale.';
  }
  const listed = view.strongest
    .map((signal) => `${signal.name} (${signal.frequencyLabel})`)
    .join(', ');
  return `The answers she gave highest, strongest first: ${listed}.`;
}

/**
 * What Root is opened with. Null when there is no finished sitting to talk
 * about, which is what a member arriving at /conversation any other way
 * gets.
 */
export function buildBpcConversationSeed(view: BpcMemberView | null): BpcConversationSeed | null {
  if (!view) return null;

  const side = view.aboveThreshold ? 'at or above' : 'below';

  return {
    opener: BPC_CONVERSATION_OPENER,
    entryContext: [
      'her own Breathing Pattern Check-In results, which she has just finished reading.',
      `Her total for this sitting: ${view.totalScore} out of ${view.maxScore}, which is ${side} the traditional reference threshold of ${view.referenceThreshold}.`,
      strongestClause(view),
      'She has already been shown this number and the sentences that bound it, so you may refer to it plainly.',
      'Never name the underlying instrument, never diagnose anything, use no clinical vocabulary beyond "traditional reference threshold", and offer one clear next step at a time rather than a list.',
    ].join(' '),
  };
}
