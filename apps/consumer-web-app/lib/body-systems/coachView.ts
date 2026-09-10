/**
 * What the coach sees. Everything the member layer is not allowed to hold.
 *
 * THE ORDER IS THE POINT. Red flags first, pinned and separated, because
 * they are safety and nothing below them is. Then the session opener, the
 * loudest section with the answers that made it loudest, because that is
 * the way into the conversation. Then the bars, then every answer by
 * contribution, then the pattern analysis, then the possible associations.
 *
 * EVERY STATEMENT CARRIES ITS UNCERTAINTY LABEL. Not as a tone of voice
 * but as a field, so the screen renders it visibly beside the statement
 * and cannot forget one.
 *
 * A LOUD SECTION WITH NO MATCH SAYS SO. When a section is Speaking loudly
 * and no library entry fired for it, that section carries the stored
 * coverage note and nothing else. Nothing here writes an association of
 * its own, ever, and there is no fallback sentence in this file to write
 * one with.
 */

import { fireAssociations, isElevated, type FiredAssociation } from './associations';
import { buildPatternAnalysis, type PatternAnalysis } from './patterns';
import { firedRedFlags, type FiredRedFlag } from './redFlags';
import { compareSections, comparePatterns, type PatternComparison, type SectionComparison } from './retake';
import { optionFor, questionsInSection } from './scoring';
import type { AssessmentUncertainty } from './uncertainty';
import {
  DNA_VALUE,
  type BodySystemsAnswers,
  type BodySystemsAssociation,
  type BodySystemsBand,
  type BodySystemsBranch,
  type BodySystemsQuestion,
  type BodySystemsRedFlag,
  type BodySystemsRedFlagAnswers,
  type BodySystemsResults,
  type BodySystemsSafetyLevel,
  type BodySystemsScaleOption,
  type BodySystemsSection,
} from './types';

/** One answer, as the coach reads it. */
export type CoachAnswerRow = {
  questionRef: string;
  prompt: string;
  /** Her answer's label, or the Does not apply to me label. */
  answerLabel: string;
  /** Zero for a Does not apply to me tap, which contributed nothing to either side of the fraction. */
  points: number;
  isDna: boolean;
  isElevated: boolean;
  /** Other questions elsewhere in the survey that a fired association read alongside this one. */
  relatedRefs: string[];
};

export type CoachSectionRow = {
  sectionKey: string;
  sectionName: string;
  memberIntroLine: string;
  percent: number;
  points: number;
  possible: number;
  bandKey: string;
  bandLabel: string;
  colorKey: BodySystemsBand['colorKey'];
  answeredCount: number;
  dnaCount: number;
  /** Every question in this section for her branch, heaviest contribution first. */
  answers: CoachAnswerRow[];
  comparison: SectionComparison | null;
  /**
   * True when this section is at the loudest band and no library entry
   * fired for it. The screen then prints the stored coverage note.
   */
  needsCoverageNote: boolean;
};

export type CoachStatement<T> = {
  uncertainty: AssessmentUncertainty;
  value: T;
};

export type CoachReadingView = {
  branch: BodySystemsBranch;
  /** Pinned above everything, in the flags' own order. Empty when none fired. */
  redFlags: CoachStatement<FiredRedFlag[]>;
  /** The loudest section and the answers that made it loudest, or null when nothing is showing up. */
  opener: CoachStatement<{ sectionKey: string; sectionName: string; percent: number; topAnswers: CoachAnswerRow[] }> | null;
  sections: CoachStatement<CoachSectionRow[]>;
  patterns: CoachStatement<PatternAnalysis>;
  associations: CoachStatement<FiredAssociation[]>;
  /** Present only when there is a previous sitting. */
  patternChanges: CoachStatement<PatternComparison[]> | null;
};

/** The loudest band key, read from the stored bands rather than named here. */
function loudestBandKey(bands: readonly BodySystemsBand[]): string | null {
  const ordered = bands.slice().sort((a, b) => b.position - a.position);
  return ordered[0]?.bandKey ?? null;
}

/** How many of a section's top answers open the session. */
export const OPENER_ANSWER_COUNT = 3;

export type CoachViewInput = {
  sections: readonly BodySystemsSection[];
  questions: readonly BodySystemsQuestion[];
  scale: readonly BodySystemsScaleOption[];
  bands: readonly BodySystemsBand[];
  redFlags: readonly BodySystemsRedFlag[];
  safetyLevels: readonly BodySystemsSafetyLevel[];
  library: readonly BodySystemsAssociation[];
  answers: BodySystemsAnswers;
  redFlagAnswers: BodySystemsRedFlagAnswers;
  results: BodySystemsResults;
  branch: BodySystemsBranch;
  /** The sitting before this one, or null. */
  previous: {
    answers: BodySystemsAnswers;
    results: BodySystemsResults;
    branch: BodySystemsBranch;
  } | null;
  minDeltaPercent: number;
};

