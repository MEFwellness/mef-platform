/**
 * Numeric thresholds shared across lib/intelligence-core/*.ts — same
 * centralization discipline as lib/intelligence-engine/thresholds.ts and
 * lib/intelligence/confidence.ts.
 */

/** Minimum confidence swing between two recalculations of the *same* identity observation (same statement) before its trend_direction flips from 'stable' to 'strengthening'/'weakening' — a change smaller than this is noise, not a real shift. */
export const CONFIDENCE_TOUCH_TOLERANCE = 0.05;
