/**
 * Adaptive Challenge (Milestone 5's layer on top of Part 8's
 * lib/feed/adaptiveDifficulty.ts) — decides how hard today should be,
 * never whether to punish. A Recover/Reset mode always wins out to
 * 'lighter' regardless of adherence, per "never punish, never shame,
 * always aim for success": a member having a genuinely hard week doesn't
 * get pushed harder just because their adherence number happens to be
 * fine. Otherwise this is a direct pass-through of
 * lib/feed/adaptiveDifficulty.ts's own AdherenceLevel, which already
 * requires a minimum real sample before saying anything at all.
 */

import type { AdherenceLevel } from '../feed/adaptiveDifficulty';
import type { ChallengeLevel, CoachingMode } from './types';

export function pickChallengeLevel(adherence: AdherenceLevel, mode: CoachingMode): ChallengeLevel {
  if (mode === 'recover' || mode === 'reset') return 'lighter';
  if (adherence === 'low') return 'lighter';
  if (adherence === 'high' && mode !== 'encourage') return 'stretch';
  return 'standard';
}
