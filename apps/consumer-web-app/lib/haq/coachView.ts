/**
 * WHAT A COACH SEES OF ONE HEALTH APPRAISAL SITTING, arranged so that the
 * reason for a result is never more than one tap away.
 *
 * THE COACH NEVER CALCULATES ANYTHING. Every number on his screen is one the
 * database already stored: the section's raw total, and the hidden value
 * behind each answer. This module sorts and names them, and computes nothing
 * that decides a result.
 *
 * LOUDEST FIRST, TWICE OVER. Sections stand Red, then Yellow, then Green,
 * and inside a section the answers stand by what each one was worth, highest
 * first, so the handful of responses that made a section Red are the first
 * thing he reads.
 *
 * NOTHING IS EVER OVERWRITTEN. A retake is a new instance. An earlier
 * sitting keeps its own answers, its own totals and its own results, and a
 * comparison reads the earlier one, it never edits it.
 *
 * OFF THE MEMBER'S IMPORT GRAPH. This module carries totals and hidden
 * values, so no member file may reach it (tests/haq-member-safety.test.ts).
 */

import { haqBodyIssueLabel, haqBodyMarkPlace, type HaqBodyMark, type HaqBodySide } from './bodyMap';
import { HAQ_QUESTIONS, HAQ_RESPONSE_OPTIONS, HAQ_SECTIONS, haqPartOf, haqPromptAtVersion } from './questionBank';
import { HAQ_RESULT_COLOR_ORDER, haqTrend } from './results';
import type {
  HaqCoachInstance,
  HaqCoachQuestionResponseRow,
  HaqCoachSectionResultRow,
} from './coachData';
import type {
  HaqMemberResultLabel,
  HaqOriginalPriority,
  HaqResultColor,
  HaqTrend,
} from './types';

/** One sitting as the history list names it. */
export type CoachHaqSittingSummary = {
  sessionId: string;
  completedAt: string | null;
  haqVersion: string;
  /** How many of the 21 sections stand in each state. */
  counts: Record<HaqResultColor, number>;
  /** False when the sitting's results could not be read, which is a thing to say rather than hide. */
  hasResults: boolean;
};

/** One answer of one section, with what it was worth. */
export type CoachHaqQuestionDetail = {
  questionKey: string;
  prompt: string;
  /** The stored response name, as the database holds it. */
  selectedResponse: string;
  /** The same response in the words the member actually tapped. */
  responseLabel: string;
  hiddenValue: number;
};

/** The same section in the sitting before this one. */
export type CoachHaqSectionComparison = {
  rawTotal: number;
  resultColor: HaqResultColor;
  memberResultLabel: HaqMemberResultLabel;
  trend: HaqTrend;
};

export type CoachHaqSectionDetail = {
  sectionId: string;
  sectionTitle: string;
  /** The Part this section belongs to, by name. */
  partName: string;
  rawTotal: number;
  resultColor: HaqResultColor;
  memberResultLabel: HaqMemberResultLabel;
  /** The instrument's own priority word: Low, Moderate or High Priority. */
  originalPriority: HaqOriginalPriority;
  /** Every question of the section, highest value first, then in the order she answered them. */
  questions: CoachHaqQuestionDetail[];
  previous: CoachHaqSectionComparison | null;
};

/** One body map mark, with the words the coach reads it under. */
export type CoachHaqBodyMark = {
  id: string;
  side: HaqBodySide;
  /** The stored area, which is what the figure fills in. Always her own side, never the picture's. */
  location: string;
  /** "Left knee (front)", already in HER own left and right. */
  place: string;
  /** Pain, Swelling, Discomfort or Skin change. */
  category: string;
};

export type CoachHaqSitting = {
  sessionId: string;
  memberId: string;
  completedAt: string | null;
  haqVersion: string;
  /** Red, then Yellow, then Green, then the instrument's own section order. */
  sections: CoachHaqSectionDetail[];
  marks: CoachHaqBodyMark[];
  /** The sitting this one is compared with, or null when this is her first. */
  previousSitting: { sessionId: string; completedAt: string | null } | null;
};

/**
 * Everything the client Detail page's Health Appraisal card renders.
 *
 * THE FIELD IS `sessions` SO THE SHARED PREDICATE FITS IT. Every deep dive
 * panel on that page renders nothing without a sitting behind it, and the
 * Deep-Dive Results heading is drawn from the same predicate over all of
 * them (lib/coach-detail/deepDiveResults.ts). One name, one predicate, and
 * no heading over a row of nulls.
 */
export type CoachHaqPanelState = {
  memberId: string | null;
  /** Every finished sitting, newest first. Nothing is ever hidden or replaced. */
  sessions: CoachHaqSittingSummary[];
};

export const EMPTY_HAQ_PANEL: CoachHaqPanelState = { memberId: null, sessions: [] };

function emptyCounts(): Record<HaqResultColor, number> {
  return { red: 0, yellow: 0, green: 0 };
}

function sectionTitleOf(sectionId: string): string {
  return HAQ_SECTIONS.find((section) => section.id === sectionId)?.title ?? sectionId;
}

function sectionOrderOf(sectionId: string): number {
  return HAQ_SECTIONS.find((section) => section.id === sectionId)?.order ?? Number.MAX_SAFE_INTEGER;
}

