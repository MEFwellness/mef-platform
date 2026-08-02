/**
 * Readiness Pulse — Question 2's dynamic content. Pure, no I/O. Mirrors
 * lib/life-signal-check/q10.ts's role: which prompt and options Question 2
 * shows depends entirely on Question 1's own answer (has she tried before,
 * or never started), so migration 141 stores rpl_q2's answer_options as
 * null and this generates the real content live, the same "answer_options
 * null, generated at take-time" pattern Question 10 and Question 12
 * (Core Values Snapshot) already established.
 */

import { triedBranchFor, type Q1Answer } from './constants';

export type Q2Option = { value: string; label: string };

const TRIED_OPTIONS: Q2Option[] = [
  { value: 'life_got_busy', label: 'Life got busy' },
  { value: 'motivation_faded', label: 'Motivation faded' },
  { value: 'results_too_slow', label: 'Results came too slow' },
  { value: 'nobody_noticed', label: 'Nobody noticed I was trying' },
];

const NEVER_STARTED_OPTIONS: Q2Option[] = [
  { value: 'never_right_time', label: 'Never felt like the right time' },
  { value: 'didnt_know_where', label: 'Did not know where to start' },
  { value: 'afraid_wouldnt_stick', label: 'Afraid it would not stick' },
  { value: 'nothing_forced_me', label: 'Honestly, nothing forced me to' },
];

export function generateQ2Content(q1: Q1Answer): { prompt: string; options: Q2Option[] } {
  if (triedBranchFor(q1) === 'never_started') {
    return { prompt: 'What has kept it at the thinking stage?', options: NEVER_STARTED_OPTIONS };
  }
  return { prompt: 'What usually got in the way?', options: TRIED_OPTIONS };
}
