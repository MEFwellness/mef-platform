/**
 * The arithmetic. Pure, and it never sees a red flag.
 *
 * ONE NUMBER PER SECTION, DECIDED ONCE. A section's percentage is points
 * earned divided by points possible for the questions she ANSWERED, times
 * one hundred, rounded to the nearest whole number. Every surface that
 * prints a percentage prints that rounded number, and the band is chosen
 * from that same rounded number, so a coach reading 15% can never be shown
 * a section labelled Quiet.
 *
 * A DOES NOT APPLY TO ME ANSWER LEAVES THE DENOMINATOR. It contributes no
 * points and no possible points, exactly as rule five of the specification
 * requires, so nobody is penalised or falsely greened by a question that
 * cannot apply to her.
 *
 * A SECTION WITH NOTHING TO DIVIDE BY IS ZERO, NOT AN ERROR. A member who
 * marks every question in a section Does not apply to me has a section
 * with no denominator. It reports 0 with a possible of 0, which lands in
 * the quietest band, and its own answeredCount says plainly that it was
 * built from nothing.
 *
 * RED FLAGS ARE NOT AN ARGUMENT TO ANY FUNCTION HERE. That is the whole
 * enforcement: this module cannot be influenced by them because it is
 * never handed them. tests/body-systems-red-flags.test.ts proves the
 * result of the surrounding pipeline is byte identical with a full Yes
 * sheet and a full No sheet.
 */

import {
  DNA_VALUE,
  type BodySystemsAnswers,
  type BodySystemsBand,
  type BodySystemsBranch,
  type BodySystemsQuestion,
  type BodySystemsResults,
  type BodySystemsScaleOption,
  type BodySystemsSection,
  type SectionResult,
} from './types';

/** The questions this branch is asked, in their fixed order. */
export function questionsForBranch(
  questions: readonly BodySystemsQuestion[],
  branch: BodySystemsBranch
): BodySystemsQuestion[] {
  return questions
    .filter((question) => question.branch === 'all' || question.branch === branch)
    .slice()
    .sort((a, b) => a.position - b.position);
}

/** This section's questions for this branch, in their fixed order. */
export function questionsInSection(
  questions: readonly BodySystemsQuestion[],
  sectionKey: string,
  branch: BodySystemsBranch
): BodySystemsQuestion[] {
  return questionsForBranch(questions, branch).filter(
    (question) => question.sectionKey === sectionKey
  );
}

/** The scale option she picked, or null for a Does not apply to me tap or an unreadable value. */
export function optionFor(
  scale: readonly BodySystemsScaleOption[],
  value: string | undefined
): BodySystemsScaleOption | null {
  if (!value || value === DNA_VALUE) return null;
  return scale.find((option) => option.valueKey === value) ?? null;
}

/** The highest weight on the scale. The denominator one answered question contributes. */
export function maxPoints(scale: readonly BodySystemsScaleOption[]): number {
  return scale.reduce((highest, option) => Math.max(highest, option.points), 0);
}

/**
 * The band a rounded percentage falls in.
 *
 * min is inclusive, max is exclusive, and the loudest band leaves max
 * null. Bands are read in their stored order so a coach who retunes the
 * cut offs gets exactly what he typed.
 */
export function bandForPercent(bands: readonly BodySystemsBand[], percent: number): BodySystemsBand {
  const ordered = bands.slice().sort((a, b) => a.position - b.position);
  for (const band of ordered) {
    const aboveFloor = percent >= band.minPercent;
    const belowCeiling = band.maxPercent === null || percent < band.maxPercent;
    if (aboveFloor && belowCeiling) return band;
  }
  // Unreachable with well formed bands. Falling back to the quietest one
  // rather than throwing, because a page a member is waiting on must not
  // die over a mistyped cut off, and the quietest band is the one that
  // claims least about her.
  return ordered[0]!;
}

/** One section's arithmetic. */
export function scoreSection(input: {
  questions: readonly BodySystemsQuestion[];
  scale: readonly BodySystemsScaleOption[];
  bands: readonly BodySystemsBand[];
  answers: BodySystemsAnswers;
  sectionKey: string;
  branch: BodySystemsBranch;
}): SectionResult {
  const { questions, scale, bands, answers, sectionKey, branch } = input;
  const asked = questionsInSection(questions, sectionKey, branch);
  const perQuestionMax = maxPoints(scale);

  let points = 0;
  let possible = 0;
  let answeredCount = 0;
  let dnaCount = 0;

  for (const question of asked) {
    const raw = answers[question.questionRef];
    if (raw === DNA_VALUE) {
      dnaCount += 1;
      continue;
    }
    const option = optionFor(scale, raw);
    if (!option) continue;
    points += option.points;
    possible += perQuestionMax;
    answeredCount += 1;
  }

  const percent = possible > 0 ? Math.round((points / possible) * 100) : 0;
  return {
    sectionKey,
    points,
    possible,
    percent,
    bandKey: bandForPercent(bands, percent).bandKey,
    answeredCount,
    dnaCount,
  };
}

/**
 * Every section, loudest first.
 *
 * Ties are broken by the section's own fixed position, so two sections on
 * the same percentage are always in the same order for the same member and
 * the order does not shuffle between her screen and her coach's.
 */
export function buildResults(input: {
  sections: readonly BodySystemsSection[];
  questions: readonly BodySystemsQuestion[];
  scale: readonly BodySystemsScaleOption[];
  bands: readonly BodySystemsBand[];
  answers: BodySystemsAnswers;
  branch: BodySystemsBranch;
}): BodySystemsResults {
  const { sections, questions, scale, bands, answers, branch } = input;
  const positionOf = new Map(sections.map((section) => [section.sectionKey, section.position]));

  const results = sections
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((section) =>
      scoreSection({ questions, scale, bands, answers, sectionKey: section.sectionKey, branch })
    );

  results.sort((a, b) => {
    if (b.percent !== a.percent) return b.percent - a.percent;
    return (positionOf.get(a.sectionKey) ?? 0) - (positionOf.get(b.sectionKey) ?? 0);
  });

  return { branch, sections: results };
}

/**
 * The loudest section, or null when nothing is showing up at all.
 *
 * NULL AT ZERO IS DELIBERATE. The specification gives the loudest section a
 * personalised line. When every section is at nought there is no loudest
 * one, only eleven ties, and printing "right now the loudest signals in
 * your body are about how it handles food" over a survey that found
 * nothing would be Root claiming something untrue about her. So the card
 * is drawn from the first section only when that section actually has a
 * signal to be loudest about.
 */
export function loudestSection(results: BodySystemsResults): SectionResult | null {
  const first = results.sections[0];
  if (!first || first.percent <= 0) return null;
  return first;
}

/** True when this band is at or above the named one, by stored order. */
export function bandAtLeast(
  bands: readonly BodySystemsBand[],
  bandKey: string,
  atLeastKey: string
): boolean {
  const positionOf = new Map(bands.map((band) => [band.bandKey, band.position]));
  const actual = positionOf.get(bandKey);
  const floor = positionOf.get(atLeastKey);
  if (actual === undefined || floor === undefined) return false;
  return actual >= floor;
}
