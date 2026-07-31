import type { ValueArea } from './constants';

export type GapClassification = 'clear_gap' | 'slipping' | 'aligned';

/** Which of the four Beat 3 copy branches ran — split takes priority over the gap classification whenever it fires. */
export type CvsBranch = 'clear_gap' | 'aligned' | 'split' | 'slipping';

export type CvsScoring = {
  /** Final importance per area, 0-8 (Q1-Q4 + Q11 + Q12 combined). */
  importance: Record<ValueArea, number>;
  /** Raw 1-5 attention rating per area, from the Screen 2 sliders. */
  attention: Record<ValueArea, number>;
  topValue: ValueArea;
  runnerUpValue: ValueArea;
  gapClassification: GapClassification;
  /** True when the Q11 pick scored 0 across Q1-Q4 (before Q11/Q12 were added). */
  split: boolean;
  branch: CvsBranch;
  /** The area named in the member's Q3 guilt-completion answer. */
  guiltArea: ValueArea;
  /** Q3's guilt-area attention rating — used both for gap wording and the S1 conditional observation. */
  guiltAreaAttention: number;
  /** Fires only when guiltAreaAttention >= 4 and the branch isn't 'split' (no observation stacks on the split branch). */
  s1Fires: boolean;
  q11Pick: ValueArea;
  q4Answer: ValueArea;
  q12Winner: ValueArea;
};