function partNameOf(sectionId: string): string {
  const section = HAQ_SECTIONS.find((candidate) => candidate.id === sectionId);
  return section ? haqPartOf(section.partId).name : '';
}

function questionOrderOf(questionKey: string): number {
  const index = HAQ_QUESTIONS.findIndex((question) => question.key === questionKey);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/** The words she was asked in that sitting, which for a reworded question are its earlier ones. */
function promptOf(questionKey: string, questionVersion: number): string {
  return haqPromptAtVersion(questionKey, questionVersion) ?? questionKey;
}

function responseLabelOf(row: HaqCoachQuestionResponseRow): string {
  const options = HAQ_RESPONSE_OPTIONS[row.responseType] ?? [];
  return options.find((option) => option.value === row.selectedResponse)?.label ?? row.selectedResponse;
}

/** The history list: one row per sitting, with what each sitting read. */
export function buildHaqSittingSummaries(
  instances: readonly HaqCoachInstance[],
  results: readonly HaqCoachSectionResultRow[]
): CoachHaqSittingSummary[] {
  const bySitting = new Map<string, Record<HaqResultColor, number>>();
  for (const row of results) {
    const counts = bySitting.get(row.sessionId) ?? emptyCounts();
    counts[row.resultColor] += 1;
    bySitting.set(row.sessionId, counts);
  }

  return instances.map((instance) => {
    const counts = bySitting.get(instance.sessionId);
    return {
      sessionId: instance.sessionId,
      completedAt: instance.completedAt,
      haqVersion: instance.haqVersion,
      counts: counts ?? emptyCounts(),
      hasResults: counts !== undefined,
    };
  });
}

/** Red, then Yellow, then Green, and inside one colour the instrument's own section order. */
function bySeverityThenOrder(a: CoachHaqSectionDetail, b: CoachHaqSectionDetail): number {
  const byColor = HAQ_RESULT_COLOR_ORDER.indexOf(a.resultColor) - HAQ_RESULT_COLOR_ORDER.indexOf(b.resultColor);
  return byColor !== 0 ? byColor : sectionOrderOf(a.sectionId) - sectionOrderOf(b.sectionId);
}

/**
 * One whole sitting, ready to render.
 *
 * `previousResults` is the same read of the sitting before this one, or null
 * when this is her first: a section absent from it gets no comparison rather
 * than an invented one.
 */
export function buildCoachHaqSitting(input: {
  instance: HaqCoachInstance;
  results: readonly HaqCoachSectionResultRow[];
  responses: readonly HaqCoachQuestionResponseRow[];
  marks: readonly HaqBodyMark[];
  previousInstance: HaqCoachInstance | null;
  previousResults: readonly HaqCoachSectionResultRow[] | null;
}): CoachHaqSitting {
  const before = new Map((input.previousResults ?? []).map((row) => [row.sectionId, row]));

  const responsesBySection = new Map<string, HaqCoachQuestionResponseRow[]>();
  for (const row of input.responses) {
    const list = responsesBySection.get(row.sectionId) ?? [];
    list.push(row);
    responsesBySection.set(row.sectionId, list);
  }

  const sections = input.results.map((result): CoachHaqSectionDetail => {
    const was = before.get(result.sectionId);
    const questions = (responsesBySection.get(result.sectionId) ?? [])
      .map((row) => ({
        questionKey: row.questionKey,
        prompt: promptOf(row.questionKey, row.questionVersion),
        selectedResponse: row.selectedResponse,
        responseLabel: responseLabelOf(row),
        hiddenValue: row.hiddenValue,
      }))
      // THE DRIVERS FIRST. Highest value first, so what made this section
      // Red is at the top; equal values keep the instrument's own order so
      // the list never reshuffles between two visits.
      .sort((a, b) => b.hiddenValue - a.hiddenValue || questionOrderOf(a.questionKey) - questionOrderOf(b.questionKey));

    return {
      sectionId: result.sectionId,
      sectionTitle: sectionTitleOf(result.sectionId),
      partName: partNameOf(result.sectionId),
      rawTotal: result.rawTotal,
      resultColor: result.resultColor,
      memberResultLabel: result.memberResultLabel,
      originalPriority: result.originalPriority,
      questions,
      previous: was
        ? {
            rawTotal: was.rawTotal,
            resultColor: was.resultColor,
            memberResultLabel: was.memberResultLabel,
            trend: haqTrend(was.resultColor, result.resultColor),
          }
        : null,
    };
  });

  sections.sort(bySeverityThenOrder);

  return {
    sessionId: input.instance.sessionId,
    memberId: input.instance.memberId,
    completedAt: input.instance.completedAt,
    haqVersion: input.instance.haqVersion,
    sections,
    marks: input.marks.map((mark) => ({
      id: mark.id,
      side: mark.side,
      location: mark.location,
      place: haqBodyMarkPlace(mark),
      category: haqBodyIssueLabel(mark.issueType),
    })),
    previousSitting:
      input.previousInstance && input.previousResults && input.previousResults.length > 0
        ? { sessionId: input.previousInstance.sessionId, completedAt: input.previousInstance.completedAt }
        : null,
  };
}
