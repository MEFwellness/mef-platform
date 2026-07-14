/**
 * The living Member Summary — every field traces back to a real,
 * already-computed piece of this run (a trend, a pattern, the Coaching
 * Brain's own decision, a real narrative item) rather than inventing
 * anything new. Kept intentionally small and declarative, same "a
 * restrained handful, never a dashboard" posture
 * app/actions/wellness-intelligence.ts already established for the
 * member-facing view of wellness_insights.
 */

import { areaLabel } from '../intelligence/copy';
import type { CoachingMode } from '../brain/types';
import type {
  CoachingPriorities,
  LongitudinalTrend,
  MemberHealthProfile,
  MemberSummary,
  PatternInsight,
  RootCauseHypothesis,
  WellnessTrajectory,
} from './types';

const COACHING_STYLE_BY_MODE: Record<CoachingMode, string> = {
  encourage: 'Encouraging, low-pressure coaching',
  challenge: 'Challenge-oriented, stretch-focused coaching',
  recover: 'Gentle, recovery-focused coaching',
  educate: 'Education-first coaching',
  celebrate: 'Celebratory, momentum-reinforcing coaching',
  reset: 'A soft reset — light, no-pressure re-engagement',
  maintain: 'Steady, maintenance-focused coaching',
};

function biggestObstacle(
  patterns: PatternInsight[],
  priorities: CoachingPriorities
): string | null {
  const barrier = patterns.find(
    (p) => p.kind === 'repeating_barrier' || p.kind === 'burnout_signal'
  );
  if (barrier) return barrier.description;
  if (priorities.primaryPriority) {
    return `${areaLabel(priorities.primaryPriority)} is currently the area needing the most attention.`;
  }
  return null;
}

function recentWins(profile: MemberHealthProfile): string[] {
  return profile.narrativeItems
    .filter((item) => item.member_visible && item.category === 'recent_wins')
    .slice(0, 3)
    .map((item) => item.summary);
}

function mostImprovedArea(trends: LongitudinalTrend[]): MemberSummary['mostImprovedArea'] {
  const improving = trends
    .filter((t) => t.direction === 'improving')
    .sort((a, b) => b.confidence - a.confidence);
  return improving[0]?.area ?? null;
}

function recommendedNextDiscussion(
  priorities: CoachingPriorities,
  hypotheses: RootCauseHypothesis[]
): string | null {
  const topHypothesis = hypotheses[0];
  if (topHypothesis) return topHypothesis.recommendedCoachingDirection;
  if (priorities.primaryPriority) {
    return `How ${areaLabel(priorities.primaryPriority).toLowerCase()} has been going lately.`;
  }
  return null;
}

function wellnessTrajectory(trends: LongitudinalTrend[]): WellnessTrajectory {
  const withData = trends.filter((t) => t.direction !== 'insufficient_data');
  if (withData.length === 0) return 'insufficient_data';

  const improving = withData.filter((t) => t.direction === 'improving').length;
  const declining = withData.filter((t) => t.direction === 'declining').length;

  if (improving === 0 && declining === 0) return 'stable';
  if (improving > 0 && declining > 0 && Math.abs(improving - declining) <= 1) return 'mixed';
  return improving > declining ? 'improving' : 'declining';
}

export function buildMemberSummary(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[],
  patterns: PatternInsight[],
  hypotheses: RootCauseHypothesis[],
  priorities: CoachingPriorities
): MemberSummary {
  const decision = profile.brainDecision;

  return {
    currentFocus: decision.focusLabel,
    biggestObstacle: biggestObstacle(patterns, priorities),
    recentWins: recentWins(profile),
    mostImprovedArea: mostImprovedArea(trends),
    greatestOpportunity: priorities.primaryPriority,
    currentCoachingStyle: COACHING_STYLE_BY_MODE[decision.mode],
    recommendedNextDiscussion: recommendedNextDiscussion(priorities, hypotheses),
    currentMotivation: decision.encouragement,
    adherenceScore:
      profile.adherence.rate !== null ? Math.round(profile.adherence.rate * 100) : null,
    wellnessTrajectory: wellnessTrajectory(trends),
  };
}
