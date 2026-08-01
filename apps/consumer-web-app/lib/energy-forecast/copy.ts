/**
 * Forecast & Calibration Loop — plain-language sentences. Every sentence
 * here is built from real numbers passed in, never invented. This module
 * makes no pattern claims of its own (no "tends to," no causal language)
 * — a single day's predicted-vs-actual gap is a fact about one forecast,
 * not a longitudinal signal, so it doesn't go through
 * lib/longitudinal-intelligence/copy.ts's three-tier voice. The
 * calibration-over-time section is the one place this loop becomes
 * pattern-shaped, and that's exactly the point at which the ending
 * screen hands off to /case once she has an earned finding there.
 */
import { energyLevelLabel } from './scaleLabels';

export function describeGap(predictedLevel: number, actualLevel: number, gap: number): string {
  const predictedLabel = energyLevelLabel(predictedLevel);
  const actualLabel = energyLevelLabel(actualLevel);

  if (gap === 0) {
    return `You called it, you predicted ${predictedLabel}, and that's exactly how today came in.`;
  }
  const direction = gap > 0 ? 'higher' : 'lower';
  const amount = Math.abs(gap);
  return `You predicted ${predictedLabel}, and today came in ${actualLabel}: ${amount} point${amount === 1 ? '' : 's'} ${direction} than you expected.`;
}

export function describeRootGap(predictedLevel: number, actualLevel: number, gap: number): string {
  const predictedLabel = energyLevelLabel(predictedLevel);
  const actualLabel = energyLevelLabel(actualLevel);

  if (gap === 0) {
    return `Root predicted ${predictedLabel}, exactly right.`;
  }
  const direction = gap > 0 ? 'higher' : 'lower';
  const amount = Math.abs(gap);
  return `Root predicted ${predictedLabel}; today came in ${actualLabel}: ${amount} point${amount === 1 ? '' : 's'} ${direction} than Root expected.`;
}

export function describeRootNotReady(basisObservationCount: number, minRequired: number): string {
  if (basisObservationCount === 0) {
    return "Root isn't ready to make a call yet. It needs a real history of your energy answers first.";
  }
  return `Root isn't ready to make a call yet. It has ${basisObservationCount} of the ${minRequired} days of history it needs before predicting.`;
}

/** Root has enough history but declined to guess because it's too erratic — an abstention, never silently rounded into a forecast. */
export function describeRootTooVolatile(basisObservationCount: number): string {
  return `Root sat this one out. Your last ${basisObservationCount} energy answers have been swinging too much for a single call to mean anything.`;
}

export const ROOT_NO_ATTEMPT_SENTENCE =
  "Root didn't make a prediction for today. There was no Evening Reflection last night to base one on.";

export function describeTimeline(checkinCount: number, daysSinceFirstCheckin: number | null, targetDays: number): string {
  const checkinPhrase = `${checkinCount} check-in${checkinCount === 1 ? '' : 's'} logged`;
  const target = `Patterns typically need about ${targetDays} days to show up.`;

  if (daysSinceFirstCheckin === null || daysSinceFirstCheckin === 0) {
    return `${checkinPhrase} so far. ${target}`;
  }
  return `${checkinPhrase} over ${daysSinceFirstCheckin} day${daysSinceFirstCheckin === 1 ? '' : 's'}. ${target}`;
}
