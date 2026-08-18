/**
 * Shared types for the corrective program generator engine — turns a
 * member's posture-assessment findings into a 4-week, coach-reviewable
 * program draft built from the MEF Method session template (release ->
 * mobility -> stability -> strength -> core). See blueprints.ts,
 * patternMapping.ts, sessionBuilder.ts, programGenerator.ts.
 */
import type { CorrectiveRole, StrainLevel } from '../exercise-library/correctiveClassification';

export type BlueprintKey = 'lower_cross' | 'upper_cross' | 'forward_head' | 'flat_back';

export const BLUEPRINT_KEYS: readonly BlueprintKey[] = [
  'lower_cross',
  'upper_cross',
  'forward_head',
  'flat_back',
];

export type CorrectiveSeverity = 'mild' | 'moderate' | 'severe';

export const SEVERITY_RANK: Record<CorrectiveSeverity, number> = {
  mild: 1,
  moderate: 2,
  severe: 3,
};

/**
 * program_tags entry carrying the severity a saved draft's dosing was read
 * at, e.g. "corrective-severity:moderate". Written by save.ts, read back
 * by the coach review screen so an exercise a coach ADDS to a block is
 * dosed from the same table, at the same tier, as the generated ones.
 *
 * A tag rather than a sentence inside coach_notes: coach_notes is free
 * text a coach edits, and structured data does not belong in it.
 */
export const SEVERITY_TAG_PREFIX = 'corrective-severity:';

/** The severity a saved draft was generated at. Falls back to 'moderate' (the middle tier) for a draft saved before the tag existed. */
export function readSeverityTag(programTags: string[]): CorrectiveSeverity {
  const tag = programTags.find((t) => t.startsWith(SEVERITY_TAG_PREFIX));
  const value = tag?.slice(SEVERITY_TAG_PREFIX.length);
  return value === 'mild' || value === 'moderate' || value === 'severe' ? value : 'moderate';
}

/** One blueprint muscle slot — `canonicalLabels` are the exact strings that appear in mef_exercise_metadata.muscles_stretched/muscles_strengthened (a slot can have more than one, e.g. "lower/mid traps" matches either "lower traps" or "mid traps"). */
export interface MuscleSlot {
  muscle: string;
  canonicalLabels: string[];
}

export interface CorrectiveBlueprint {
  key: BlueprintKey;
  name: string;
  /** Tight muscles — candidates for the Release (role: release) and Mobility (role: stretch/mobility) blocks. */
  tightMuscles: MuscleSlot[];
  /** Long muscles — candidates for the Stability block (role: stability/strength/power). */
  longMuscles: MuscleSlot[];
  /** Subset of longMuscles' `muscle` values that must be filled with core_stability-role exercises specifically (e.g. Lower Cross's deep abdominals/TVA), not general strength/stability work. */
  coreStabilityOnlySlots?: string[];
}

/** A member's detected pattern for one blueprint, derived from their latest completed posture assessment findings. */
export interface DetectedPattern {
  blueprint: BlueprintKey;
  severity: CorrectiveSeverity;
  supportingFindingIds: string[];
}

export interface CorrectiveExercise {
  provider: string;
  externalId: string;
  name: string;
  correctiveRoles: CorrectiveRole[];
  musclesStretched: string[];
  musclesStrengthened: string[];
  strainLevel: StrainLevel;
  spinalFlexionCore: boolean;
  equipment: string[];
  coachingCues: string[];
}

export type SessionBlockType = 'release' | 'mobility' | 'stability' | 'strength' | 'core';

export interface SessionExerciseDraft {
  provider: string;
  externalId: string;
  exerciseName: string;
  coachingCues: string | null;
  selectionReasoning: string;
}

export interface SessionBlockDraft {
  block: SessionBlockType;
  name: string;
  blockReasoning: string;
  exercises: SessionExerciseDraft[];
}

/** One full-body session — 5 blocks in the MEF Method's fixed order (release -> mobility -> stability -> strength -> core; strength is omitted entirely for severe-tier sessions). */
export interface SessionDraft {
  label: string;
  /** The worst detected severity this session was built for — carried on the session itself, not just on the draft, so the dosing lookup (dosing.ts) can never be done against the wrong tier by a caller holding only a session. */
  severity: CorrectiveSeverity;
  blocks: SessionBlockDraft[];
}

export interface CorrectiveProgramDraft {
  patterns: DetectedPattern[];
  overallSeverity: CorrectiveSeverity;
  daysPerWeek: number;
  equipment: string[];
  seed: string;
  /** One session per weekly slot (2 or 3) — this single 4-week phase repeats the same weekly session set across all 4 weeks; see programGenerator.ts header for why. */
  weeklySessions: SessionDraft[];
}
