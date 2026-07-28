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

export function buildFindingCardViewModel(
  domain: RootMapDomainView,
  coverage: DomainCoverage | null
): FindingCardViewModel {
  const nextStep =
    domain.nextSuggestedStep !== domain.whatWereStillLearning
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
