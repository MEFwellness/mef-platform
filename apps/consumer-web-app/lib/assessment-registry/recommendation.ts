/**
 * Recommendation service (section 8) — selects the single "Recommended
 * Next" assessment for a member, in priority order. Pure: takes the
 * already-computed status/facts for every registered assessment and picks
 * one, or an upgrade invitation when nothing is actionable. Never random,
 * never claims a health-pattern basis — every reason below is a real,
 * stored fact (a coach assignment row, a due reassessment schedule, an
 * in-progress draft, a phase match, or simple registry ordering).
 */

import { listAssessmentRegistryEntries } from './registry';
import type { AssessmentKey } from './types';
import {
  calculateAssessmentStatus,
  type AssessmentStatus,
  type MemberAssessmentFacts,
} from './status';

export type RecommendationReason =
  | 'coach_assigned'
  | 'required_reassessment'
  | 'in_progress'
  | 'required_phase'
  | 'recommended_next'
  | 'available_optional'
  | 'upgrade_invitation';

export type Recommendation =
  | { key: AssessmentKey; reason: RecommendationReason }
  | { key: null; reason: 'upgrade_invitation' };

function isReassessmentDue(facts: MemberAssessmentFacts, now: Date): boolean {
  return Boolean(
    facts.pendingReassessmentSchedule && new Date(facts.pendingReassessmentSchedule.dueAt) <= now
  );
}

export function pickRecommendation(
  factsByKey: ReadonlyMap<AssessmentKey, MemberAssessmentFacts>,
  now: Date = new Date()
): Recommendation {
  const entries = listAssessmentRegistryEntries();

  const statusByKey = new Map<AssessmentKey, AssessmentStatus>();
  for (const entry of entries) {
    const facts = factsByKey.get(entry.key);
    if (!facts) continue;
    statusByKey.set(entry.key, calculateAssessmentStatus(entry, facts).status);
  }

  // 1. Coach-assigned — an explicit human decision always wins.
  const coachAssigned = entries.find((e) => statusByKey.get(e.key) === 'coach_assigned');
  if (coachAssigned) return { key: coachAssigned.key, reason: 'coach_assigned' };

  // 2. An available required reassessment whose due date has arrived.
  const dueReassessment = entries.find((e) => {
    const facts = factsByKey.get(e.key);
    return facts && isReassessmentDue(facts, now);
  });
  if (dueReassessment) return { key: dueReassessment.key, reason: 'required_reassessment' };

  // 3. In-progress — finish what's already started before starting something new.
  const inProgress = entries.find((e) => statusByKey.get(e.key) === 'in_progress');
  if (inProgress) return { key: inProgress.key, reason: 'in_progress' };

  // 4. A required assessment for the member's current program phase.
  const requiredPhase = entries.find((e) => {
    const facts = factsByKey.get(e.key);
    return (
      e.program.programOnly &&
      facts?.enrollment?.currentPhaseKey === e.program.programPhase &&
      statusByKey.get(e.key) === 'available'
    );
  });
  if (requiredPhase) return { key: requiredPhase.key, reason: 'required_phase' };

  // 5/6. Next available assessment, registry display order (lowest first).
  const available = entries
    .filter((e) => statusByKey.get(e.key) === 'available')
    .sort((a, b) => a.displayOrder - b.displayOrder);
  if (available.length > 0) {
    return {
      key: available[0]!.key,
      reason: available.length === 1 ? 'recommended_next' : 'available_optional',
    };
  }

  // 7. Nothing actionable — invite an upgrade/program step instead of recommending nothing.
  return { key: null, reason: 'upgrade_invitation' };
}
