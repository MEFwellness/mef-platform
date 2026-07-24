import { describe, it, expect } from 'vitest';
import { evaluateCondition, parseCondition, parseConditionList } from '../lib/assessment-runtime/conditions';
import type { Condition } from '../lib/assessment-runtime/conditions';
import type { SessionAnswers } from '../lib/assessment-runtime/types';

describe('evaluateCondition — leaf operators', () => {
  const answers: SessionAnswers = {
    gender: 'male',
    age: 42,
    tags: ['sleep', 'stress'],
    note: 'occasional lower back pain',
  };

  it('equals', () => {
    expect(evaluateCondition({ type: 'leaf', questionKey: 'gender', op: 'equals', value: 'male' }, answers)).toBe(true);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'gender', op: 'equals', value: 'female' }, answers)).toBe(false);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'missing', op: 'equals', value: 'x' }, answers)).toBe(false);
  });

  it('notEquals', () => {
    expect(evaluateCondition({ type: 'leaf', questionKey: 'gender', op: 'notEquals', value: 'female' }, answers)).toBe(true);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'gender', op: 'notEquals', value: 'male' }, answers)).toBe(false);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'missing', op: 'notEquals', value: 'x' }, answers)).toBe(true);
  });

  it('contains — array membership and substring', () => {
    expect(evaluateCondition({ type: 'leaf', questionKey: 'tags', op: 'contains', value: 'stress' }, answers)).toBe(true);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'tags', op: 'contains', value: 'pain' }, answers)).toBe(false);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'note', op: 'contains', value: 'back' }, answers)).toBe(true);
  });

  it('greaterThan / lessThan', () => {
    expect(evaluateCondition({ type: 'leaf', questionKey: 'age', op: 'greaterThan', value: 40 }, answers)).toBe(true);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'age', op: 'greaterThan', value: 42 }, answers)).toBe(false);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'age', op: 'lessThan', value: 50 }, answers)).toBe(true);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'missing', op: 'greaterThan', value: 1 }, answers)).toBe(false);
  });

  it('exists / notExists', () => {
    expect(evaluateCondition({ type: 'leaf', questionKey: 'gender', op: 'exists' }, answers)).toBe(true);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'missing', op: 'exists' }, answers)).toBe(false);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'gender', op: 'notExists' }, answers)).toBe(false);
    expect(evaluateCondition({ type: 'leaf', questionKey: 'missing', op: 'notExists' }, answers)).toBe(true);
  });
});

describe('evaluateCondition — AND / OR / nested', () => {
  const answers: SessionAnswers = { gender: 'male', age: 65, smoker: false };

  it('AND requires every condition to hold', () => {
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'leaf', questionKey: 'gender', op: 'equals', value: 'male' },
        { type: 'leaf', questionKey: 'age', op: 'greaterThan', value: 60 },
      ],
    };
    expect(evaluateCondition(condition, answers)).toBe(true);
    expect(evaluateCondition(condition, { ...answers, age: 30 })).toBe(false);
  });

  it('OR requires any condition to hold', () => {
    const condition: Condition = {
      type: 'or',
      conditions: [
        { type: 'leaf', questionKey: 'smoker', op: 'equals', value: true },
        { type: 'leaf', questionKey: 'age', op: 'greaterThan', value: 60 },
      ],
    };
    expect(evaluateCondition(condition, answers)).toBe(true);
    expect(evaluateCondition(condition, { ...answers, age: 30 })).toBe(false);
  });

  it('nested AND/OR combinations evaluate correctly', () => {
    // (gender == male AND age > 60) OR smoker == true
    const condition: Condition = {
      type: 'or',
      conditions: [
        {
          type: 'and',
          conditions: [
            { type: 'leaf', questionKey: 'gender', op: 'equals', value: 'male' },
            { type: 'leaf', questionKey: 'age', op: 'greaterThan', value: 60 },
          ],
        },
        { type: 'leaf', questionKey: 'smoker', op: 'equals', value: true },
      ],
    };
    expect(evaluateCondition(condition, answers)).toBe(true);
    expect(evaluateCondition(condition, { gender: 'female', age: 20, smoker: true })).toBe(true);
    expect(evaluateCondition(condition, { gender: 'female', age: 20, smoker: false })).toBe(false);
  });
});

describe('parseCondition / parseConditionList', () => {
  it('returns null/empty for absent jsonb', () => {
    expect(parseCondition(null)).toBeNull();
    expect(parseCondition(undefined)).toBeNull();
    expect(parseConditionList(null)).toEqual([]);
    expect(parseConditionList(undefined)).toEqual([]);
  });

  it('passes through real jsonb content', () => {
    const raw = { type: 'leaf', questionKey: 'a', op: 'equals', value: 'x' };
    expect(parseCondition(raw)).toEqual(raw);
    expect(parseConditionList([raw])).toEqual([raw]);
  });
});
