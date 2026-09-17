/**
 * WHAT THE COACH IS SHOWN OF ONE SITTING, before any database is involved.
 *
 * The arrangement is the whole of this module's job, and it is what decides
 * whether he can see why a section read the way it did without adding
 * anything up: sections loudest first, and inside a section the answers by
 * what each one was worth, highest first.
 *
 * The numbers themselves are proved equal to the database's own in
 * tests/haq-coach-integration.test.ts. Here the rows are the rows the
 * database would have returned.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCoachHaqSitting,
  buildHaqSittingSummaries,
  type CoachHaqSitting,
} from '../lib/haq/coachView';
import type {
  HaqCoachInstance,
  HaqCoachQuestionResponseRow,
  HaqCoachSectionResultRow,
} from '../lib/haq/coachData';
import { HAQ_QUESTIONS, HAQ_SECTIONS, haqPartOf } from '../lib/haq/questionBank';
import { HAQ_RESULT_STATES } from '../lib/haq/scoring';
import type { HaqResultColor } from '../lib/haq/types';

const SITTING: HaqCoachInstance = {
  sessionId: 'sitting-now',
  memberId: 'member-1',
  completedAt: '2026-09-17T14:00:00.000Z',
  haqVersion: 'haq_v1',
};

const EARLIER: HaqCoachInstance = {
  sessionId: 'sitting-before',
  memberId: 'member-1',
  completedAt: '2026-06-17T14:00:00.000Z',
  haqVersion: 'haq_v1',
};

function resultRow(sessionId: string, sectionId: string, rawTotal: number, color: HaqResultColor): HaqCoachSectionResultRow {
  const state = HAQ_RESULT_STATES[color];
  return {
    sessionId,
    sectionId,
    rawTotal,
    resultColor: color,
    memberResultLabel: state.memberResultLabel,
    originalPriority: state.originalPriority,
    haqVersion: 'haq_v1',
  };
}

/** One response row per question of a section, each worth what it is given. */
function responsesFor(sectionId: string, values: readonly number[]): HaqCoachQuestionResponseRow[] {
  const questions = HAQ_QUESTIONS.filter((question) => question.sectionId === sectionId);
  return questions.map((question, index) => {
    const value = values[index % values.length]!;
    const selected =
      question.responseType === 'yes_no'
        ? value === 0
          ? 'no'
          : 'yes'
        : value === 0
          ? 'never_or_rarely'
          : value === 1
            ? 'sometimes'
            : value === 4
              ? 'often'
              : 'very_often';
    return {
      sectionId,
      questionKey: question.key,
      responseType: question.responseType,
      selectedResponse: selected,
      hiddenValue: value,
      answeredAt: '2026-09-17T13:00:00.000Z',
    };
  });
}

const COLORS: HaqResultColor[] = HAQ_SECTIONS.map((_, index) =>
  index % 3 === 0 ? 'green' : index % 3 === 1 ? 'red' : 'yellow'
);

function sittingOf(options: { withPrevious?: boolean } = {}): CoachHaqSitting {
  const results = HAQ_SECTIONS.map((section, index) =>
    resultRow(SITTING.sessionId, section.id, index * 2, COLORS[index]!)
  );
  // The earlier sitting: the first section was Red and the second Green, so
  // one moves each way and the rest sit still.
  const previousResults = HAQ_SECTIONS.map((section, index) =>
    resultRow(
      EARLIER.sessionId,
      section.id,
      index,
      index === 0 ? 'red' : index === 1 ? 'green' : COLORS[index]!
    )
  );

  return buildCoachHaqSitting({
    instance: SITTING,
    results,
    responses: HAQ_SECTIONS.flatMap((section) => responsesFor(section.id, [8, 0, 4, 1, 0])),
    marks: [
      { id: 'm1', location: 'abdomen', side: 'front', issueType: 'discomfort' },
      { id: 'm2', location: 'right_shoulder_back', side: 'back', issueType: 'skin_change' },
    ],
    previousInstance: options.withPrevious ? EARLIER : null,
    previousResults: options.withPrevious ? previousResults : null,
  });
}