function answerRow(
  input: CoachViewInput,
  question: BodySystemsQuestion,
  dnaLabel: string,
  relatedByRef: Map<string, Set<string>>
): CoachAnswerRow {
  const raw = input.answers[question.questionRef];
  const isDna = raw === DNA_VALUE;
  const option = optionFor(input.scale, raw);
  return {
    questionRef: question.questionRef,
    prompt: question.prompt,
    answerLabel: isDna ? (question.dnaLabel ?? dnaLabel) : (option?.label ?? ''),
    points: option?.points ?? 0,
    isDna,
    isElevated: isElevated(input.scale, input.answers, question.questionRef),
    relatedRefs: Array.from(relatedByRef.get(question.questionRef) ?? []),
  };
}

/**
 * Which other answers a fired association read alongside each one.
 *
 * This is what puts "related answers elsewhere in the survey are linked
 * from each question" on the screen, and it is built from what actually
 * fired rather than from a hand written map of what tends to go together.
 */
function relatedAnswersByRef(fired: FiredAssociation[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const entry of fired) {
    const refs = entry.whySurfacedAnswers.map((answer) => answer.questionRef);
    for (const ref of refs) {
      const set = out.get(ref) ?? new Set<string>();
      for (const other of refs) if (other !== ref) set.add(other);
      out.set(ref, set);
    }
  }
  return out;
}

export function buildCoachReadingView(input: CoachViewInput): CoachReadingView {
  const fired = fireAssociations({
    sections: input.sections,
    questions: input.questions,
    scale: input.scale,
    bands: input.bands,
    answers: input.answers,
    results: input.results,
    branch: input.branch,
    library: input.library,
  });

  const relatedByRef = relatedAnswersByRef(fired);
  const dnaLabel = 'Does not apply to me';
  const loudest = loudestBandKey(input.bands);
  const firedSectionKeys = new Set(fired.map((entry) => entry.sectionKey).filter(Boolean) as string[]);

  const comparisons = new Map(
    compareSections({
      current: input.results,
      previous: input.previous?.results ?? null,
      minDelta: input.minDeltaPercent,
    }).map((entry) => [entry.sectionKey, entry])
  );

  const sectionRows: CoachSectionRow[] = input.results.sections.map((result) => {
    const section = input.sections.find((entry) => entry.sectionKey === result.sectionKey);
    const band = input.bands.find((entry) => entry.bandKey === result.bandKey);
    const asked = questionsInSection(input.questions, result.sectionKey, input.branch);
    const answers = asked
      .map((question) => answerRow(input, question, dnaLabel, relatedByRef))
      .sort((a, b) => b.points - a.points);

    return {
      sectionKey: result.sectionKey,
      sectionName: section?.displayName ?? result.sectionKey,
      memberIntroLine: section?.memberIntroLine ?? '',
      percent: result.percent,
      points: result.points,
      possible: result.possible,
      bandKey: result.bandKey,
      bandLabel: band?.memberLabel ?? result.bandKey,
      colorKey: band?.colorKey ?? 'green',
      answeredCount: result.answeredCount,
      dnaCount: result.dnaCount,
      answers,
      comparison: input.previous ? (comparisons.get(result.sectionKey) ?? null) : null,
      needsCoverageNote:
        loudest !== null &&
        result.bandKey === loudest &&
        !firedSectionKeys.has(result.sectionKey),
    };
  });

  const first = input.results.sections[0];
  const openerSection = first && first.percent > 0
    ? (sectionRows.find((row) => row.sectionKey === first.sectionKey) ?? null)
    : null;

  const patterns = buildPatternAnalysis({
    sections: input.sections,
    questions: input.questions,
    scale: input.scale,
    bands: input.bands,
    answers: input.answers,
    results: input.results,
    branch: input.branch,
  });

  let patternChanges: CoachStatement<PatternComparison[]> | null = null;
  if (input.previous) {
    const previousFired = fireAssociations({
      sections: input.sections,
      questions: input.questions,
      scale: input.scale,
      bands: input.bands,
      answers: input.previous.answers,
      results: input.previous.results,
      branch: input.previous.branch,
      library: input.library,
    });
    patternChanges = {
      uncertainty: 'pattern',
      value: comparePatterns({
        current: fired,
        previous: previousFired,
        sectionComparisons: Array.from(comparisons.values()),
      }),
    };
  }

  return {
    branch: input.branch,
    redFlags: {
      uncertainty: 'observed',
      value: firedRedFlags(input.redFlags, input.safetyLevels, input.redFlagAnswers),
    },
    opener: openerSection
      ? {
          uncertainty: 'observed',
          value: {
            sectionKey: openerSection.sectionKey,
            sectionName: openerSection.sectionName,
            percent: openerSection.percent,
            topAnswers: openerSection.answers.filter((row) => row.points > 0).slice(0, OPENER_ANSWER_COUNT),
          },
        }
      : null,
    sections: { uncertainty: 'observed', value: sectionRows },
    patterns: { uncertainty: 'pattern', value: patterns },
    associations: { uncertainty: 'possible', value: fired },
    patternChanges,
  };
}
