/**
 * Safety Integration (Milestone 5) — the Brain's risk read never
 * classifies anything itself; it only reflects what Milestone 1's
 * classifier/escalation pipeline has already decided
 * (lib/safety/service.ts, surfaced here as
 * CoachingSignals.hasActiveSafetyConcern) plus today's own Daily Wellness
 * Index / sustained-insight signals. 'elevated' can therefore never be
 * reached by anything computed in this module — only by the real safety
 * layer — which is what "respect existing escalation logic, never bypass
 * it" means in practice.
 */

import type { CoachingSignals, RiskLevel } from './types';

export function pickRiskLevel(signals: CoachingSignals): RiskLevel {
  if (signals.hasActiveSafetyConcern) return 'elevated';

  const sustainedConcern = signals.insights.some((i) => i.kind === 'sustained');
  if (signals.wellnessIndex?.status === 'poor' || sustainedConcern) return 'watch';

  return 'none';
}
