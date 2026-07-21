/**
 * Layer 3 — "What should today's strategy be?" Composes the ordered set of
 * strategy blocks (breathing, mobility, activation, stability, strength,
 * power, conditioning, recovery — the same Program Section taxonomy every
 * other part of this codebase reuses, see movement.types.ts's header) a
 * prescription needs, before any exercise is ever searched for. Not every
 * block exists every run — inclusion is a deterministic function of
 * readiness, constraints, corrective priorities, and goals, same
 * "deterministic logic first" philosophy as lib/movement/rules/engine.ts.
 * Movement quality and corrective priorities always take precedence over
 * fitness goals: Strength/Power/Conditioning are only ever included when
 * readiness and constraints allow it; Breathing/Mobility/Recovery are
 * included whenever a real constraint calls for them, regardless of goals.
 * Pure functions — no Supabase access — fully unit testable.
 */

import type { PrescriptionBlockType } from '@mef/shared-types-contracts';
import { MOVEMENT_SESSION_SECTION_LABEL } from '@mef/shared-types-contracts';
import type { PrescriptionFacts } from './facts';
import type { PrescriptionConstraintDraft } from './constraints';

export type ReadinessTier = 'rest' | 'limited' | 'moderate' | 'ready';

/** Mirrors lib/movement/rules/engine.ts's decideRecoveryStatus — same conservative shape, independently derived here since this engine's facts/constraints are its own domain. */
export function decideReadinessTier(
  facts: PrescriptionFacts,
  constraints: PrescriptionConstraintDraft[]
): ReadinessTier {
  const recoveryScore = facts.wearableSnapshot?.recoveryScore ?? null;
  if (recoveryScore != null) {
    if (recoveryScore >= 67) return 'ready';
    if (recoveryScore >= 34) return 'moderate';
    return 'limited';
  }

  const pain = facts.latestCheckin?.painLevel ?? null;
  if (pain != null && pain >= 4) return 'rest';

  if (!facts.latestCheckin) {
    // No blocking constraint reached the gate, but there's also no
    // readiness signal to reason from — a moderate, conservative default
    // rather than assuming the best.
    return constraints.length > 0 ? 'moderate' : 'moderate';
  }

  const poorSignalCount = [
    pain != null && pain >= 3,
    (facts.latestCheckin.stressLevel ?? 0) >= 4,
    (facts.latestCheckin.sleepQuality ?? 5) <= 2,
  ].filter(Boolean).length;

  if (poorSignalCount >= 2) return 'limited';
  if (poorSignalCount === 1) return 'moderate';
  return 'ready';
}

export type StrategyBlockDraft = {
  blockType: PrescriptionBlockType;
  primaryObjective: string;
  secondaryObjective: string | null;
  requiredMovementTags: string[];
  preferredMovementTags: string[];
  excludedTags: string[];
  equipment: string[];
  difficulty: 'beginner' | 'intermediate';
  movementPattern: string | null;
  timeAllocationSeconds: number;
  exerciseCategory: string;
  blockReasoning: string;
};

const BLOCK_WEIGHT: Record<PrescriptionBlockType, number> = {
  preparation: 1,
  breathing: 1,
  mobility: 2,
  activation: 1.5,
  stability: 1.5,
  strength: 3,
  power: 2,
  conditioning: 2,
  recovery: 1.5,
};

/** Per-block exercise slot count — mirrors lib/movement/rules/engine.ts's decideExerciseCount shape. */
export const EXERCISE_COUNT_BY_BLOCK: Record<PrescriptionBlockType, number> = {
  preparation: 1,
  breathing: 1,
  mobility: 2,
  activation: 2,
  stability: 2,
  strength: 3,
  power: 2,
  conditioning: 1,
  recovery: 1,
};

const INSTABILITY_KEYWORDS = [
  'instability',
  'valgus',
  'ankle',
  'foot dysfunction',
  'scapular',
  'hip',
];
const PERFORMANCE_GOAL_KEYWORDS = ['athletic performance', 'golf performance', 'power'];
const CONDITIONING_GOAL_KEYWORDS = [
  'fat loss',
  'general fitness',
  'athletic performance',
  'longevity',
];

function hasConstraint(
  constraints: PrescriptionConstraintDraft[],
  type: PrescriptionConstraintDraft['constraintType']
): boolean {
  return constraints.some((c) => c.constraintType === type);
}

function findConstraint(
  constraints: PrescriptionConstraintDraft[],
  type: PrescriptionConstraintDraft['constraintType']
): PrescriptionConstraintDraft | undefined {
  return constraints.find((c) => c.constraintType === type);
}

function matchesAnyKeyword(values: string[], keywords: string[]): boolean {
  return values.some((v) => keywords.some((k) => v.toLowerCase().includes(k)));
}

