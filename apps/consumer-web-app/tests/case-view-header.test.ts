import { describe, it, expect } from 'vitest';
import { buildCaseHeader } from '../lib/case-view/header';
import type { MemberGoalSelection } from '../lib/member-goals/data';

function selection(overrides: Partial<MemberGoalSelection> = {}): MemberGoalSelection {
  return {
    id: 'sel-1',
    memberId: 'member-1',
    goals: ['reduce_pain'],
    primaryGoal: 'reduce_pain',
    goalsOther: null,
    source: 'welcome_flow',
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildCaseHeader', () => {
  it('titles the view with the existing product label for a normal goal, never marked as a verbatim quote', () => {
    const header = buildCaseHeader(selection({ primaryGoal: 'reduce_pain', goals: ['reduce_pain'] }));
    expect(header.title).toBe('Reduce pain or discomfort');
    expect(header.isVerbatimQuote).toBe(false);
  });

  it('quotes her exact free text verbatim for "something else"', () => {
    const header = buildCaseHeader(
      selection({ primaryGoal: 'something_else', goals: ['something_else'], goalsOther: 'my knee acting up after golf' })
    );
    expect(header.title).toBe('my knee acting up after golf');
    expect(header.isVerbatimQuote).toBe(true);
  });

  it('never rewrites or normalizes her free text — checked against a string with irregular casing/punctuation', () => {
    const raw = 'idk just... tired all the time??';
    const header = buildCaseHeader(selection({ primaryGoal: 'something_else', goals: ['something_else'], goalsOther: raw }));
    expect(header.title).toBe(raw);
  });

  it('auto-promotes the single goal when no primary goal was ever chosen', () => {
    const header = buildCaseHeader(selection({ primaryGoal: null, goals: ['sleep_better'] }));
    expect(header.title).toBe('Sleep better');
    expect(header.isVerbatimQuote).toBe(false);
  });

  it('falls back to a neutral, honest placeholder with multiple goals and no primary chosen', () => {
    const header = buildCaseHeader(selection({ primaryGoal: null, goals: ['sleep_better', 'reduce_stress'] }));
    expect(header.title).toBe('What you’re working on');
    expect(header.isVerbatimQuote).toBe(false);
  });

  it('falls back to a neutral placeholder when there is no goal selection at all — never fabricates a goal', () => {
    const header = buildCaseHeader(null);
    expect(header.title).toBe('What you’re working on');
    expect(header.primaryGoalKey).toBeNull();
    expect(header.allGoalKeys).toEqual([]);
  });

  it('falls back to the plain "Something else" label (never fabricated free text) if goalsOther is empty', () => {
    const header = buildCaseHeader(selection({ primaryGoal: 'something_else', goals: ['something_else'], goalsOther: '' }));
    expect(header.title).toBe('Something else');
    expect(header.isVerbatimQuote).toBe(false);
  });
});
