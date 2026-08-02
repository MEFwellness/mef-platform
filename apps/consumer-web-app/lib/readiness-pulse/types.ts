import type {
  Q1Answer,
  Q2Answer,
  Q3Answer,
  Q4Answer,
  Q5Answer,
  Q6Answer,
  Q7Answer,
  Q9Answer,
  ReadinessPattern,
  Signal,
  TriedBranch,
} from './constants';
import type { LscPattern } from '../life-signal-check/types';
import type { TimeOfDay } from '../life-signal-check/constants';
import type { ValueArea } from '../core-values-snapshot/constants';

export type WillingnessBand = 'low' | 'medium' | 'high';
export type CapacityBand = 'thin' | 'medium' | 'strong';

/** The member's most recently completed Life Signal Check, needed for Question 8's comparison beat and to pick the real target signal/timing for the Ready Now / Ready If It's Small experiment. Always available in practice (Readiness Pulse unlocks only after Life Signal Check completes), degrades gracefully to null otherwise. */
export type LscContextForRpl = {
  loudestSignal: Signal;
  pattern: LscPattern;
  hardestTimeOfDay: TimeOfDay | null;
};

/** The member's most recently completed Core Values Snapshot top value — needed only for the closing screen's "what you are protecting" synthesis card, the third leg of the complete picture alongside Life Signal Check's loudest signal and this session's own readiness. */
export type CvsContextForRpl = {
  topValue: ValueArea;
};

export type RplScoring = {
  q1: Q1Answer;
  triedBranch: TriedBranch;
  q2: Q2Answer | null;
  q3: Q3Answer;
  q4: Q4Answer;
  q5: Q5Answer;
  q6: Q6Answer;
  q7: Q7Answer;
  q8Signal: Signal;
  q9: Q9Answer;

  /** Q4 (0-3) + Q7 (0-3). */
  capacityScore: number;
  /** Q3 (1-3) + 1 for having answered Q8. */
  willingnessScore: number;
  willingnessBand: WillingnessBand;
  capacityBand: CapacityBand;

  /** Computed purely from willingnessBand x capacityBand — see lib/readiness-pulse/scoring.ts's deriveReadinessPattern for the exact 3x3 table. */
  derivedPattern: ReadinessPattern;
  /** Question 9's raw pick — always the "final" pattern for every downstream decision (experiment, copy, coach view), even when it differs from derivedPattern. Same precedence architecture as Life Signal Check's Question 10 pick-wins rule. */
  finalPattern: ReadinessPattern;
  pickDivergedFromDerived: boolean;

  lscContext: LscContextForRpl | null;
  /** 'confirmed' when Question 8's pick matches Life Signal Check's own loudest signal, 'mismatch' when it names a different one — null whenever there is no Life Signal Check session to compare against, or that session's own pattern was quiet_body (nothing was genuinely loud, so there is nothing honest to compare to). */
  q8Comparison: 'confirmed' | 'mismatch' | null;
  /** The real target signal for the Ready Now / Ready If It's Small experiment — Life Signal Check's own loudest signal when it had one, otherwise Question 8's own pick. */
  targetSignal: Signal;

  /** Fires only on a genuine, named-in-the-brief-shaped contradiction between Question 3 and Question 9 (overdue early paired with not yet at the end, or the mirrored case: scared/exhausting early paired with ready now at the end) — never manufactured from a milder combination. */
  surpriseFires: boolean;
};