describe('the 21 sections, arranged so the reason is never behind the result', () => {
  it('stand Red, then Yellow, then Green, and inside one colour in the instrument\'s own order', () => {
    const sitting = sittingOf();
    expect(sitting.sections).toHaveLength(21);

    const colors = sitting.sections.map((section) => section.resultColor);
    expect(colors.lastIndexOf('red')).toBeLessThan(colors.indexOf('yellow'));
    expect(colors.lastIndexOf('yellow')).toBeLessThan(colors.indexOf('green'));

    for (const color of ['red', 'yellow', 'green'] as const) {
      const orders = sitting.sections
        .filter((section) => section.resultColor === color)
        .map((section) => HAQ_SECTIONS.findIndex((candidate) => candidate.id === section.sectionId));
      expect([...orders], color).toEqual([...orders].sort((a, b) => a - b));
    }
  });

  it('carry the section name, its Part name, the raw total, the colour, the member label and the original priority', () => {
    for (const section of sittingOf().sections) {
      const authored = HAQ_SECTIONS.find((candidate) => candidate.id === section.sectionId)!;
      expect(section.sectionTitle).toBe(authored.title);
      expect(section.partName).toBe(haqPartOf(authored.partId).name);
      expect(Number.isInteger(section.rawTotal)).toBe(true);
      expect(section.memberResultLabel).toBe(HAQ_RESULT_STATES[section.resultColor].memberResultLabel);
      expect(section.originalPriority).toBe(HAQ_RESULT_STATES[section.resultColor].originalPriority);
    }
  });

  it('map Green to Low Priority, Yellow to Moderate Priority and Red to High Priority', () => {
    const byColor = new Map(sittingOf().sections.map((section) => [section.resultColor, section.originalPriority]));
    expect(byColor.get('green')).toBe('Low Priority');
    expect(byColor.get('yellow')).toBe('Moderate Priority');
    expect(byColor.get('red')).toBe('High Priority');
  });
});

describe('the answers behind one section', () => {
  it('are every question of that section, with the value each one was worth', () => {
    const sitting = sittingOf();
    for (const section of sitting.sections) {
      const expected = HAQ_QUESTIONS.filter((question) => question.sectionId === section.sectionId);
      expect(section.questions, section.sectionId).toHaveLength(expected.length);
      expect(new Set(section.questions.map((q) => q.questionKey))).toEqual(
        new Set(expected.map((question) => question.key))
      );
      for (const question of section.questions) {
        const authored = expected.find((candidate) => candidate.key === question.questionKey)!;
        expect(question.prompt).toBe(authored.prompt);
        expect(typeof question.hiddenValue).toBe('number');
        // The response name and the words she actually tapped, together.
        expect(question.responseLabel).not.toBe('');
        expect(question.responseLabel).not.toBe(question.selectedResponse);
      }
    }
  });

  it('stand highest value first, so the drivers of the result are the first thing he reads', () => {
    for (const section of sittingOf().sections) {
      const values = section.questions.map((question) => question.hiddenValue);
      expect([...values], section.sectionId).toEqual([...values].sort((a, b) => b - a));
      expect(values[0]).toBe(8);
    }
  });

  it('keep the instrument\'s own order among answers worth the same, so the list never reshuffles', () => {
    const section = sittingOf().sections.find((candidate) => candidate.questions.length > 4)!;
    const eights = section.questions.filter((question) => question.hiddenValue === 8).map((q) => q.questionKey);
    const authoredOrder = HAQ_QUESTIONS.filter((question) => eights.includes(question.key)).map((q) => q.key);
    expect(eights).toEqual(authoredOrder);
  });
});

