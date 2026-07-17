/**
 * The Movement Intelligence decision engine — runs BEFORE any AI is
 * involved, same philosophy as lib/ai/rules/engine.ts ("deterministic
 * logic first, AI enhances later, never replaces it"). Given a member's
 * real MovementFacts, this module decides:
 *
 *   1. recovery status (decideRecoveryStatus)
 *   2. how long today's session should be (decideSessionLengthMinutes)
 *   3. which of the seven session sections to include (decideSections)
 *   4. how many exercise slots each included section gets
 *   5. which catalog exercises fill those slots, through whichever
 *      MovementExerciseProvider is configured (selectExercisesForSection)
 *   6. the plain-language "why" behind all of the above
 *      (buildSelectionReasons) — every line traces to a real fact,
 *      never a canned sentence.
 *
 * This is a composition of pure functions over already-gathered facts,
 * the same shape as lib/intelligence-engine/*.ts, rather than the generic
 * jsonb condition-grammar lib/ai/rules/engine.ts uses — a single insight
 * match doesn't fit a multi-section, multi-exercise session plan, but the
 * "deterministic first" discipline is identical. Building an actual AI
 * layer on top later means calling this engine first and letting AI
 * annotate/explain its output, never replacing it.
 */

import type {
  MovementDifficulty,
  MovementEquipment,
  MovementExercise,
  MovementRecoveryStatus,
  MovementSelectionFactor,
  MovementSessionSection,
} from '@mef/shared-types-contracts';
import { MOVEMENT_SESSION_SECTION_ORDER } from '@mef/shared-types-contracts';
import type { MovementExerciseFilter, MovementExerciseProvider } from '../providers/types';
import type { MovementFacts } from './facts';

export function decideRecoveryStatus(facts: MovementFacts): MovementRecoveryStatus {
  if (facts.wearableSnapshot?.recoveryScore != null) {
    const score = facts.wearableSnapshot.recoveryScore;
    if (score >= 67) return 'ready';
    if (score >= 34) return 'moderate';
    return 'limited';
  }

  if (facts.painLevel != null && facts.painLevel >= 4) return 'rest';

  const poorSignals = [
    facts.painLevel != null && facts.painLevel >= 3,
    facts.stressLevel != null && facts.stressLevel >= 4,
    facts.sleepQuality != null && facts.sleepQuality <= 2,
  ].filter(Boolean).length;

  const anySignal =
    facts.painLevel != null || facts.stressLevel != null || facts.sleepQuality != null;

  if (!anySignal) return 'unknown';
  if (poorSignals >= 2) return 'limited';
  if (poorSignals === 1) return 'moderate';
  return 'ready';
}

const SESSION_LENGTH_MINUTES: Record<MovementRecoveryStatus, number> = {
  rest: 10,
  limited: 20,
  moderate: 30,
  ready: 40,
  unknown: 25,
};

export function decideSessionLengthMinutes(recoveryStatus: MovementRecoveryStatus): number {
  return SESSION_LENGTH_MINUTES[recoveryStatus];
}

const SECTIONS_BY_RECOVERY: Record<MovementRecoveryStatus, MovementSessionSection[]> = {
  rest: ['preparation', 'breathing', 'recovery'],
  limited: ['preparation', 'breathing', 'mobility', 'recovery'],
  unknown: ['preparation', 'breathing', 'mobility', 'recovery'],
  moderate: ['preparation', 'breathing', 'mobility', 'activation', 'recovery'],
  ready: MOVEMENT_SESSION_SECTION_ORDER,
};

export function decideSections(recoveryStatus: MovementRecoveryStatus): MovementSessionSection[] {
  return SECTIONS_BY_RECOVERY[recoveryStatus];
}

export function decideExerciseCount(
  section: MovementSessionSection,
  recoveryStatus: MovementRecoveryStatus
): number {
  if (section === 'preparation' || section === 'breathing' || section === 'conditioning') return 1;
  if (section === 'recovery') return recoveryStatus === 'rest' ? 2 : 1;
  return recoveryStatus === 'ready' ? 2 : 1;
}

/**
 * Deliberately conservative: the engine never auto-selects 'advanced' —
 * an advanced exercise only reaches a session through the member
 * explicitly tapping "make this harder" on an intermediate pick (see
 * MovementExercise.harder_variation_id). Low energy or a limited/rest
 * recovery status drops to 'beginner'; otherwise 'intermediate'.
 */
export function selectDifficulty(
  facts: MovementFacts,
  recoveryStatus: MovementRecoveryStatus
): MovementDifficulty {
  if (recoveryStatus === 'rest' || recoveryStatus === 'limited') return 'beginner';
  if (facts.energyLevel != null && facts.energyLevel <= 2) return 'beginner';
  return 'intermediate';
}

/**
 * Assumed available whenever no equipment-preference capture exists yet
 * (facts.equipmentAvailable is null) — bodyweight plus a mat/floor/towel,
 * since assuming literally zero equipment would silently empty out every
 * section whose catalog entries use a mat (mobility, activation, recovery
 * all lean on it), which is a worse default than assuming the one piece
 * of "equipment" nearly every home has.
 */
const DEFAULT_ASSUMED_EQUIPMENT: MovementEquipment[] = ['none', 'mat'];

/**
 * Fetches candidates for one section, relaxing constraints in a fixed,
 * documented order if the (deliberately tiny, placeholder) catalog can't
 * satisfy every constraint at once — equipment availability is the one
 * constraint never relaxed, since suggesting an exercise the member can't
 * actually perform would be worse than repeating one from last time.
 */
