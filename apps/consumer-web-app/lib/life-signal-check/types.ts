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
};
