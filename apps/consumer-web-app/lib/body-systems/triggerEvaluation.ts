/**
 * Whether a stored association trigger holds for one sitting, and which of
 * her answers and sections it read. The ARITHMETIC half of the coach
 * association library, and nothing else.
 *
 * ITS OWN MODULE, for the reason ./trigger.ts is its own module. The Signal
 * Library needs to know which association conditions held on a sitting, so
 * it can tell a Sometimes answer that sits inside a loud, coach approved
 * cluster from one that sits alone. That question is asked while a
 * member's own submit is completing, and every member surface in this
 * feature reaches that submit. ./associations.ts holds the path to the
 * association TEXT and must stay out of reach of a member surface, which
 * tests/body-systems-member-language.test.tsx enforces. A trigger's truth
 * is structure and slugs, so it can live here and be reached from anywhere.
 *
 * ONE IMPLEMENTATION. ./associations.ts evaluates every trigger through
 * this function and turns what it collects into citations, so the coach's
 * association card and the Signal Library can never disagree about whether
 * an entry fired.
 *
 * COLLECTION HAPPENS ONLY ON A TRUE BRANCH. A nested condition that did not
 * hold contributes nothing, so a fired `any_of` never reports the half of
 * itself that was false.
 */

import { optionFor } from './scoring';
import {
  DNA_VALUE,
  type AssociationTrigger,
  type BodySystemsAnswers,
  type BodySystemsBand,
  type BodySystemsResults,
  type BodySystemsScaleOption,
} from './types';

/** What a trigger is evaluated against. Numbers and slugs only. */
export type TriggerContext = {
  scale: readonly BodySystemsScaleOption[];
  bands: readonly BodySystemsBand[];
  answers: BodySystemsAnswers;
  results: BodySystemsResults;
};

/** Everything one evaluation read, in the order it read it. */
export type TriggerOutcome = {
  held: boolean;
  /** The elevated answers a held condition counted, in evaluation order, repeats included. */
  answerRefs: string[];
  /** The sections a held band condition counted, in evaluation order, repeats included. */
  sectionKeys: string[];
  /**
   * EVERY QUESTION NAMED BY A QUESTION CONDITION THAT HELD, loud or not.
   *
   * This is what the Signal Library reads: a Sometimes answer named in a
   * cluster whose other members were loud enough to fire it.
   */
  heldQuestionRefs: string[];
};

/** True when this question was answered Often or Almost always. Does not apply to me is never elevated. */
export function isElevatedAnswer(
  scale: readonly BodySystemsScaleOption[],
  answers: BodySystemsAnswers,
  questionRef: string
): boolean {
  const raw = answers[questionRef];
  if (!raw || raw === DNA_VALUE) return false;
  return optionFor(scale, raw)?.isElevated === true;
}

function bandRank(bands: readonly BodySystemsBand[], bandKey: string): number | null {
  const band = bands.find((entry) => entry.bandKey === bandKey);
  return band ? band.position : null;
}

function sectionAtBand(context: TriggerContext, sectionKey: string, bandKey: string): boolean {
  const result = context.results.sections.find((entry) => entry.sectionKey === sectionKey);
  if (!result) return false;
  const actual = bandRank(context.bands, result.bandKey);
  const floor = bandRank(context.bands, bandKey);
  if (actual === null || floor === null) return false;
  return actual >= floor;
}

function empty(): TriggerOutcome {
  return { held: false, answerRefs: [], sectionKeys: [], heldQuestionRefs: [] };
}

function merge(into: TriggerOutcome, from: TriggerOutcome): void {
  into.answerRefs.push(...from.answerRefs);
  into.sectionKeys.push(...from.sectionKeys);
  into.heldQuestionRefs.push(...from.heldQuestionRefs);
}

export function evaluateTrigger(context: TriggerContext, trigger: AssociationTrigger): TriggerOutcome {
  const out = empty();
  switch (trigger.type) {
    case 'cluster':
    case 'min_elevated': {
      const fired = trigger.questions.filter((ref) =>
        isElevatedAnswer(context.scale, context.answers, ref)
      );
      if (fired.length < trigger.min) return out;
      out.held = true;
      out.answerRefs.push(...fired);
      out.heldQuestionRefs.push(...trigger.questions);
      return out;
    }
    case 'all_elevated': {
      const every = trigger.questions.every((ref) =>
        isElevatedAnswer(context.scale, context.answers, ref)
      );
      if (!every) return out;
      out.held = true;
      out.answerRefs.push(...trigger.questions);
      out.heldQuestionRefs.push(...trigger.questions);
      return out;
    }
    case 'any_elevated': {
      const fired = trigger.questions.filter((ref) =>
        isElevatedAnswer(context.scale, context.answers, ref)
      );
      if (fired.length === 0) return out;
      out.held = true;
      out.answerRefs.push(...fired);
      out.heldQuestionRefs.push(...trigger.questions);
      return out;
    }
    case 'all_of': {
      const scratch = empty();
      for (const condition of trigger.conditions) {
        const inner = evaluateTrigger(context, condition);
        if (!inner.held) return out;
        merge(scratch, inner);
      }
      out.held = true;
      merge(out, scratch);
      return out;
    }
    case 'any_of': {
      for (const condition of trigger.conditions) {
        const inner = evaluateTrigger(context, condition);
        if (!inner.held) continue;
        out.held = true;
        merge(out, inner);
      }
      return out;
    }
    case 'sections_at_band': {
      const every = trigger.sections.every((key) => sectionAtBand(context, key, trigger.band));
      if (!every) return out;
      out.held = true;
      out.sectionKeys.push(...trigger.sections);
      return out;
    }
    case 'sections_count_at_band': {
      const matching = context.results.sections.filter((result) =>
        sectionAtBand(context, result.sectionKey, trigger.band)
      );
      if (matching.length < trigger.min) return out;
      out.held = true;
      out.sectionKeys.push(...matching.map((result) => result.sectionKey));
      return out;
    }
    default:
      return out;
  }
}

/** One association's trigger, as the Signal Library loads it: no title, no text, no next step. */
export type AssociationTriggerRow = {
  entryCode: string;
  position: number;
  branch: 'all' | 'a' | 'b';
  trigger: AssociationTrigger;
};

/**
 * Every question named by a held condition of an association that FIRED on
 * this sitting, with the entries that name it.
 *
 * "FIRED" MEANS WHAT IT MEANS ON THE COACH'S CARD: the entry's branch
 * matches hers, its trigger held, and it could cite at least one answer or
 * section. An entry that held on nothing citable is not shown to a coach,
 * so it lends no support here either.
 */
export function questionsInFiredAssociations(
  context: TriggerContext & { branch: 'a' | 'b' },
  rows: readonly AssociationTriggerRow[]
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  for (const row of ordered) {
    if (row.branch !== 'all' && row.branch !== context.branch) continue;
    const outcome = evaluateTrigger(context, row.trigger);
    if (!outcome.held) continue;
    if (outcome.answerRefs.length === 0 && outcome.sectionKeys.length === 0) continue;
    for (const ref of new Set(outcome.heldQuestionRefs)) {
      const held = out.get(ref);
      if (held) {
        if (!held.includes(row.entryCode)) held.push(row.entryCode);
      } else {
        out.set(ref, [row.entryCode]);
      }
    }
  }
  return out;
}
