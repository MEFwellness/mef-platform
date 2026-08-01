/**
 * Life Signal Check — Question 10's dynamic option generation. Pure, no
 * I/O. Mirrors lib/core-values-snapshot/q12.ts's role: options are
 * computed live from the member's own Screen 2 answers, not fixed
 * content, so migration 138 stores this question's answer_options as
 * null.
 *
 * Shows only the "loud" signals (score 2 or 3). If nothing is loud, the
 * question flips framing entirely ("which would you most want to
 * protect") and offers all six, per the build brief.
 */

import { LOUD_THRESHOLD, SIGNALS, SIGNAL_LABEL, type Signal } from './constants';

export type Q10Framing = 'quiet' | 'protect';

export type Q10Option = { value: Signal; label: string };

export function computeLoudSignals(scores: Record<Signal, number>): Signal[] {
  return SIGNALS.filter((s) => scores[s] >= LOUD_THRESHOLD);
}

export function generateQ10Options(scores: Record<Signal, number>): { options: Q10Option[]; framing: Q10Framing } {
  const loud = computeLoudSignals(scores);
  const source = loud.length > 0 ? loud : SIGNALS;
  return {
    options: source.map((s) => ({ value: s, label: SIGNAL_LABEL[s] })),
    framing: loud.length > 0 ? 'quiet' : 'protect',
  };
}

export const Q10_PROMPT_BY_FRAMING: Record<Q10Framing, string> = {
  quiet: 'If Root could quiet just one of these for you, which would you pick?',
  protect: 'Which of these would you most want to protect?',
};
