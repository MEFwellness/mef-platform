/**
 * The walk through the Health Appraisal: which questions stand on which
 * screen, which Part and Section a screen belongs to, and where a member
 * picks up.
 *
 * TWO OR THREE QUESTIONS A SCREEN, NEVER ACROSS A SECTION. The sizes come
 * from lib/questionnaire/groups.ts, the one rule the other questionnaires
 * already share, and every section is cut on its own, so the beat between
 * two sections always falls between two screens.
 *
 * WHERE SHE PICKS UP IS DERIVED FROM HER ANSWERS. The first screen holding a
 * question she has not answered, or the body map once all 260 are answered.
 * Her answers are the one record that cannot be stale; the runtime's stored
 * pointer can be (see the header of components/assessments/AssessmentTaker.tsx).
 *
 * PURE AND MEMBER SAFE. Words, structure and positions only. Nothing here
 * knows what an answer is worth.
 */

import { chunkIntoGroups } from '@/lib/questionnaire/groups';
import { HAQ_PART_COUNT } from './constants';
import { HAQ_QUESTIONS, HAQ_RESPONSE_OPTIONS, HAQ_SECTIONS } from './questionBank';
import type { HaqQuestion, HaqResponse, HaqSection } from './types';

export type HaqScreen = {
  /** Position in the walk, from zero. The body map is the index after the last screen. */
  index: number;
  section: HaqSection;
  /** 1 to 10, read from the part id, which is what "Part X of 10" prints. */
  partNumber: number;
  questions: HaqQuestion[];
};

/** Her answers as the walk reads them: question key to the chosen response. */
export type HaqAnswers = Record<string, HaqResponse>;

export function haqPartNumber(partId: string): number {
  const match = /^haq_p(\d+)$/.exec(partId);
  return match ? Number(match[1]) : 0;
}

/** Every question screen, in order. */
export function buildHaqScreens(): HaqScreen[] {
  const screens: HaqScreen[] = [];
  for (const section of HAQ_SECTIONS) {
    const questions = HAQ_QUESTIONS.filter((question) => question.sectionId === section.id);
    for (const group of chunkIntoGroups(questions)) {
      screens.push({
        index: screens.length,
        section,
        partNumber: haqPartNumber(section.partId),
        questions: group,
      });
    }
  }
  return screens;
}

/** The index of the body map step, which follows the last question screen. */
export function haqBodyMapIndex(screens: readonly HaqScreen[]): number {
  return screens.length;
}

/** Is this an answer the question's own response type accepts. */
export function isHaqResponseFor(question: HaqQuestion, value: unknown): value is HaqResponse {
  return HAQ_RESPONSE_OPTIONS[question.responseType].some((option) => option.value === value);
}

/**
 * Only the answers a member could have given: a known question, and a value
 * that question's response type accepts. Anything else reads as unanswered,
 * because missing is not zero and a stray value is not an answer.
 */
export function sanitizeHaqAnswers(raw: Record<string, unknown>): HaqAnswers {
  const out: HaqAnswers = {};
  for (const question of HAQ_QUESTIONS) {
    const value = raw[question.key];
    if (isHaqResponseFor(question, value)) out[question.key] = value;
  }
  return out;
}

export function isHaqScreenAnswered(screen: HaqScreen, answers: HaqAnswers): boolean {
  return screen.questions.every((question) => answers[question.key] !== undefined);
}

/** Where reopening puts her: the first screen with a question she has not answered, else the body map. */
export function resumeHaqScreenIndex(screens: readonly HaqScreen[], answers: HaqAnswers): number {
  const found = screens.findIndex((screen) => !isHaqScreenAnswered(screen, answers));
  return found === -1 ? haqBodyMapIndex(screens) : found;
}

export function allHaqQuestionsAnswered(answers: HaqAnswers): boolean {
  return HAQ_QUESTIONS.every((question) => answers[question.key] !== undefined);
}

/**
 * How full the thin line is, nought to one hundred.
 *
 * THE LINE IS "PART X OF 10" DRAWN. It fills a tenth per Part, and moves
 * through a Part screen by screen so it is not frozen for a Part of forty
 * questions. It never counts questions, so it cannot become a remaining
 * question count by another name. The body map is the end of the line.
 */
export function haqProgressPercent(screens: readonly HaqScreen[], index: number): number {
  const screen = screens[index];
  if (!screen) return 100;
  const inPart = screens.filter((candidate) => candidate.partNumber === screen.partNumber);
  const position = inPart.indexOf(screen);
  const withinPart = inPart.length > 0 ? position / inPart.length : 0;
  return Math.round(((screen.partNumber - 1 + withinPart) / HAQ_PART_COUNT) * 100);
}

export function haqProgressLabel(partNumber: number): string {
  return `Part ${partNumber} of ${HAQ_PART_COUNT}`;
}

/** The small line above the section name: the printed Part, and the Section letter where the Part has more than one. */
export function haqPartHeading(section: HaqSection): string {
  return section.sectionLetter ? `${section.partLabel}, Section ${section.sectionLetter}` : section.partLabel;
}

/** True when moving from one screen to the next crosses into a different section. */
export function crossesHaqSection(screens: readonly HaqScreen[], from: number, to: number): boolean {
  const current = screens[from];
  if (!current) return false;
  const next = screens[to];
  return !next || next.section.id !== current.section.id;
}
