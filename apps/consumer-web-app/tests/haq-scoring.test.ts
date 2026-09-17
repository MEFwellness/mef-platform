/**
 * The HAQ scoring engine against the locked rules, in TypeScript.
 *
 * Every expected number here comes from tests/haq-spec.ts, which was typed
 * from the build prompt separately from lib/haq/scoringRules.ts. The same
 * boundaries are then driven through the real database engine in
 * tests/haq-runtime-integration.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { HAQ_QUESTIONS, HAQ_SECTIONS } from '../lib/haq/questionBank';
import { HAQ_HIDDEN_VALUES, HAQ_SECTION_CUTOFFS, haqHiddenValue } from '../lib/haq/scoringRules';
import {
  HAQ_RESULT_STATES,
  classifyHaqSectionTotal,
  haqSectionTotal,
  scoreHaqInstance,
} from '../lib/haq/scoring';
import { SPEC_BOUNDARIES, SPEC_BOUNDARY_COLORS, SPEC_HIDDEN_VALUES } from './haq-spec';
import { allZeroAnswers, answersForSectionTotal, answersForSectionTotals } from './haq-fixture';

const EXPECTED_STATE = {
  green: { memberResultLabel: 'Doing Well', originalPriority: 'Low Priority' },
  yellow: { memberResultLabel: 'Needs Attention', originalPriority: 'Moderate Priority' },
  red: { memberResultLabel: 'High Attention', originalPriority: 'High Priority' },
} as const;

describe('1. value mapping', () => {
  it.each(SPEC_HIDDEN_VALUES)('%s "%s" stores %i', (type, response, value) => {
    expect(haqHiddenValue(type, response)).toBe(value);
  });

  it('holds exactly the six approved values and nothing else', () => {
    expect(HAQ_HIDDEN_VALUES).toEqual({
      frequency: { never_or_rarely: 0, sometimes: 1, often: 4, very_often: 8 },
      yes_no: { no: 0, yes: 8 },
    });
  });

  it.each([
    ['frequency', 'always'],
    ['frequency', 'Often'],
    ['frequency', 'Never or rarely'],
    ['frequency', 'yes'],
    ['frequency', ''],
    ['frequency', '4'],
    ['frequency', 'toString'],
    ['yes_no', 'often'],
    ['yes_no', 'Yes'],
    ['yes_no', 'maybe'],
    ['yes_no', '8'],
  ] as const)('refuses %s "%s" rather than scoring it', (type, response) => {
    expect(haqHiddenValue(type, response)).toBeNull();
  });

  it('refuses to total a section holding a response its type does not accept', () => {
    const answers = { ...allZeroAnswers(), haq_p1_a_q1: 'yes' };
    expect(() => haqSectionTotal('haq_p1_a', answers)).toThrow(/not accepted/);
  });
});

describe('2. every section at its own four boundaries', () => {
  it('uses cutoffs identical to the specification for all 21 sections', () => {
    expect(Object.keys(HAQ_SECTION_CUTOFFS)).toEqual(SPEC_BOUNDARIES.map(([id]) => id));
    for (const [sectionId, greenTop, , yellowTop] of SPEC_BOUNDARIES) {
      expect(HAQ_SECTION_CUTOFFS[sectionId], sectionId).toEqual({ greenMax: greenTop, yellowMax: yellowTop });
    }
  });

  const cases = SPEC_BOUNDARIES.flatMap(([sectionId, ...totals]) =>
    totals.map((total, index) => [sectionId, total, SPEC_BOUNDARY_COLORS[index]!] as const)
  );

  it('covers 84 boundaries', () => {
    expect(cases).toHaveLength(84);
  });

  it.each(cases)('%s total %i is %s', (sectionId, total, color) => {
    const state = classifyHaqSectionTotal(sectionId, total);
    expect(state.resultColor).toBe(color);
    expect(state.memberResultLabel).toBe(EXPECTED_STATE[color].memberResultLabel);
    expect(state.originalPriority).toBe(EXPECTED_STATE[color].originalPriority);
  });

  it.each(cases)('%s reaches %i from real answers and reads %s', (sectionId, total, color) => {
    const answers = answersForSectionTotal(sectionId, total);
    expect(haqSectionTotal(sectionId, answers)).toBe(total);
    expect(classifyHaqSectionTotal(sectionId, haqSectionTotal(sectionId, answers)!).resultColor).toBe(color);
  });

  it.each([0, 1, 2, 3])('a whole instance at boundary %i classifies every section by its own cutoffs', (index) => {
    const totals = Object.fromEntries(SPEC_BOUNDARIES.map((row) => [row[0], row[index + 1] as number]));
    const results = scoreHaqInstance(answersForSectionTotals(totals));
    expect(results).not.toBeNull();
    expect(results!.map((r) => r.sectionId)).toEqual(HAQ_SECTIONS.map((s) => s.id));
    for (const result of results!) {
      expect(result.rawTotal, result.sectionId).toBe(totals[result.sectionId]);
      expect(result.resultColor, result.sectionId).toBe(SPEC_BOUNDARY_COLORS[index]);
    }
  });

  it('refuses a total that cannot exist and a section that does not', () => {
    expect(() => classifyHaqSectionTotal('haq_p1_a', -1)).toThrow();
    expect(() => classifyHaqSectionTotal('haq_p1_a', 2.5)).toThrow();
    expect(() => classifyHaqSectionTotal('haq_p99', 0)).toThrow(/Unknown HAQ section/);
  });

  it('maps colors to labels and priorities exactly as locked', () => {
    expect(HAQ_RESULT_STATES).toEqual({
      green: { resultColor: 'green', ...EXPECTED_STATE.green },
      yellow: { resultColor: 'yellow', ...EXPECTED_STATE.yellow },
      red: { resultColor: 'red', ...EXPECTED_STATE.red },
    });
  });
});

describe('3. a deliberate zero is not an unanswered section', () => {
  it('all Never or rarely / No gives 21 Green sections, each at 0, from 260 answers', () => {
    const answers = allZeroAnswers();
    expect(Object.keys(answers)).toHaveLength(260);
    const results = scoreHaqInstance(answers);
    expect(results).toHaveLength(21);
    for (const result of results!) {
      expect(result.rawTotal).toBe(0);
      expect(result.resultColor).toBe('green');
      expect(result.memberResultLabel).toBe('Doing Well');
    }
  });

  it('an unanswered section has no total at all, not a total of 0', () => {
    const answers: Record<string, string> = { ...allZeroAnswers() };
    for (const q of HAQ_QUESTIONS.filter((q) => q.sectionId === 'haq_p2')) delete answers[q.key];
    expect(haqSectionTotal('haq_p2', answers)).toBeNull();
    expect(haqSectionTotal('haq_p1_a', answers)).toBe(0);
  });
});

describe('4. any unanswered question means no results', () => {
  it('one missing answer out of 260 produces no section results', () => {
    const answers: Record<string, string> = { ...allZeroAnswers() };
    delete answers.haq_p10_b_q9;
    expect(scoreHaqInstance(answers)).toBeNull();
  });

  it('a half answered section counts nothing', () => {
    const answers: Record<string, string> = { ...allZeroAnswers(), haq_p1_a_q1: 'very_often' };
    delete answers.haq_p1_a_q2;
    expect(haqSectionTotal('haq_p1_a', answers)).toBeNull();
  });

  it('there is no overall total, percentage or grade anywhere in a result', () => {
    const results = scoreHaqInstance(allZeroAnswers())!;
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(
        ['memberResultLabel', 'originalPriority', 'rawTotal', 'resultColor', 'sectionId'].sort()
      );
    }
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('5. only the final selection counts', () => {
  it('a changed answer is totalled at its final value only', () => {
    const answers: Record<string, string> = { ...allZeroAnswers(), haq_p1_a_q1: 'very_often' };
    expect(haqSectionTotal('haq_p1_a', answers)).toBe(8);
    answers.haq_p1_a_q1 = 'sometimes';
    expect(haqSectionTotal('haq_p1_a', answers)).toBe(1);
    expect(scoreHaqInstance(answers)![0]).toMatchObject({ sectionId: 'haq_p1_a', rawTotal: 1, resultColor: 'green' });
  });

  it('sections are independent: a Red section leaves every other section untouched', () => {
    const answers = { ...allZeroAnswers(), ...answersForSectionTotal('haq_p8', 32) };
    const results = scoreHaqInstance(answers)!;
    for (const result of results) {
      if (result.sectionId === 'haq_p8') expect(result).toMatchObject({ rawTotal: 32, resultColor: 'red' });
      else expect(result).toMatchObject({ rawTotal: 0, resultColor: 'green' });
    }
  });
});
