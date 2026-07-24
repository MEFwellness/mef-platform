import { describe, it, expect } from 'vitest';
import { selectNext, selectBatch } from '../lib/adaptive-assessment-engine/select';
import type { AdaptiveQuestion, AnsweredMap } from '../lib/adaptive-assessment-engine/types';

function q(key: string, overrides: Partial<AdaptiveQuestion> = {}): AdaptiveQuestion {
  return { question_key: key, weight: 1, requires: null, boosts: null, ...overrides };
}

const fixedRandom = (value: number) => () => value;

describe('selectNext', () => {
  it('returns null when the bank is empty', () => {
    expect(selectNext([], {}, [])).toBeNull();
  });

  it('returns null when every candidate is excluded', () => {
    const bank = [q('a'), q('b')];
    expect(selectNext(bank, {}, ['a', 'b'])).toBeNull();
  });

  it('excludes questions whose requires rule is unsatisfied', () => {
    const bank = [
      q('a'),
      q('b', { requires: [{ question_key: 'gate', op: 'eq', value: 'yes' }] }),
    ];
    const picked = selectNext(bank, {}, [], fixedRandom(0));
    expect(picked?.question_key).toBe('a');
  });

  it('includes a requires-gated question once its condition is met', () => {
    const bank = [q('b', { requires: [{ question_key: 'gate', op: 'eq', value: 'yes' }] })];
    const answered: AnsweredMap = { gate: 'yes' };
    const picked = selectNext(bank, answered, [], fixedRandom(0));
    expect(picked?.question_key).toBe('b');
  });

  it('supports in/gt/gte/lt/lte operators', () => {
    const answered: AnsweredMap = { score: 4, tags: ['pain', 'stress'] };
    expect(
      selectNext(
        [q('a', { requires: [{ question_key: 'tags', op: 'in', value: ['stress'] }] })],
        answered,
        [],
        fixedRandom(0)
      )
    ).not.toBeNull();
    expect(
      selectNext([q('a', { requires: [{ question_key: 'score', op: 'gt', value: 3 }] })], answered, [], fixedRandom(0))
    ).not.toBeNull();
    expect(
      selectNext([q('a', { requires: [{ question_key: 'score', op: 'lte', value: 3 }] })], answered, [], fixedRandom(0))
    ).toBeNull();
  });

  it('scores by weight plus every satisfied boost, and prefers the highest scorer', () => {
    const bank = [
      q('low', { weight: 1 }),
      q('high', {
        weight: 1,
        boosts: [{ question_key: 'primary_concern', op: 'eq', value: 'sleep', amount: 5 }],
      }),
    ];
    const answered: AnsweredMap = { primary_concern: 'sleep' };
    const picked = selectNext(bank, answered, [], fixedRandom(0.99));
    expect(picked?.question_key).toBe('high');
  });

  it('picks randomly among the top-scoring tier rather than always the first', () => {
    const bank = [q('a', { weight: 3 }), q('b', { weight: 3 }), q('c', { weight: 3 })];
    const low = selectNext(bank, {}, [], fixedRandom(0));
    const high = selectNext(bank, {}, [], fixedRandom(0.99));
    expect(low?.question_key).toBe('a');
    expect(high?.question_key).toBe('c');
  });

  it('never picks a question whose weight trails the top tier by more than 1', () => {
    const bank = [q('winner', { weight: 10 }), q('loser', { weight: 5 })];
    const picked = selectNext(bank, {}, [], fixedRandom(0.99));
    expect(picked?.question_key).toBe('winner');
  });

  it('excludes a question whose excludes rule is satisfied, even when it has no requires', () => {
    const bank = [
      q('a'),
      q('b', { excludes: [{ question_key: 'gate', op: 'eq', value: 'yes' }] }),
    ];
    const answered: AnsweredMap = { gate: 'yes' };
    const picked = selectNext(bank, answered, [], fixedRandom(0));
    expect(picked?.question_key).toBe('a');
  });

  it('keeps an excludes-gated question eligible until its exclude condition is met', () => {
    const bank = [q('b', { excludes: [{ question_key: 'gate', op: 'eq', value: 'yes' }] })];
    const picked = selectNext(bank, {}, [], fixedRandom(0));
    expect(picked?.question_key).toBe('b');
  });

  it('rejects a question that satisfies requires but also satisfies excludes', () => {
    const bank = [
      q('a', {
        requires: [{ question_key: 'concern', op: 'eq', value: 'sleep' }],
        excludes: [{ question_key: 'severity', op: 'eq', value: 'mild' }],
      }),
    ];
    const answered: AnsweredMap = { concern: 'sleep', severity: 'mild' };
    expect(selectNext(bank, answered, [], fixedRandom(0))).toBeNull();
  });

  it('treats absent excludes/priority identically to a plain requires/boosts question (no behavior change)', () => {
    const withoutNewFields = q('a', { weight: 2 });
    const withNullNewFields = q('a', { weight: 2, excludes: null, priority: null });
    const answered: AnsweredMap = {};
    expect(selectNext([withoutNewFields], answered, [], fixedRandom(0))?.question_key).toBe(
      selectNext([withNullNewFields], answered, [], fixedRandom(0))?.question_key
    );
  });

  it('adds priority into the score as a static tiebreak, independent of answered state', () => {
    const bank = [q('low', { weight: 1 }), q('high', { weight: 1, priority: 5 })];
    const picked = selectNext(bank, {}, [], fixedRandom(0.99));
    expect(picked?.question_key).toBe('high');
  });
});

describe('selectBatch', () => {
  it('never drops, duplicates, or exceeds the bank size', () => {
    const bank = [q('a'), q('b'), q('c')];
    const picks = selectBatch(bank, {}, [], 10, fixedRandom(0));
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.question_key)).size).toBe(3);
  });

  it('returns exactly `count` questions when enough eligible candidates exist', () => {
    const bank = [q('a'), q('b'), q('c'), q('d')];
    const picks = selectBatch(bank, {}, [], 2, fixedRandom(0));
    expect(picks).toHaveLength(2);
  });

  it('respects requires rules even mid-batch (a later pick cannot see an earlier batch pick as answered)', () => {
    const bank = [
      q('a'),
      q('b', { requires: [{ question_key: 'a', op: 'eq', value: 'x' }] }),
    ];
    // 'a' gets picked into the batch but is never actually answered (batch
    // picks aren't folded into `answered`), so 'b' must never become eligible.
    const picks = selectBatch(bank, {}, [], 2, fixedRandom(0));
    expect(picks.map((p) => p.question_key)).toEqual(['a']);
  });

  it('respects a pre-seeded exclude set', () => {
    const bank = [q('a'), q('b')];
    const picks = selectBatch(bank, {}, ['a'], 5, fixedRandom(0));
    expect(picks.map((p) => p.question_key)).toEqual(['b']);
  });
});