/** Decides which blocks exist for this run, in Program Section order — same discipline as lib/movement/rules/engine.ts's decideSections, generalized to also weigh corrective priorities and goals, not just recovery status. */
export function decideIncludedBlocks(
  tier: ReadinessTier,
  constraints: PrescriptionConstraintDraft[],
  correctivePriorities: string[],
  goals: string[]
): PrescriptionBlockType[] {
  const included: PrescriptionBlockType[] = ['preparation'];

  const needsBreathingFirst =
    hasConstraint(constraints, 'poor_breathing') ||
    hasConstraint(constraints, 'high_stress') ||
    hasConstraint(constraints, 'sleep_deprivation') ||
    hasConstraint(constraints, 'pain') ||
    tier !== 'ready';
  if (needsBreathingFirst) included.push('breathing');

  const needsMobility =
    hasConstraint(constraints, 'limited_mobility') ||
    hasConstraint(constraints, 'movement_dysfunction') ||
    correctivePriorities.length > 0 ||
    tier !== 'ready';
  if (needsMobility) included.push('mobility');

  if (tier === 'moderate' || tier === 'ready') included.push('activation');

  const needsStability = matchesAnyKeyword(correctivePriorities, INSTABILITY_KEYWORDS);
  if (needsStability) included.push('stability');

  // Movement quality first, always: never load a dysfunctional pattern
  // just because it supports a fitness goal — strength/power only ever
  // enter the plan once readiness and pain constraints allow loading.
  const canLoad = tier !== 'rest' && tier !== 'limited' && !hasConstraint(constraints, 'pain');
  if (canLoad) included.push('strength');

  const wantsPower =
    canLoad &&
    tier === 'ready' &&
    !needsStability &&
    matchesAnyKeyword(goals, PERFORMANCE_GOAL_KEYWORDS);
  if (wantsPower) included.push('power');

  const wantsConditioning =
    canLoad &&
    (tier === 'moderate' || tier === 'ready') &&
    matchesAnyKeyword(goals, CONDITIONING_GOAL_KEYWORDS);
  if (wantsConditioning) included.push('conditioning');

  included.push('recovery');

  return included;
}

function describeBlock(
  blockType: PrescriptionBlockType,
  facts: PrescriptionFacts,
  constraints: PrescriptionConstraintDraft[],
  correctivePriorities: string[],
  goals: string[],
  tier: ReadinessTier
): Pick<
  StrategyBlockDraft,
  | 'primaryObjective'
  | 'secondaryObjective'
  | 'requiredMovementTags'
  | 'preferredMovementTags'
  | 'movementPattern'
  | 'blockReasoning'
