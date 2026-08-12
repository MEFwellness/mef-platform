/**
 * Root Motion System — public entry point (Prompt 1). See
 * docs/motion-experience-bible.md for the rules this module implements.
 */

export { MOTION_DURATION_MS, MOTION_EASE, MOTION_MAX_STAGGER_ITEMS, MOTION_STAGGER_STEP_MS, MOTION_STAGGER_STEP_TIGHT_MS, MOTION_FLOAT_DURATION_RANGE_MS, MOTION_AMBIENT_MAX_OPACITY } from './tokens';
export type { MotionDurationTier, MotionEaseName } from './tokens';
export { revealStep, revealStepTotalMs } from './revealStep';
export type { RevealStepProps } from './revealStep';
export { useReducedMotion, prefersReducedMotionNow } from './useReducedMotion';
export { useLowPowerMode } from './useLowPowerMode';
