/**
 * The Coaching Mode Engine — an ordered chain of deterministic rules,
 * first match wins, same "ordered, not scored" style as
 * lib/feed/eligibility.ts's filter chain. Order encodes the milestone's
 * own stated overrides directly:
 *   1. Safety always wins ("immediately lower coaching intensity").
 *   2. A real, multi-day gap is a Reset, not a Recover — coming back from
 *      absence is a different coaching moment than a rough day.
 *   3. A genuinely poor day (today's Daily Wellness Index) is Recovery.
 *   4. Only once nothing above fired does a real win get to be Celebrate.
 *   5. Recent success unlocks Challenge ("recent success allows
 *      progression") — never the other way around.
 *   6. Struggling members are Encouraged, not pushed.
 *   7. No real check-in history yet, or today's rhythm calls for it, is
 *      Educate.
 *   8. Otherwise, Maintain — a steady day needs no dramatic mode.
 */

import type { CoachingMode, CoachingSignals, PriorityCandidate } from './types';

export function pickMode(signals: CoachingSignals, priority: PriorityCandidate): CoachingMode {
  if (signals.hasActiveSafetyConcern) return 'recover';

  if (signals.streak.daysSinceLastCheckin !== null && signals.streak.daysSinceLastCheckin >= 3) {
    return 'reset';
  }

  if (signals.wellnessIndex?.status === 'poor') return 'recover';

  const sustainedConcern = signals.insights.some((i) => i.kind === 'sustained');
  if (sustainedConcern) return 'recover';

  const genuineWin =
    signals.streak.isLongestInWindow ||
    signals.streak.justRecovered ||
    Boolean(signals.recentWin) ||
    signals.insights.some((i) => i.kind === 'trend' && i.direction === 'improving');
  if (genuineWin && signals.wellnessIndex?.status !== 'attention') return 'celebrate';

  if (signals.adherence.level === 'high' && signals.wellnessIndex?.status !== 'attention') {
    return 'challenge';
  }

  if (signals.adherence.level === 'low') return 'encourage';

  if (signals.wellnessIndex === null || priority.focus === 'education') return 'educate';

  return 'maintain';
}
