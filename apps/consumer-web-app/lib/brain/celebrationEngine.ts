/**
 * The Celebration Engine — recognizes real wins automatically, reusing
 * lib/feed/streakIntelligence.ts's own already-conservative gates
 * (isLongestInWindow / justRecovered) rather than re-deriving "is this
 * worth celebrating" a second way. Only fires for the same meaningful
 * subset streakIntelligence itself treats as noteworthy — an ordinary
 * 3+ day streak (which buildStreakMessage will still narrate elsewhere)
 * does not, by itself, trigger a Celebrate mode or override the top-of-
 * page encouragement line here, which is what "celebrate naturally, never
 * overdo it" means in practice: not every good day is treated as a
 * milestone.
 */

import { buildStreakMessage } from '../feed/streakIntelligence';
import type { CoachingSignals } from './types';

export type CelebrationResult = {
  isCelebration: boolean;
  text: string | null;
};

export function pickCelebration(signals: CoachingSignals): CelebrationResult {
  if (signals.streak.isLongestInWindow || signals.streak.justRecovered) {
    const text = buildStreakMessage(signals.streak);
    if (text) return { isCelebration: true, text };
  }

  if (signals.recentWin) {
    return { isCelebration: true, text: signals.recentWin.summary };
  }

  const improving = signals.insights.find((i) => i.kind === 'trend' && i.direction === 'improving');
  if (improving) {
    return { isCelebration: true, text: improving.message };
  }

  return { isCelebration: false, text: null };
}