describe('the sitting before this one', () => {
  it('is absent when there is none, and no section carries a comparison', () => {
    const sitting = sittingOf();
    expect(sitting.previousSitting).toBeNull();
    expect(sitting.sections.every((section) => section.previous === null)).toBe(true);
  });

  it('gives every section its previous colour and raw total beside the current ones, with the same three words', () => {
    const sitting = sittingOf({ withPrevious: true });
    expect(sitting.previousSitting).toEqual({
      sessionId: EARLIER.sessionId,
      completedAt: EARLIER.completedAt,
    });
    expect(sitting.sections.every((section) => section.previous !== null)).toBe(true);

    const find = (sectionId: string) => sitting.sections.find((section) => section.sectionId === sectionId)!;
    // Section one was Red and is now Green: Quieter. Section two was Green and is Red: Louder.
    const first = find(HAQ_SECTIONS[0]!.id);
    expect(first.previous).toMatchObject({ resultColor: 'red', rawTotal: 0, trend: 'quieter' });
    expect(first.resultColor).toBe('green');

    const second = find(HAQ_SECTIONS[1]!.id);
    expect(second.previous).toMatchObject({ resultColor: 'green', rawTotal: 1, trend: 'louder' });
    expect(second.resultColor).toBe('red');

    const third = find(HAQ_SECTIONS[2]!.id);
    expect(third.previous?.trend).toBe('unchanged');

    for (const section of sitting.sections) {
      expect(['quieter', 'unchanged', 'louder']).toContain(section.previous!.trend);
    }
  });

  it('a section the earlier sitting did not carry gets no comparison rather than a guessed one', () => {
    const sitting = buildCoachHaqSitting({
      instance: SITTING,
      results: HAQ_SECTIONS.map((section, index) => resultRow(SITTING.sessionId, section.id, index, 'red')),
      responses: [],
      marks: [],
      previousInstance: EARLIER,
      previousResults: [resultRow(EARLIER.sessionId, HAQ_SECTIONS[0]!.id, 0, 'green')],
    });
    expect(sitting.sections.filter((section) => section.previous !== null)).toHaveLength(1);
    expect(sitting.sections.find((s) => s.sectionId === HAQ_SECTIONS[0]!.id)!.previous!.trend).toBe('louder');
  });
});

describe('the body map, kept apart from the scored content', () => {
  it('carries each mark\'s own area, view and category, in her own left and right', () => {
    const sitting = sittingOf();
    expect(sitting.marks).toEqual([
      { id: 'm1', side: 'front', location: 'abdomen', place: 'Abdomen (front)', category: 'Discomfort' },
      {
        id: 'm2',
        side: 'back',
        location: 'right_shoulder_back',
        place: 'Back of right shoulder (back)',
        category: 'Skin change',
      },
    ]);
  });

  it('never reaches a section total', () => {
    const withMarks = sittingOf();
    const withoutMarks = buildCoachHaqSitting({
      instance: SITTING,
      results: HAQ_SECTIONS.map((section, index) => resultRow(SITTING.sessionId, section.id, index * 2, COLORS[index]!)),
      responses: HAQ_SECTIONS.flatMap((section) => responsesFor(section.id, [8, 0, 4, 1, 0])),
      marks: [],
      previousInstance: null,
      previousResults: null,
    });
    expect(withMarks.sections.map((s) => s.rawTotal)).toEqual(withoutMarks.sections.map((s) => s.rawTotal));
  });
});

describe('the history list on the client Detail page', () => {
  it('names every sitting, newest first, with how its 21 areas read', () => {
    const results = [
      ...HAQ_SECTIONS.map((section, index) => resultRow(SITTING.sessionId, section.id, index, COLORS[index]!)),
      ...HAQ_SECTIONS.map((section) => resultRow(EARLIER.sessionId, section.id, 0, 'green')),
    ];
    const summaries = buildHaqSittingSummaries([SITTING, EARLIER], results);

    expect(summaries.map((summary) => summary.sessionId)).toEqual([SITTING.sessionId, EARLIER.sessionId]);
    expect(summaries[1]!.counts).toEqual({ red: 0, yellow: 0, green: 21 });
    for (const summary of summaries) {
      expect(summary.counts.red + summary.counts.yellow + summary.counts.green).toBe(21);
      expect(summary.hasResults).toBe(true);
      expect(summary.haqVersion).toBe('haq_v1');
    }
  });

  it('says so, rather than showing zeros, when a sitting\'s results could not be read', () => {
    const summaries = buildHaqSittingSummaries([SITTING], []);
    expect(summaries[0]!.hasResults).toBe(false);
    expect(summaries[0]!.counts).toEqual({ red: 0, yellow: 0, green: 0 });
  });
});
