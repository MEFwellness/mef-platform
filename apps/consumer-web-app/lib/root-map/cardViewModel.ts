/**
 * Root Map — pure view-model builders for the member-facing cards.
 *
 * Pulling the text choices out into a pure function, rather than deciding
 * inline in JSX, makes "the state message renders exactly once" a testable
 * invariant instead of something only visible by eyeballing the component:
 * `nextStep` is dropped entirely (not just visually) whenever its body
 * would repeat `stateMessage` verbatim.
 *
 * Interpretation-layer migration (2026-08-17): each finding now carries its
 * own evidence-tier label and, when it belongs to more than one domain, the
 * cross reference line that says so. That line is the whole difference
 * between one answer shown in two places and two answers.
 */

import type { RootMapDomainView } from './types';
import type { DomainCoverage } from './coverage';
import { formatCoverageLabel } from './coverage';

/** One finding as the card renders it: the statement, its tier, and where else it appears. */
export type FindingLineViewModel = {
  id: string;
  statement: string;
  tierLabel: string;
  crossReferenceNote: string | null;
};

/** A finding filed under another domain, shown here as a reference and nothing more. */
export type CrossReferenceViewModel = {
  id: string;
  label: string;
  note: string;
};

export type FindingCardViewModel = {
  label: string;
  memberDescription: string;
  coverageLabel: string | null;
  findings: FindingLineViewModel[];
  /** Findings whose home is another domain. Never rendered as findings. */
  crossReferences: CrossReferenceViewModel[];
  stateMessage: string;
  nextStep: { title: string; body: string } | null;
};

/**
 * Honesty guard, 2026-08-17: what a domain says when it has not one logged
 * day behind it.
 *
 * The Root Map was showing "Movement & Physical Capacity, 0 of 21 days
 * logged" and, in the same card, "LOOKING STEADY. Nothing specific needed
 * here right now."
 *
 * Interpretation-layer migration: this guard is now narrowed to a domain
 * with NO findings. That narrowing is not a weakening, it closes a hole the
 * guard would otherwise have opened: after the migration a domain with real
 * findings and zero logged days resolves to 'acknowledged', whose shim
 * priority is 'worth_watching', and the old condition would have printed
 * "Nothing logged here yet" over two live findings. The layer itself now
 * covers the no-findings case (DomainState 'no_data_yet'), so this is
 * belt and braces on a rule that already holds one level down.
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
  const positiveVerdictWithNothingBehindIt =
    coverage?.count === 0 &&
    domain.canonicalFindings.length === 0 &&
    (domain.priority === 'quiet' || domain.priority === 'worth_watching');

  const nextStep = positiveVerdictWithNothingBehindIt
    ? NOTHING_LOGGED_STEP
    : domain.nextSuggestedStep !== domain.whatWereStillLearning
      ? { title: domain.currentRecommendation, body: domain.nextSuggestedStep }
      : null;

  return {
    label: domain.label,
    memberDescription: domain.memberDescription,
    coverageLabel: coverage ? formatCoverageLabel(coverage) : null,
    findings: domain.canonicalFindings.map((f) => ({
      id: f.id,
      statement: f.statement,
      tierLabel: f.tierLabel,
      crossReferenceNote: f.crossReferenceNote,
    })),
    // The finding's own note says where ELSE it appears, which is the right
    // sentence on its home card and the wrong one here. This card says
    // where the finding lives instead, so a member reading it knows this is
    // the same thing she already read, not a second one.
    crossReferences: domain.crossReferenced.map((f) => ({
      id: f.id,
      label: f.label,
      note: `Shown in full under ${f.primaryDomainLabel ?? 'another area'}.`,
    })),
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
