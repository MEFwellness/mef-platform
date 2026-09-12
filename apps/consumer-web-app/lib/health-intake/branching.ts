/**
 * What a member is actually being asked, given what she has already
 * answered, and what stops existing when she changes her mind.
 *
 * ONE DEFINITION OF "SHOWN", AND EVERY SURFACE READS IT. The taker uses it
 * to decide which screens exist, the server uses it to decide which
 * answers it is willing to store, and the coach's summary uses it to
 * decide what she actually reported. Three copies of this rule would be
 * three chances for a coach to read an answer to a question she was never
 * asked.
 *
 * A FLIPPED GATE STOPS EXISTING, IMMEDIATELY AND EVERYWHERE. A member who
 * said Yes to medications, added two, and comes back and says No has two
 * medications that are no longer true. They are removed from her live
 * answers the moment she confirms, and the server re-applies the same
 * removal on every save and on submit, so a stale page or a hand made POST
 * cannot leave a hidden answer behind. What is archived is archived for
 * audit only: nothing in the coach summary, the safety rules or the
 * questions worth exploring ever reads it, because none of them are ever
 * handed it.
 *
 * THE CONFIRMATION NAMES THE REAL THING. "This will remove the 2
 * medications you added" is counted from her stored entries, not written
 * as a guess, so it can never claim a number she does not have.
 */

import { chunkIntoGroups } from '../questionnaire/groups';
import { INTAKE_SECTIONS, allScreens } from './questions';
import type {
  IntakeAnswers,
  IntakeAnswerValue,
  IntakeCondition,
  IntakeEntry,
  IntakeField,
  IntakeScreen,
} from './types';

/** A stored multi-select, read defensively. Anything that is not a list of strings is no selection. */
export function readSelections(value: IntakeAnswerValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.length > 0) out.push(entry);
  }
  return out;
}

/** A stored entry list, read defensively. */
export function readEntries(value: IntakeAnswerValue | undefined): IntakeEntry[] {
  if (!Array.isArray(value)) return [];
  const out: IntakeEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const clean: IntakeEntry = {};
    for (const [key, raw] of Object.entries(entry as Record<string, unknown>)) {
      if (typeof raw === 'string') clean[key] = raw;
    }
    out.push(clean);
  }
  return out;
}

/** A stored per item map, read defensively. */
export function readItemMap(value: IntakeAnswerValue | undefined): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' && raw.length > 0) out[key] = raw;
  }
  return out;
}

