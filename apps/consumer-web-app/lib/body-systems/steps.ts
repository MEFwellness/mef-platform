/**
 * The order of screens, derived from the stored content rather than
 * hard coded.
 *
 * ELEVEN SECTION SCREENS, THEN SIX RED FLAG SCREENS, THEN THE RESULTS.
 * One section per screen, because a page with a hundred and three boxes on
 * it is a form. One red flag per screen, because a Yes has to be able to
 * put its safety response on the screen she is standing on, immediately,
 * with nothing else competing for it.
 *
 * PROGRESS IS COUNTED IN SECTIONS, exactly as the specification asks:
 * "1 of 11". The red flag screens are not part of that count and say so in
 * their own words, because they are not a twelfth system and counting them
 * as one would make the survey look longer than it is on the screen where
 * she is nearly done.
 *
 * THE INDEX IS WHAT RESUME STORES. It is a position in this list, so a
 * member who closed the tab on section four reopens on section four. A
 * stored index past the end of the list is clamped rather than trusted,
 * which is what stops a sitting saved under an older content generation
 * from opening on a screen that no longer exists.
 */

import type { BodySystemsRedFlag, BodySystemsSection } from './types';

export type BodySystemsStep =
  | { kind: 'section'; sectionKey: string; sectionNumber: number; sectionCount: number }
  | { kind: 'red_flag'; flagKey: string; flagNumber: number; flagCount: number }
  | { kind: 'results' };

export function buildSteps(
  sections: readonly BodySystemsSection[],
  redFlags: readonly BodySystemsRedFlag[]
): BodySystemsStep[] {
  const orderedSections = sections.slice().sort((a, b) => a.position - b.position);
  const orderedFlags = redFlags.slice().sort((a, b) => a.position - b.position);

  const steps: BodySystemsStep[] = orderedSections.map((section, index) => ({
    kind: 'section' as const,
    sectionKey: section.sectionKey,
    sectionNumber: index + 1,
    sectionCount: orderedSections.length,
  }));

  for (const [index, flag] of orderedFlags.entries()) {
    steps.push({
      kind: 'red_flag',
      flagKey: flag.flagKey,
      flagNumber: index + 1,
      flagCount: orderedFlags.length,
    });
  }

  steps.push({ kind: 'results' });
  return steps;
}

/** The index of the last screen before the results. Submitting happens here. */
export function lastQuestionStepIndex(steps: readonly BodySystemsStep[]): number {
  return Math.max(0, steps.length - 2);
}

/** A stored index, clamped into this list rather than trusted. */
export function clampStepIndex(steps: readonly BodySystemsStep[], stored: number): number {
  if (!Number.isFinite(stored) || stored < 0) return 0;
  return Math.min(Math.floor(stored), lastQuestionStepIndex(steps));
}