export async function selectExercisesForSection(
  section: MovementSessionSection,
  count: number,
  facts: MovementFacts,
  difficulty: MovementDifficulty,
  provider: MovementExerciseProvider
): Promise<MovementExercise[]> {
  const availableEquipment = facts.equipmentAvailable ?? DEFAULT_ASSUMED_EQUIPMENT;

  const attempts: Array<{ difficulty?: MovementDifficulty; excludeExerciseIds?: string[] }> = [
    { difficulty, excludeExerciseIds: facts.lastSessionExerciseIds },
    { excludeExerciseIds: facts.lastSessionExerciseIds },
    {},
  ];

  for (const attempt of attempts) {
    const filter: MovementExerciseFilter = { category: section, availableEquipment };
    if (attempt.difficulty) filter.difficulty = attempt.difficulty;
    if (attempt.excludeExerciseIds) filter.excludeExerciseIds = attempt.excludeExerciseIds;

    const candidates = await provider.listExercises(filter);
    if (candidates.length >= count) return candidates.slice(0, count);
    if (attempt === attempts[attempts.length - 1]) return candidates;
  }
  return [];
}

function describeRecoveryFactor(
  recoveryStatus: MovementRecoveryStatus,
  facts: MovementFacts
): MovementSelectionFactor | null {
  if (facts.wearableSnapshot?.recoveryScore != null) {
    return {
      label: `Wearable recovery score: ${facts.wearableSnapshot.recoveryScore}`,
      domain: 'wearable',
      detail: `Your connected device reported a recovery score of ${facts.wearableSnapshot.recoveryScore}, which set today's session at "${recoveryStatus}."`,
    };
  }
  if (recoveryStatus === 'unknown') return null;
  return {
    label: `Recovery status: ${recoveryStatus}`,
    domain: 'recovery',
    detail: 'Based on your recent pain, stress, and sleep check-ins.',
  };
}

/**
 * Every entry here traces to a real, non-null fact — nothing is a canned
 * line unrelated to this member's actual data, same discipline as
 * lib/ai/rules/engine.ts's renderTemplate.
 */
export function buildSelectionReasons(
  facts: MovementFacts,
  recoveryStatus: MovementRecoveryStatus
): MovementSelectionFactor[] {
  const reasons: MovementSelectionFactor[] = [];

  const recoveryFactor = describeRecoveryFactor(recoveryStatus, facts);
  if (recoveryFactor) reasons.push(recoveryFactor);

  if (facts.painLevel != null && facts.painLevel > 0) {
    reasons.push({
      label: `Pain reported: ${facts.painLevel}/5`,
      domain: 'pain',
      detail:
        'Today’s session favors gentler patterns and lower intensity in response to your latest check-in.',
    });
  }

  if (facts.stressLevel != null && facts.stressLevel >= 4) {
    reasons.push({
      label: `Elevated stress: ${facts.stressLevel}/5`,
      domain: 'stress',
      detail: 'Extra breathing and mobility work is prioritized to support a nervous-system reset.',
    });
  }

  if (facts.sleepQuality != null && facts.sleepQuality <= 2) {
    reasons.push({
      label: `Below-average sleep quality: ${facts.sleepQuality}/5`,
      domain: 'sleep',
      detail: 'Session length and intensity are scaled back to match your reported recovery.',
    });
  }

  if (facts.energyLevel != null && facts.energyLevel <= 2) {
    reasons.push({
      label: `Low energy: ${facts.energyLevel}/5`,
      domain: 'energy',
      detail: 'Exercise difficulty is kept at a beginner level today.',
    });
  }

  for (const finding of facts.activeFindings.slice(0, 3)) {
    reasons.push({
      label: finding.label.replace(/_/g, ' '),
      domain: 'posture_finding',
      detail: 'From your Guided Posture & Movement Assessment results.',
    });
  }

  if (facts.daysSinceLastSession != null && facts.daysSinceLastSession >= 3) {
    reasons.push({
      label: `${facts.daysSinceLastSession} days since your last session`,
      domain: 'session_history',
      detail: 'Easing back in with a more foundational session.',
    });
  } else if (facts.sessionsCompletedLast7Days > 0) {
    reasons.push({
      label: `${facts.sessionsCompletedLast7Days} session${facts.sessionsCompletedLast7Days === 1 ? '' : 's'} completed this week`,
      domain: 'session_history',
      detail: 'Building on your recent consistency.',
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      label: 'Starting with a balanced foundation',
      domain: 'baseline',
      detail:
        'No check-in or assessment data yet — today’s session covers preparation, mobility, and recovery as a safe starting point.',
    });
  }

  return reasons;
}

const FOCUS_BY_LEAD_SECTION: Partial<Record<MovementSessionSection, string>> = {
  strength: 'Strength & conditioning',
  conditioning: 'Conditioning & strength',
  activation: 'Activation & mobility',
  mobility: 'Mobility & recovery',
  recovery: 'Gentle recovery & breathing',
};

/** Headline shown on the Movement Dashboard before any exercise is visible — derived from the most demanding section actually included, never a generic "Today's Workout" label. */
export function buildFocusSummary(sections: MovementSessionSection[]): string {
  const priorityOrder: MovementSessionSection[] = [
    'strength',
    'conditioning',
    'activation',
    'mobility',
    'recovery',
  ];
  const lead = priorityOrder.find((s) => sections.includes(s));
  return lead ? FOCUS_BY_LEAD_SECTION[lead]! : 'Gentle recovery & breathing';
}