/** A stored text or option answer. */
export function readText(value: IntakeAnswerValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** A stored ten point mark. Zero means unanswered, which is off the scale on purpose. */
export function readScale(value: IntakeAnswerValue | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const whole = Math.round(value);
  return whole >= 1 && whole <= 10 ? whole : 0;
}

/** Whether one field currently holds anything a member actually put there. */
export function fieldIsAnswered(field: IntakeField, answers: IntakeAnswers): boolean {
  const value = answers[field.id];
  switch (field.kind) {
    case 'multi_select':
      return readSelections(value).length > 0;
    case 'entry_list':
      return readEntries(value).length > 0;
    case 'per_item':
      return Object.keys(readItemMap(value)).length > 0;
    case 'scale_ten':
      return readScale(value) > 0;
    default:
      return readText(value).length > 0;
  }
}

function conditionHolds(condition: IntakeCondition, answers: IntakeAnswers): boolean {
  if ('equals' in condition) return readText(answers[condition.fieldId]) === condition.equals;
  if ('oneOf' in condition) return condition.oneOf.includes(readText(answers[condition.fieldId]));
  if ('includesAny' in condition) {
    const selected = readSelections(answers[condition.fieldId]);
    if (condition.includesAny.length === 0) return selected.length > 0;
    return condition.includesAny.some((value) => selected.includes(value));
  }
  const value = answers[condition.fieldId];
  return value !== undefined && readText(value).length + readSelections(value).length > 0;
}

/** Whether one screen is being asked of her right now. */
export function screenIsShown(screen: IntakeScreen, answers: IntakeAnswers): boolean {
  return screen.showWhen === undefined || conditionHolds(screen.showWhen, answers);
}

/** Every screen she is being asked, in order, for the answers she holds. */
export function shownScreens(answers: IntakeAnswers): IntakeScreen[] {
  return allScreens().filter((screen) => screenIsShown(screen, answers));
}

/**
 * Which items one per item follow-up is asked about, in the order its
 * source multi-select offers them.
 *
 * IN THE OFFERED ORDER, NOT THE TAP ORDER, so revisiting a screen never
 * shuffles the questions on it.
 */
export function itemsForFollowUp(
  field: Extract<IntakeField, { kind: 'per_item' }>,
  answers: IntakeAnswers
): string[] {
  const selected = new Set(readSelections(answers[field.sourceFieldId]));
  const order: string[] = [];
  for (const screen of allScreens()) {
    for (const candidate of screen.fields) {
      if (candidate.id !== field.sourceFieldId) continue;
      if (candidate.kind !== 'multi_select') continue;
      for (const option of candidate.options) {
        if (order.includes(option.value)) continue;
        order.push(option.value);
      }
    }
  }
  return order.filter((value) => {
    if (!selected.has(value)) return false;
    if (field.skipValues?.includes(value)) return false;
    if (field.onlyValues && !field.onlyValues.includes(value)) return false;
    return true;
  });
}

/**
 * A per item follow-up cut into screens of two or three, through the
 * shared questionnaire grouping the two existing takers use.
 *
 * REUSED RATHER THAN RE-DERIVED. lib/questionnaire/groups.ts already holds
 * the rule that a run ending in a single question is rebalanced into twos,
 * and a second implementation of it here would drift from the one the
 * other takers obey.
 */
export function followUpGroups(
  field: Extract<IntakeField, { kind: 'per_item' }>,
  answers: IntakeAnswers
): string[][] {
  return chunkIntoGroups(itemsForFollowUp(field, answers));
}

/** Every field on every shown screen. */
export function shownFields(answers: IntakeAnswers): IntakeField[] {
  return shownScreens(answers).flatMap((screen) => screen.fields);
}

/**
 * Her answers with everything she is no longer being asked taken out.
 *
 * THIS IS THE ONLY PLACE AN ANSWER IS DROPPED, and it is run on the client
 * when she confirms a flip, on the server on every save, and on the server
 * again at submit. All three call this one function, so they cannot
 * disagree about what survived.
 *
 * A per item map is pruned to the items still selected, because unselecting
 * one item must not leave its follow-up standing.
 */
export function pruneAnswers(answers: IntakeAnswers): {
  kept: IntakeAnswers;
  dropped: IntakeAnswers;
} {
  const shown = new Map(shownFields(answers).map((field) => [field.id, field]));
  const kept: IntakeAnswers = {};
  const dropped: IntakeAnswers = {};

  for (const [fieldId, value] of Object.entries(answers)) {
    const field = shown.get(fieldId);
    if (!field) {
      dropped[fieldId] = value;
      continue;
    }
    if (field.kind !== 'per_item') {
      kept[fieldId] = value;
      continue;
    }
    const allowed = new Set(itemsForFollowUp(field, answers));
    const stored = readItemMap(value);
    const keptMap: Record<string, string> = {};
    const droppedMap: Record<string, string> = {};
    for (const [item, itemValue] of Object.entries(stored)) {
      if (allowed.has(item)) keptMap[item] = itemValue;
      else droppedMap[item] = itemValue;
    }
    if (Object.keys(keptMap).length > 0) kept[fieldId] = keptMap;
    if (Object.keys(droppedMap).length > 0) dropped[fieldId] = droppedMap;
  }

  return { kept, dropped };
}

/**
 * What one phrase of the removal confirmation says about one field.
 *
 * Counted from what is stored. An entry list says how many entries, a per
 * item follow-up how many answers, and everything else names itself once.
 */
function removalPhrase(field: IntakeField, value: IntakeAnswerValue): string | null {
  switch (field.kind) {
    case 'entry_list': {
      const count = readEntries(value).length;
      if (count === 0) return null;
      return `the ${count} ${count === 1 ? field.noun.one : field.noun.many} you added`;
    }
    case 'per_item': {
      const count = Object.keys(readItemMap(value)).length;
      if (count === 0) return null;
      return `the ${count} ${count === 1 ? field.noun.one : field.noun.many}`;
    }
    case 'multi_select': {
      const count = readSelections(value).length;
      if (count === 0) return null;
      return `the ${count} ${count === 1 ? 'thing' : 'things'} you chose under "${field.label}"`;
    }
    case 'scale_ten':
      return readScale(value) > 0 ? `your answer to "${field.label}"` : null;
    default:
      return readText(value).length > 0 ? `your answer to "${field.label}"` : null;
  }
}

/** The phrases joined the way a person would say them. */
function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return '';
  if (phrases.length === 1) return phrases[0]!;
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1]}`;
}

export type RemovalPreview = {
  /** True when changing this answer costs her nothing, so no confirmation is needed. */
  isEmpty: boolean;
  /** The one sentence the confirmation prints. Empty when isEmpty. */
  sentence: string;
  /** The field ids that would stop existing. For tests, and for nothing on a screen. */
  fieldIds: string[];
};

/**
 * What changing one answer to one new value would remove.
 *
 * Computed by ASKING THE SAME VISIBILITY FUNCTION what would be shown
 * afterwards, rather than by consulting a branch table. A screen and its
 * confirmation therefore cannot fall out of step: if a screen would
 * disappear, its answers are in this preview, whatever it was that opened
 * it.
 */
export function previewChange(
  answers: IntakeAnswers,
  fieldId: string,
  nextValue: IntakeAnswerValue
): RemovalPreview {
  const next: IntakeAnswers = { ...answers, [fieldId]: nextValue };
  const { dropped } = pruneAnswers(next);

  const byId = new Map(allScreens().flatMap((screen) => screen.fields).map((f) => [f.id, f]));
  const phrases: string[] = [];
  const fieldIds: string[] = [];
  for (const [droppedId, value] of Object.entries(dropped)) {
    const field = byId.get(droppedId);
    if (!field) continue;
    const phrase = removalPhrase(field, value);
    if (!phrase) continue;
    phrases.push(phrase);
    fieldIds.push(droppedId);
  }

  if (phrases.length === 0) return { isEmpty: true, sentence: '', fieldIds: [] };
  return { isEmpty: false, sentence: `This will remove ${joinPhrases(phrases)}.`, fieldIds };
}

/**
 * A multi-select's exclusive option applied.
 *
 * "No meaningful change" cannot stand beside "Stairs", so choosing it
 * clears everything else and choosing anything else clears it. The rule is
 * here rather than in the component so the server applies it to a hand
 * made POST too.
 */
export function applyMultiSelect(
  field: Extract<IntakeField, { kind: 'multi_select' }>,
  current: string[],
  value: string
): string[] {
  const option = field.options.find((entry) => entry.value === value);
  if (!option) return current;
  const exclusives = new Set(
    field.options.filter((entry) => entry.exclusive).map((entry) => entry.value)
  );
  if (current.includes(value)) return current.filter((entry) => entry !== value);
  if (option.exclusive) return [value];
  return [...current.filter((entry) => !exclusives.has(entry)), value];
}

/** Which section one screen belongs to, and where it sits in the eleven. */
export function sectionForScreen(screen: IntakeScreen) {
  return INTAKE_SECTIONS.find((section) => section.key === screen.sectionKey) ?? null;
}
