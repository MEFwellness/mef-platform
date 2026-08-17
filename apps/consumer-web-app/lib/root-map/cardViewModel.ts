/**
 * Root Map — pure view-model builders for the member-facing cards (Root
 * Map redesign, 2026-07-28, Part 2). The old RootMapDomainCard.tsx (still
 * used, unchanged, by the coach view) rendered "What We're Still
 * Learning" and a second recommendation box that said the same thing in
 * different words whenever a domain had no findings yet. Pulling the
 * text choices out into a pure function — rather than deciding inline in
 * JSX — makes "the state message renders exactly once" a testable
 * invariant instead of something only visible by eyeballing the
 * component: `nextStep` is dropped entirely (not just visually) whenever
 * its body would repeat `stateMessage` verbatim.
 */

import type { RootMapDomainView } from './types';
import type { DomainCoverage } from './coverage';
import { formatCoverageLabel } from './coverage';

export type FindingCardViewModel = {
  label: string;
  memberDescription: string;
  coverageLabel: string | null;
  findings: string[];
  stateMessage: string;
  nextStep: { title: string; body: string } | null;
};

/**
 * Honesty guard, 2026-08-17: what a domain says when it has a real finding
 * against it and not one logged day behind it.
 *
 * The Root Map was showing "Movement & Physical Capacity, 0 of 21 days
 * logged" and, in the same card, "LOOKING STEADY. Nothing specific needed
 * here right now." Steady is a verdict, and it was being read off a
 * 'quiet' priority, which is what a domain resolves to when nothing has
 * been found in it. Nothing found is not the same as nothing there, and it
 * is certainly not "nothing needed", least of all in a domain the member
 * has two active pain findings in.
 *
 * This is a display swap only. The priority, the confidence and the
 * findings themselves are untouched: the card just stops calling an empty
 * record a good one.
 */
const NOTHING_LOGGED_STEP = {
  title: 'Nothing logged here yet',
  body: 'There are no logged days behind this one, so there is nothing here to call steady or otherwise. Logging it in a check-in is what starts the picture.',
};

export function buildFindingCardViewModel(
  domain: RootMapDomainView,
  coverage: DomainCoverage | null
): FindingCardViewModel {
  // `coverage` is null for a domain with no trackable per-day source at
  // all (lib/root-map/coverage.ts), which is a different thing from a real
  // zero and must not be treated as one.
  //
  // Both reassuring priorities are covered, which the live walk is what
  // showed: Movement was 'quiet' ("Looking steady. Nothing specific needed
  // here right now.") and Digestion was 'worth_watching' ("Keep tracking
  // here, no urgent action needed yet."), and both had 0 of 21 days
  // logged. The second is quieter than the first but it is the same
  // mistake, an absence of urgency reported from an absence of data.
  // 'needs_attention_now' is never overridden: that one is not reassurance
  // and never needed a guard.
  const positiveVerdictWithNothingBehindIt =
    coverage?.count === 0 && (domain.priority === 'quiet' || domain.priority === 'worth_watching');

  const nextStep = positiveVerdictWithNothingBehindIt
    ? NOTHING_LOGGED_STEP
    : domain.nextSuggestedStep !== domain.whatWereStillLearning
      ? { title: domain.currentRecommendation, body: domain.nextSuggestedStep }
      : null;

  return {
    label: domain.label,
    memberDescription: domain.memberDescription,
    coverageLabel: coverage ? formatCoverageLabel(coverage) : null,
    findings: domain.whatWeUnderstand,
    stateMessage: domain.whatWereStillLearning,
    nextStep,
  };
}

export type BuildingRowViewModel = {
  label: string;
  memberDescription: string;
  coverageLabel: string | null;
};

export function buildBuildingRowViewModel(
  domain: RootMapDomainView,
  coverage: DomainCoverage | null
): BuildingRowViewModel {
  return {
    label: domain.label,
    memberDescription: domain.memberDescription,
    coverageLabel: coverage ? formatCoverageLabel(coverage) : null,
  };
}
