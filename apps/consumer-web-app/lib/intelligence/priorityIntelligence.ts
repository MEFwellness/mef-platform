/**
 * Priority Intelligence (section 6) — the member's longer-term priority
 * picture, derived purely from this same run's trend/strength drafts.
 * This informs the Coaching Brain (lib/brain/service.ts consumes
 * `primaryPriority` as one signal among many) but never replaces its
 * daily decision — see that module's own docblock for the "do not allow
 * stale insights to control current coaching indefinitely" discipline.
 */

import type { WellnessArea } from '@mef/shared-types-contracts';
import type { PriorityIntelligence, WellnessInsightDraft } from './types';

const CONCERN_STATES = new Set(['declining', 'recurring_pattern', 'newly_emerging']);
const SEVERITY_RANK: Record<WellnessInsightDraft['severity'], number> = {
  important: 2,
  notable: 1,
  info: 0,
};

export function computePriorityIntelligence(
  trendDrafts: WellnessInsightDraft[],
  strengthDrafts: WellnessInsightDraft[]
): PriorityIntelligence {
  const areaTrends = trendDrafts.filter((d) => d.wellnessArea !== null);

  const concerns = areaTrends
    .filter((d) => d.trendState && CONCERN_STATES.has(d.trendState))
    .sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence
    );

  const primary = concerns[0] ?? null;
  const secondary = concerns.find((d) => d.wellnessArea !== primary?.wellnessArea) ?? null;

  const newlyEmerging = areaTrends.find((d) => d.trendState === 'newly_emerging');
  const emergingConcern =
    newlyEmerging && newlyEmerging.wellnessArea !== primary?.wellnessArea
      ? newlyEmerging.wellnessArea
      : (newlyEmerging?.wellnessArea ?? null);

  const sustainableHabit = strengthDrafts.find((d) =>
    d.patternKey.startsWith('sustainable_habit_')
  );
  const stableTrend = areaTrends
    .filter((d) => d.trendState === 'stable')
    .sort((a, b) => b.confidence - a.confidence)[0];
  const areaToMaintain: WellnessArea | null =
    sustainableHabit?.wellnessArea ?? stableTrend?.wellnessArea ?? null;

  const strongestFromStrength = strengthDrafts.find((d) =>
    d.patternKey.startsWith('strongest_area_')
  );
  const improvingTrend = areaTrends
    .filter((d) => d.trendState === 'improving')
    .sort((a, b) => b.confidence - a.confidence)[0];
  const strongestCurrentArea: WellnessArea | null =
    strongestFromStrength?.wellnessArea ?? improvingTrend?.wellnessArea ?? null;

  let recommendedCoachAttentionLevel: PriorityIntelligence['recommendedCoachAttentionLevel'] =
    'none';
  if (concerns.some((d) => d.severity === 'important')) recommendedCoachAttentionLevel = 'priority';
  else if (concerns.some((d) => d.severity === 'notable'))
    recommendedCoachAttentionLevel = 'discuss';
  else if (concerns.length > 0) recommendedCoachAttentionLevel = 'monitor';

  return {
    primaryPriority: primary?.wellnessArea ?? null,
    secondaryPriority: secondary?.wellnessArea ?? null,
    areaToMaintain,
    emergingConcern,
    strongestCurrentArea,
    recommendedCoachAttentionLevel,
  };
}
