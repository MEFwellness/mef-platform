/**
 * The coach association library, evaluated.
 *
 * COACH ONLY, PERMANENTLY. Nothing in this module may be imported by
 * anything a member renders. The database draws the same fence (migration
 * 220 gives body_systems_associations no member select policy at all), and
 * tests/body-systems-member-language.test.ts walks the import graph of
 * every member surface in this feature and fails if this file appears in
 * it.
 *
 * IT INVENTS NOTHING. Every word a coach reads about a pattern is a column
 * on the row that fired: `associationText` and `nextStep`, stored whole,
 * frame and all. This module decides WHETHER a row fires and WHICH of her
 * answers made it fire. It never composes a sentence, never picks a word,
 * and has no fallback text of its own. A section that is loud with no row
 * matching gets the stored coverage note, which is also a row.
 *
 * EVERY FIRED ENTRY CITES THE ANSWERS THAT FIRED IT. `whySurfaced` is
 * collected during evaluation rather than reconstructed afterwards, so it
 * can only ever contain answers the trigger genuinely read. An entry with
 * an empty citation is dropped rather than shown, because an association
 * that cannot say why it surfaced is exactly the thing this layer is not
 * allowed to be.
 */

import { optionFor } from './scoring';
import { evaluateTrigger, isElevatedAnswer } from './triggerEvaluation';
import {
  type FiredAssociation,
  type WhySurfacedAnswer,
  type WhySurfacedSection,
  type AssociationTrigger,
  type BodySystemsAnswers,
  type BodySystemsAssociation,
  type BodySystemsBand,
  type BodySystemsBranch,
  type BodySystemsQuestion,
  type BodySystemsResults,
  type BodySystemsScaleOption,
  type BodySystemsSection,
} from './types';

export type {
  FiredAssociation,
  WhySurfacedAnswer,
  WhySurfacedSection,
} from './types';

type Context = {
  sections: readonly BodySystemsSection[];
  questions: readonly BodySystemsQuestion[];
  scale: readonly BodySystemsScaleOption[];
  bands: readonly BodySystemsBand[];
  answers: BodySystemsAnswers;
  results: BodySystemsResults;
  branch: BodySystemsBranch;
};

type Collected = {
  answers: WhySurfacedAnswer[];
  sections: WhySurfacedSection[];
};

/** True when this question was answered Often or Almost always. Does not apply to me is never elevated. */
export function isElevated(
  scale: readonly BodySystemsScaleOption[],
  answers: BodySystemsAnswers,
  questionRef: string
): boolean {
  return isElevatedAnswer(scale, answers, questionRef);
}

function citeAnswer(context: Context, questionRef: string): WhySurfacedAnswer | null {
  const question = context.questions.find((entry) => entry.questionRef === questionRef);
  if (!question) return null;
  const option = optionFor(context.scale, context.answers[questionRef]);
  if (!option) return null;
  const section = context.sections.find((entry) => entry.sectionKey === question.sectionKey);
  return {
    questionRef,
    sectionKey: question.sectionKey,
    sectionName: section?.displayName ?? question.sectionKey,
    prompt: question.prompt,
    answerLabel: option.label,
    points: option.points,
  };
}

function citeSection(context: Context, sectionKey: string): WhySurfacedSection | null {
  const section = context.sections.find((entry) => entry.sectionKey === sectionKey);
  const result = context.results.sections.find((entry) => entry.sectionKey === sectionKey);
  if (!section || !result) return null;
  const band = context.bands.find((entry) => entry.bandKey === result.bandKey);
  return {
    sectionKey,
    sectionName: section.displayName,
    percent: result.percent,
    bandLabel: band?.memberLabel ?? result.bandKey,
  };
}

/**
 * Evaluate one trigger, and cite every answer and section it actually read.
 *
 * WHETHER IT HOLDS IS DECIDED IN ./triggerEvaluation.ts, the one
 * implementation the Signal Library also reads. This function only turns
 * what that evaluation collected into citations, in the order it was
 * collected, so the card's "why this surfaced" is exactly what the
 * evaluation counted and nothing it did not.
 */
function evaluate(context: Context, trigger: AssociationTrigger, into: Collected): boolean {
  const outcome = evaluateTrigger(context, trigger);
  if (!outcome.held) return false;
  for (const ref of outcome.answerRefs) {
    const cited = citeAnswer(context, ref);
    if (cited) into.answers.push(cited);
  }
  for (const key of outcome.sectionKeys) {
    const cited = citeSection(context, key);
    if (cited) into.sections.push(cited);
  }
  return true;
}

function dedupeAnswers(answers: WhySurfacedAnswer[]): WhySurfacedAnswer[] {
  const seen = new Set<string>();
  const out: WhySurfacedAnswer[] = [];
  for (const answer of answers) {
    if (seen.has(answer.questionRef)) continue;
    seen.add(answer.questionRef);
    out.push(answer);
  }
  return out;
}

function dedupeSections(sections: WhySurfacedSection[]): WhySurfacedSection[] {
  const seen = new Set<string>();
  const out: WhySurfacedSection[] = [];
  for (const section of sections) {
    if (seen.has(section.sectionKey)) continue;
    seen.add(section.sectionKey);
    out.push(section);
  }
  return out;
}

/**
 * Every library entry that fires for this sitting, in library order.
 *
 * An entry whose branch does not match hers is never considered, so a
 * Branch B sitting can never surface a Branch A pattern.
 *
 * AN ENTRY THAT CANNOT CITE ANYTHING IS DROPPED. That is not defensive
 * tidiness: the specification requires every surfaced association to show
 * why it surfaced, connected back to her actual responses, so an entry
 * with nothing to show has not met the bar to be shown.
 */
export function fireAssociations(input: Context & { library: readonly BodySystemsAssociation[] }): FiredAssociation[] {
  const { library, ...context } = input;
  const fired: FiredAssociation[] = [];

  for (const entry of library.slice().sort((a, b) => a.position - b.position)) {
    if (entry.branch !== 'all' && entry.branch !== context.branch) continue;

    const collected: Collected = { answers: [], sections: [] };
    if (!evaluate(context, entry.trigger, collected)) continue;

    const whySurfacedAnswers = dedupeAnswers(collected.answers);
    const whySurfacedSections = dedupeSections(collected.sections);
    if (whySurfacedAnswers.length === 0 && whySurfacedSections.length === 0) continue;

    const section = entry.sectionKey
      ? context.sections.find((row) => row.sectionKey === entry.sectionKey)
      : null;

    fired.push({
      entryCode: entry.entryCode,
      title: entry.title,
      sectionKey: entry.sectionKey,
      sectionName: section?.displayName ?? null,
      associationText: entry.associationText,
      nextStep: entry.nextStep,
      whySurfacedAnswers,
      whySurfacedSections,
    });
  }

  return fired;
}
