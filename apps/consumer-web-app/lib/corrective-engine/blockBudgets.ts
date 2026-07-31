/**
 * The severity dial — how many exercises each of the 5 MEF Method blocks
 * gets, per the task's own spec:
 *   Mild:     blocks 1-3 as a compact corrective warm-up (~15 min), full
 *             strength block.
 *   Moderate: expanded blocks 1-3 as a dedicated corrective block, reduced
 *             strength block.
 *   Severe:   weeks 1-4 are corrective-only (blocks 1-3 + core), strength
 *             introduced after (i.e. never in this generated 4-week
 *             phase — strength budget is 0, and the Strength section is
 *             omitted from the session entirely, not just left empty).
 *
 * Every tier's total sits inside the task's 8-12 exercises/session cap —
 * proven by a guard test, not just by these numbers looking right.
 */
import type { CorrectiveSeverity } from './types';

export interface BlockBudget {
  release: number;
  mobility: number;
  stability: number;
  strength: number;
  core: number;
}

export const BLOCK_BUDGETS: Record<CorrectiveSeverity, BlockBudget> = {
  mild: { release: 1, mobility: 1, stability: 2, strength: 5, core: 1 },
  moderate: { release: 2, mobility: 2, stability: 3, strength: 3, core: 1 },
  severe: { release: 3, mobility: 3, stability: 4, strength: 0, core: 2 },
};