> {
  switch (blockType) {
    case 'preparation':
      return {
        primaryObjective: 'General warm-up to raise tissue temperature before targeted work.',
        secondaryObjective: null,
        requiredMovementTags: [],
        preferredMovementTags: [],
        movementPattern: 'general_warmup',
        blockReasoning:
          'A short general warm-up is included in every session before targeted work begins.',
      };

    case 'breathing': {
      const breathingConstraint = findConstraint(constraints, 'poor_breathing');
      const stressConstraint = findConstraint(constraints, 'high_stress');
      const reason =
        breathingConstraint?.description ??
        stressConstraint?.description ??
        `Today's readiness tier ("${tier}") calls for priming the nervous system before any loading.`;
      return {
        primaryObjective: 'Prime diaphragmatic breathing before any loading.',
        secondaryObjective: 'Support a nervous-system downshift.',
        requiredMovementTags: ['breathing'],
        preferredMovementTags: [],
        movementPattern: 'breath',
        blockReasoning: `Breathing was placed first because ${reason}`,
      };
    }

    case 'mobility': {
      const mobilityConstraint =
        findConstraint(constraints, 'limited_mobility') ??
        findConstraint(constraints, 'movement_dysfunction');
      const reason = mobilityConstraint
        ? mobilityConstraint.description
        : correctivePriorities.length > 0
          ? `your coach-set corrective priorities include ${correctivePriorities.slice(0, 2).join(', ')}.`
          : `today's readiness tier ("${tier}") calls for restoring range of motion before loading.`;
      return {
        primaryObjective: 'Restore range of motion in the areas that most need it before loading.',
        secondaryObjective: null,
        requiredMovementTags: correctivePriorities,
        preferredMovementTags: [],
        movementPattern: 'mobility',
        blockReasoning: `Mobility was prioritized because ${reason}`,
      };
    }

    case 'activation':
      return {
        primaryObjective:
          "Activate the muscles that support today's corrective priorities before they are loaded.",
        secondaryObjective: null,
        requiredMovementTags: correctivePriorities,
        preferredMovementTags: goals,
        movementPattern: 'activation',
        blockReasoning: `Activation is included because today's readiness tier ("${tier}") supports it, and it prepares the areas targeted by mobility work for the loading blocks that follow.`,
      };

    case 'stability': {
      const matched = correctivePriorities.filter((p) =>
        INSTABILITY_KEYWORDS.some((k) => p.toLowerCase().includes(k))
      );
      return {
        primaryObjective:
          'Build joint stability in the areas flagged for instability before adding load or power.',
        secondaryObjective: null,
        requiredMovementTags: matched,
        preferredMovementTags: [],
        movementPattern: 'stability',
        blockReasoning: `Stability work was prioritized because your corrective priorities identify ${matched.join(', ') || 'an instability pattern'} — movement quality is addressed before load or power.`,
      };
    }

    case 'strength':
      return {
        primaryObjective:
          "Build strength within the movement patterns cleared by today's corrective and stability work.",
        secondaryObjective:
          goals.length > 0 ? `Support member goals: ${goals.slice(0, 2).join(', ')}.` : null,
        requiredMovementTags: [],
        preferredMovementTags: [...correctivePriorities, ...goals],
        movementPattern: null,
        blockReasoning: `Strength work is included because today's readiness tier ("${tier}") and check-in show no pain that would contraindicate loading.`,
      };

    case 'power': {
      const matchedGoal = goals.find((g) =>
        PERFORMANCE_GOAL_KEYWORDS.some((k) => g.toLowerCase().includes(k))
      );
      return {
        primaryObjective:
          'Develop explosive output now that mobility, stability, and strength have been addressed.',
        secondaryObjective: null,
        requiredMovementTags: [],
        preferredMovementTags: goals,
        movementPattern: null,
        blockReasoning: `Power work is included because today's readiness tier is "ready", no instability was flagged, and the member's goal (${matchedGoal ?? 'athletic performance'}) supports it — power is never loaded ahead of movement quality.`,
      };
    }

    case 'conditioning': {
      const matchedGoal = goals.find((g) =>
        CONDITIONING_GOAL_KEYWORDS.some((k) => g.toLowerCase().includes(k))
      );
      return {
        primaryObjective: "Build work capacity in support of the member's stated goal.",
        secondaryObjective: null,
        requiredMovementTags: [],
        preferredMovementTags: goals,
        movementPattern: null,
        blockReasoning: `Conditioning is included because today's readiness tier ("${tier}") supports it and it supports the member's goal (${matchedGoal ?? 'general fitness'}).`,
      };
    }

    case 'recovery':
    default: {
      const drivingConstraint = constraints[0];
      return {
        primaryObjective: 'Close the session with parasympathetic-supporting work.',
        secondaryObjective: null,
        requiredMovementTags: [],
        preferredMovementTags: [],
        movementPattern: 'recovery',
        blockReasoning: drivingConstraint
          ? `Recovery closes every session, and is extended today because ${drivingConstraint.description.toLowerCase()}`
          : 'Recovery closes every session to support parasympathetic downshift after loading.',
      };
    }
  }
}

/** Layer 3 — builds the ordered strategy blocks for this run. Time is split proportionally across included blocks by a fixed per-block weight (strength/mobility/conditioning get more time than a short breathing or preparation block), floored at 60 seconds per block. */
export function buildStrategyBlocks(
  facts: PrescriptionFacts,
  constraints: PrescriptionConstraintDraft[],
  goals: string[],
  correctivePriorities: string[],
  equipment: string[],
  timeAvailableMinutes: number
): StrategyBlockDraft[] {
  const tier = decideReadinessTier(facts, constraints);
  const difficulty: 'beginner' | 'intermediate' =
    tier === 'rest' || tier === 'limited' || hasConstraint(constraints, 'pain')
      ? 'beginner'
      : 'intermediate';

  const included = decideIncludedBlocks(tier, constraints, correctivePriorities, goals);
  const totalWeight = included.reduce((sum, b) => sum + BLOCK_WEIGHT[b], 0);
  const totalSeconds = Math.max(timeAvailableMinutes, 10) * 60;

  const restrictions = [
    ...(facts.movementProfile?.exercise_restrictions ?? []),
    ...(facts.movementProfile?.contraindications ?? []),
    ...(facts.movementProfile?.medical_restrictions ?? []),
  ];

  return included.map((blockType) => {
    const described = describeBlock(
      blockType,
      facts,
      constraints,
      correctivePriorities,
      goals,
      tier
    );
    const seconds = Math.max(
      60,
      Math.round((BLOCK_WEIGHT[blockType] / totalWeight) * totalSeconds)
    );
    return {
      blockType,
      ...described,
      excludedTags: restrictions,
      equipment,
      difficulty,
      timeAllocationSeconds: seconds,
      // 'power' falls back to searching the 'strength' catalog if no
      // 'power'-tagged content exists yet — see exerciseSelection.ts.
      exerciseCategory: blockType,
    };
  });
}

export function blockLabel(blockType: PrescriptionBlockType): string {
  return MOVEMENT_SESSION_SECTION_LABEL[blockType];
}
