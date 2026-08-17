/**
 * Coaching Insights page ("Your Longitudinal Picture" + "Your Next Best
 * Step") — pure presentation composition. Deliberately kept out of copy.ts
 * so this page's formatting can change without touching
 * describeSignalForMember/describeSignalForCoach, which Case View
 * (lib/case-view/findings.ts) already renders alongside its own separate
 * subject label — embedding a subject inside those shared sentences would
 * have duplicated it there. Every sentence still comes from copy.ts,
 * unedited; the subject comes from topicLabelForSignal, the same helper
 * the Root Coaching Engine already uses to turn a bare WellnessMetricKey or
 * registry label into a short, human subject.
 */

import { describeSignalForMember } from './copy';
import { topicLabelForSignal } from '../root-coaching-engine/topicLabel';
import type { LongitudinalSignal } from './types';
import type { RootRouterOutcomeView } from '../investigation-engine/routerOutcome';

export type LongitudinalPictureItem = { subject: string; sentence: string };

function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Null when the signal genuinely has no nameable subject
 * (topicLabelForSignal's own 'this area' fallback) — that line is dropped
 * entirely rather than rendered with a missing subject.
 */
export function describeSignalAsPictureItem(signal: LongitudinalSignal): LongitudinalPictureItem | null {
  const subject = topicLabelForSignal(signal);
  if (subject === 'this area') return null;
  return { subject: capitalize(subject), sentence: describeSignalForMember(signal) };
}

/**
 * Honesty guard, 2026-08-17. The Coaching Insights page used to put
 * `one_time_observation`, `repeated_signal` and `emerging_pattern` into one
 * list and head it "Patterns We're Beginning to Notice", so a line whose
 * own sentence read "We noticed this once" was filed under a heading that
 * called it a pattern. The three-tier language module (copy.ts) was always
 * right about the sentence; only the grouping above it was wrong.
 *
 * A single mention is a single mention. It gets its own group and its own
 * honest heading; only repeated signals sit under the word pattern.
 */
export function splitObservationsAndPatterns(signals: LongitudinalSignal[]): {
  singleObservations: LongitudinalSignal[];
  repeatedPatterns: LongitudinalSignal[];
} {
  return {
    singleObservations: signals.filter((s) => s.state === 'one_time_observation'),
    repeatedPatterns: signals.filter(
      (s) => s.state === 'repeated_signal' || s.state === 'emerging_pattern'
    ),
  };
}

export type NextBestStepView = {
  message: string;
  investigation: { displayName: string; route: string } | null;
};

/** Outcomes whose own member message specifically claims a named, actionable thing exists (an assessment worth naming and linking) rather than a generic sentence that stands on its own. */
const OUTCOMES_REQUIRING_NAMED_INVESTIGATION = new Set<RootRouterOutcomeView['outcome']>([
  'focused_investigation',
  'reassessment',
]);

/**
 * Never returns a card claiming a specific named area exists without
 * actually naming it — if the outcome's own message implies a named
 * investigation but none is attached, the card is suppressed entirely
 * rather than shown with a dangling reference.
 */
export function nextBestStepView(routerOutcome: RootRouterOutcomeView): NextBestStepView | null {
  const investigation = routerOutcome.investigation
    ? { displayName: routerOutcome.investigation.displayName, route: routerOutcome.investigation.route }
    : null;
  if (OUTCOMES_REQUIRING_NAMED_INVESTIGATION.has(routerOutcome.outcome) && !investigation) return null;
  return { message: routerOutcome.memberMessage, investigation };
}
