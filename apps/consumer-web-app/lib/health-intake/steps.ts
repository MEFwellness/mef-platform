/**
 * The walk: every screen she sees, in order, for the answers she holds.
 *
 * REBUILT FROM HER ANSWERS EVERY TIME, never stored. A gate she flips
 * changes how many screens exist, so a list built yesterday is a list
 * about a different member. The only thing stored about position is an
 * index, and nothing trusts it (see resumeStepIndex).
 *
 * EACH CHAPTER OPENS WITH ITS OWN SCREEN. The soft counter, the title and
 * one warm framing line, with the chapter's transition sentence above it
 * when it has one. The transition is part of the chapter screen rather
 * than a screen of its own, because a sentence on an otherwise empty
 * screen is a member tapping Continue to read nine words.
 *
 * A PER ITEM FOLLOW-UP BECOMES TWO OR THREE QUESTIONS A SCREEN, through
 * lib/questionnaire/groups.ts, the same grouping the Body Systems Survey
 * and the generic questionnaire already use. Eleven follow-ups on one
 * screen would be the wall this instrument exists not to be, and one per
 * screen would be eleven taps to say the same thing three ways.
 */

import { INTAKE_SECTIONS, INTAKE_SECTION_COUNT } from './questions';
import { fieldIsAnswered, followUpGroups, screenIsShown } from './branching';
import type { IntakeAnswers, IntakeField, IntakeScreen, IntakeSection } from './types';

export type IntakeStep =
  | {
      kind: 'chapter';
      sectionKey: IntakeSection['key'];
      sectionNumber: number;
      sectionCount: number;
    }
  | {
      kind: 'screen';
      screenId: string;
      sectionKey: IntakeSection['key'];
      sectionNumber: number;
      sectionCount: number;
    }
  | {
      kind: 'followup';
      screenId: string;
      fieldId: string;
      items: string[];
      /** Which of this follow-up's screens this is, counting from one. */
      groupNumber: number;
      groupCount: number;
      sectionKey: IntakeSection['key'];
      sectionNumber: number;
      sectionCount: number;
    }
  | { kind: 'completion' };

/** True when this screen is nothing but one binary gate, the only auto-advancing screen. */
export function isGateScreen(screen: IntakeScreen): boolean {
  return screen.fields.length === 1 && screen.fields[0]!.kind === 'gate';
}

function perItemField(screen: IntakeScreen): Extract<IntakeField, { kind: 'per_item' }> | null {
  const only = screen.fields.length === 1 ? screen.fields[0]! : null;
  return only && only.kind === 'per_item' ? only : null;
}

export function buildSteps(answers: IntakeAnswers): IntakeStep[] {
  const steps: IntakeStep[] = [];
  const sectionCount = INTAKE_SECTION_COUNT;

  for (const section of INTAKE_SECTIONS) {
    const shown = section.screens.filter((screen) => screenIsShown(screen, answers));
    // A chapter with nothing to ask is not a chapter. Its opener is
    // skipped with it rather than left as a heading over nothing.
    if (shown.length === 0) continue;

    const shared = {
      sectionKey: section.key,
      sectionNumber: section.number,
      sectionCount,
    } as const;

    steps.push({ kind: 'chapter', ...shared });

    for (const screen of shown) {
      const perItem = perItemField(screen);
      if (!perItem) {
        steps.push({ kind: 'screen', screenId: screen.id, ...shared });
        continue;
      }
      const groups = followUpGroups(perItem, answers);
      groups.forEach((items, index) => {
        steps.push({
          kind: 'followup',
          screenId: screen.id,
          fieldId: perItem.id,
          items,
          groupNumber: index + 1,
          groupCount: groups.length,
          ...shared,
        });
      });
    }
  }

  steps.push({ kind: 'completion' });
  return steps;
}

/** The index of the completion screen, which is always the last step. */
export function completionStepIndex(steps: IntakeStep[]): number {
  return Math.max(0, steps.length - 1);
}

export function clampStepIndex(steps: IntakeStep[], index: number): number {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.min(Math.floor(index), completionStepIndex(steps));
}

/** Every field on one step, for deciding whether it has been dealt with. */
function fieldsOnStep(step: IntakeStep): IntakeField[] {
  if (step.kind !== 'screen') return [];
  for (const section of INTAKE_SECTIONS) {
    const screen = section.screens.find((entry) => entry.id === step.screenId);
    if (screen) return screen.fields;
  }
  return [];
}

/**
 * Whether a field is one she has to answer before the walk moves past it.
 *
 * A gate is always required: it is the question that decides what comes
 * next, so a blank one leaves the branch undecided.
 */
export function fieldIsRequired(field: IntakeField): boolean {
  switch (field.kind) {
    case 'gate':
    case 'per_item':
    case 'scale_ten':
    case 'time':
    case 'entry_list':
      return true;
    default:
      return field.optional !== true;
  }
}

/**
 * Whether a step still needs her.
 *
 * A step is dealt with when every REQUIRED field on it holds something.
 * An optional field never holds a step open, because a member who
 * deliberately left one blank would otherwise be sent back to it forever
 * on every resume.
 */
export function stepIsAnswered(step: IntakeStep, answers: IntakeAnswers): boolean {
  if (step.kind === 'chapter' || step.kind === 'completion') return true;

  if (step.kind === 'followup') {
    const stored = answers[step.fieldId];
    const map =
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? (stored as Record<string, string>)
        : {};
    return step.items.every((item) => typeof map[item] === 'string' && map[item]!.length > 0);
  }

  return fieldsOnStep(step)
    .filter(fieldIsRequired)
    .every((field) => fieldIsAnswered(field, answers));
}

/**
 * Where she picks up.
 *
 * DERIVED FROM HER ANSWERS, NEVER FROM THE STORED INDEX ALONE. A gate she
 * flipped changes the length of the walk, so an index written yesterday
 * can name a different screen today. The stored index moves her forward
 * through screens she deliberately left blank, because those are optional
 * and her answers cannot prove she saw them. It can never move her PAST
 * the first screen that still genuinely needs her, which is what makes a
 * reopened branch pull her back to it rather than stranding it unanswered.
 */
export function firstOpenStepIndex(steps: IntakeStep[], answers: IntakeAnswers): number {
  for (let index = 0; index < steps.length; index += 1) {
    if (!stepIsAnswered(steps[index]!, answers)) return index;
  }
  return completionStepIndex(steps);
}

export function resumeStepIndex(
  steps: IntakeStep[],
  answers: IntakeAnswers,
  storedIndex: number
): number {
  return Math.min(clampStepIndex(steps, storedIndex), firstOpenStepIndex(steps, answers));
}

/**
 * How far through the whole intake she is, as a fraction, for the thin
 * line.
 *
 * IT COUNTS THE SCREENS THAT ASK HER SOMETHING, chapters and the
 * completion excluded, because a line that jumped forward on a screen she
 * only read would be measuring the app rather than her.
 */
export function progressFraction(steps: IntakeStep[], stepIndex: number): number {
  const asking = steps.filter((step) => step.kind === 'screen' || step.kind === 'followup');
  if (asking.length === 0) return 0;
  const before = steps
    .slice(0, Math.max(0, Math.min(stepIndex, steps.length)))
    .filter((step) => step.kind === 'screen' || step.kind === 'followup').length;
  return Math.max(0, Math.min(1, before / asking.length));
}

/** "03 of 11", the soft counter. Two digits up to ninety nine. */
export function chapterCounter(sectionNumber: number, sectionCount: number): string {
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value));
  return `${pad(sectionNumber)} of ${pad(sectionCount)}`;
}
