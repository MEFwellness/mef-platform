/**
 * The coach's pattern analysis layer. Pure, coach only, and calculated
 * from the full response set rather than from section totals.
 *
 * FOUR READINGS, AND EACH ONE SAYS WHAT IT COUNTED.
 *
 *   high frequency   every answer of Often or Almost always, anywhere in
 *                    the survey, loudest contribution first.
 *   in-section       which symptoms are moving together inside one
 *   clusters         section, which is two or more elevated answers in it.
 *   cross-section    which systems are moving together, which is two or
 *   combinations     more sections at Showing up or louder.
 *   changes          what moved since the previous sitting.
 *
 * EVERY COUNT NAMES ITS WINDOW. A cluster says how many of the section's
 * questions were elevated out of how many she answered, never a bare
 * number beside another bare number that counted something else.
 *
 * IT INTERPRETS, IT DOES NOT CONCLUDE. Everything here carries the
 * 'pattern' uncertainty label except the high frequency list, which is
 * 'observed': it is literally what she reported, unaggregated.
 */

import { isElevated } from './associations';
import { optionFor, questionsInSection } from './scoring';
import type { AssessmentUncertainty } from './uncertainty';
import {
  type BodySystemsAnswers,
  type BodySystemsBand,
  type BodySystemsBranch,
  type BodySystemsQuestion,
  type BodySystemsResults,
  type BodySystemsScaleOption,
  type BodySystemsSection,
} from './types';

export type HighFrequencyAnswer = {
  questionRef: string;
  sectionKey: string;
  sectionName: string;
  prompt: string;
  answerLabel: string;
  points: number;
};

export type SectionCluster = {
  sectionKey: string;
  sectionName: string;
  /** How many of this section's questions she answered Often or Almost always. */
  elevatedCount: number;
  /** How many she answered at all, so the count above has its denominator beside it. */
  answeredCount: number;
  members: HighFrequencyAnswer[];
};

export type CrossSectionCombination = {
  /** Every section at the named band or louder. Two or more, or this is not reported at all. */
  sections: { sectionKey: string; sectionName: string; percent: number; bandLabel: string }[];
  bandKey: string;
  bandLabel: string;
};

export type PatternAnalysis = {
  highFrequency: HighFrequencyAnswer[];
  clusters: SectionCluster[];
  crossSection: CrossSectionCombination | null;
};

/** Which uncertainty label each half of the analysis carries. */
export const PATTERN_UNCERTAINTY: Readonly<Record<keyof PatternAnalysis, AssessmentUncertainty>> = {
  highFrequency: 'observed',
  clusters: 'pattern',
  crossSection: 'pattern',
};

/** The band a cross section combination is counted at. Showing up or louder, per the specification. */
export const CROSS_SECTION_BAND_KEY = 'showing_up';

/** The floor for calling two answers a cluster. Two or more elevated inside one section. */
export const CLUSTER_MINIMUM = 2;

type Input = {
  sections: readonly BodySystemsSection[];
  questions: readonly BodySystemsQuestion[];
  scale: readonly BodySystemsScaleOption[];
  bands: readonly BodySystemsBand[];
  answers: BodySystemsAnswers;
  results: BodySystemsResults;
  branch: BodySystemsBranch;
};

function describe(
  input: Input,
  question: BodySystemsQuestion
): HighFrequencyAnswer | null {
  const option = optionFor(input.scale, input.answers[question.questionRef]);
  if (!option) return null;
  const section = input.sections.find((entry) => entry.sectionKey === question.sectionKey);
  return {
    questionRef: question.questionRef,
    sectionKey: question.sectionKey,
    sectionName: section?.displayName ?? question.sectionKey,
    prompt: question.prompt,
    answerLabel: option.label,
    points: option.points,
  };
}

/** Every Often or Almost always answer, heaviest first, then in the survey's own order. */
export function highFrequencyAnswers(input: Input): HighFrequencyAnswer[] {
  const ordered = input.questions
    .slice()
    .filter((question) => question.branch === 'all' || question.branch === input.branch)
    .sort((a, b) => a.position - b.position);

  const out: HighFrequencyAnswer[] = [];
  for (const question of ordered) {
    if (!isElevated(input.scale, input.answers, question.questionRef)) continue;
    const described = describe(input, question);
    if (described) out.push(described);
  }
  return out.sort((a, b) => b.points - a.points);
}

/** Sections carrying two or more elevated answers, loudest section first. */
export function sectionClusters(input: Input): SectionCluster[] {
  const clusters: SectionCluster[] = [];

  for (const result of input.results.sections) {
    const section = input.sections.find((entry) => entry.sectionKey === result.sectionKey);
    if (!section) continue;
    const asked = questionsInSection(input.questions, result.sectionKey, input.branch);
    const members: HighFrequencyAnswer[] = [];
    for (const question of asked) {
      if (!isElevated(input.scale, input.answers, question.questionRef)) continue;
      const described = describe(input, question);
      if (described) members.push(described);
    }
    if (members.length < CLUSTER_MINIMUM) continue;
    clusters.push({
      sectionKey: result.sectionKey,
      sectionName: section.displayName,
      elevatedCount: members.length,
      answeredCount: result.answeredCount,
      members: members.sort((a, b) => b.points - a.points),
    });
  }

  return clusters;
}

/**
 * The systems moving together, or null.
 *
 * Reported as ONE SET rather than as every pair, because a coach reading
 * "Digestion and Immune", "Digestion and Brain", "Immune and Brain" is
 * reading one fact three times. Null below two sections, because one
 * section is not a combination.
 */
export function crossSectionCombination(input: Input): CrossSectionCombination | null {
  const band = input.bands.find((entry) => entry.bandKey === CROSS_SECTION_BAND_KEY);
  if (!band) return null;

  const positionOf = new Map(input.bands.map((entry) => [entry.bandKey, entry.position]));
  const floor = positionOf.get(CROSS_SECTION_BAND_KEY);
  if (floor === undefined) return null;

  const matching = input.results.sections.filter((result) => {
    const rank = positionOf.get(result.bandKey);
    return rank !== undefined && rank >= floor;
  });
  if (matching.length < 2) return null;

  return {
    bandKey: band.bandKey,
    bandLabel: band.memberLabel,
    sections: matching.map((result) => {
      const section = input.sections.find((entry) => entry.sectionKey === result.sectionKey);
      const resultBand = input.bands.find((entry) => entry.bandKey === result.bandKey);
      return {
        sectionKey: result.sectionKey,
        sectionName: section?.displayName ?? result.sectionKey,
        percent: result.percent,
        bandLabel: resultBand?.memberLabel ?? result.bandKey,
      };
    }),
  };
}

export function buildPatternAnalysis(input: Input): PatternAnalysis {
  return {
    highFrequency: highFrequencyAnswers(input),
    clusters: sectionClusters(input),
    crossSection: crossSectionCombination(input),
  };
}
