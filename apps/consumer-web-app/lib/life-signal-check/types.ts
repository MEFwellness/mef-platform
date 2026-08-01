import type { Signal, Duration, BodyText, TimeOfDay } from './constants';
import type { ValueArea } from '../core-values-snapshot/constants';
import type { CvsBranch } from '../core-values-snapshot/types';

/** Which of the three primary "What Root Learned" branches ran, purely from the count of loud signals. Body-Value Echo and the surprise beat are conditional overlays on top of whichever of these fired, not a fourth mutually-exclusive branch (same shape as Core Values Snapshot's own S1 observation layering on top of its four branches). */
export type LscPattern = 'one_loud' | 'chorus' | 'quiet_body';

/** The member's own completed Core Values Snapshot result, needed only to evaluate the Body-Value Echo adjacency condition. Always available in practice since Life Signal Check unlocks only after Core Values Snapshot completes. */
export type CvsContextForEcho = {
  topValue: ValueArea;
  branch: CvsBranch;
};

export type LscScoring = {
  /** Raw 0-3 loudness score per signal, from the Screen 2 answers. */
  scores: Record<Signal, number>;
  /** Signals scoring 2 or 3. */
  loudSignals: Signal[];
  /** Highest-scoring signal, deterministic tiebreak by canonical SIGNALS order. */
  loudestSignal: Signal;
  /** Question 10's answer — always the "chosen" signal for Root's copy, even when it isn't the loudest. */
  chosenSignal: Signal;
  /** True when the member's Question 10 pick differs from the highest-scoring signal. */
  pickDivergedFromLoudest: boolean;
  pattern: LscPattern;
  duration: Duration;
  bestTimeOfDay: TimeOfDay | null;
  hardestTimeOfDay: TimeOfDay | null;
  bodyText: BodyText | null;
  /** Fires only when Q3 was answered "I'm okay, actually" and at least one Screen 2 signal scored 2 or higher. */
  surpriseFires: boolean;
  /** Fires only when the loudest signal is genuinely adjacent (see adjacency.ts) to the member's Core Values Snapshot top value, and that value's own branch actually has a gap (clear_gap or slipping, not aligned). */
  echoFires: boolean;
  /** True only when Q1 and Q2 both named a specific, different time of day (never_much/varies on either side doesn't count) — the real contrast Root can name between "when you feel like yourself" and "when it's hardest." */
  q1ContrastFires: boolean;
  /** Question 3's early guess at which signal would turn out loudest (constants.ts's BODY_TEXT_SIGNAL_GUESS), null when the member answered "I'm okay, actually" or hasn't answered yet. */
  predictedSignalFromQ3: Signal | null;
  /** Whether Q3's early guess matches what actually turned out loudest — null whenever predictedSignalFromQ3 is null (nothing to compare). The generalized surprise beat: 'confirmed' when the member called it in the first question, 'mismatch' when the loudest signal turned out to be a different one. */
  q3Comparison: 'confirmed' | 'mismatch' | null;
};
