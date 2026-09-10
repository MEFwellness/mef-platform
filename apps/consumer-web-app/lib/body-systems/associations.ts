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
import {
  DNA_VALUE,
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
  const raw = answers[questionRef];
  if (!raw || raw === DNA_VALUE) return false;
  return optionFor(scale, raw)?.isElevated === true;
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

function bandRank(bands: readonly BodySystemsBand[], bandKey: string): number | null {
  const band = bands.find((entry) => entry.bandKey === bandKey);
  return band ? band.position : null;
}

function sectionAtBand(context: Context, sectionKey: string, bandKey: string): boolean {
  const result = context.results.sections.find((entry) => entry.sectionKey === sectionKey);
  if (!result) return false;
  const actual = bandRank(context.bands, result.bandKey);
  const floor = bandRank(context.bands, bandKey);
  if (actual === null || floor === null) return false;
  return actual >= floor;
}

/**
 * Evaluate one trigger, collecting every answer and section it actually
 * read on the way through.
 *
 * COLLECTION HAPPENS ONLY ON A TRUE BRANCH. A nested condition that did
 * not hold contributes no citation, so a fired `any_of` never cites the
 * half of itself that was false.
 */
function evaluate(context: Context, trigger: AssociationTrigger, into: Collected): boolean {
  switch (trigger.type) {
    case 'cluster':
    case 'min_elevated': {
      const fired = trigger.questions.filter((ref) => isElevated(context.scale, context.answers, ref));
      if (fired.length < trigger.min) return false;
      for (const ref of fired) {
        const cited = citeAnswer(context, ref);
        if (cited) into.answers.push(cited);
      }
      return true;
    }
    case 'all_elevated': {
      const every = trigger.questions.every((ref) => isElevated(context.scale, context.answers, ref));
      if (!every) return false;
      for (const ref of trigger.questions) {
        const cited = citeAnswer(context, ref);
        if (cited) into.answers.push(cited);
      }
      return true;
    }
    case 'any_elevated': {
      const fired = trigger.questions.filter((ref) => isElevated(context.scale, context.answers, ref));
      if (fired.length === 0) return false;
      for (const ref of fired) {
        const cited = citeAnswer(context, ref);
        if (cited) into.answers.push(cited);
      }
      return true;
    }
    case 'all_of': {
      const scratch: Collected = { answers: [], sections: [] };
      for (const condition of trigger.conditions) {
        if (!evaluate(context, condition, scratch)) return false;
      }
      into.answers.push(...scratch.answers);
      into.sections.push(...scratch.sections);
      return true;
    }
    case 'any_of': {
      let any = false;
      for (const condition of trigger.conditions) {
        const scratch: Collected = { answers: [], sections: [] };
        if (evaluate(context, condition, scratch)) {
          any = true;
          into.answers.push(...scratch.answers);
          into.sections.push(...scratch.sections);
        }
      }
      return any;
    }
    case 'sections_at_band': {
      const every = trigger.sections.every((key) => sectionAtBand(context, key, trigger.band));
      if (!every) return false;
      for (const key of trigger.sections) {
        const cited = citeSection(context, key);
        if (cited) into.sections.push(cited);
      }
      return true;
    }
    case 'sections_count_at_band': {
      const matching = context.results.sections.filter((result) =>
        sectionAtBand(context, result.sectionKey, trigger.band)
      );
      if (matching.length < trigger.min) return false;
      for (const result of matching) {
        const cited = citeSection(context, result.sectionKey);
        if (cited) into.sections.push(cited);
      }
      return true;
    }
    default:
      return false;
  }
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
