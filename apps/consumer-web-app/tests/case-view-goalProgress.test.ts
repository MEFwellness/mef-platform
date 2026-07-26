import { describe, it, expect } from 'vitest';
import { buildGoalProgressPromptText, buildGoalProgressView, GOAL_PROGRESS_RECHECK_DAYS } from '../lib/case-view/goalProgress';
import type { CaseHeader } from '../lib/case-view/types';

const HEADER_LABEL: CaseHeader = {
  title: 'Sleep better',
  isVerbatimQuote: false,
  primaryGoalKey: 'sleep_better',
  allGoalKeys: ['sleep_better'],
};

const HEADER_QUOTE: CaseHeader = {
  title: 'my knee acting up after golf',
  isVerbatimQuote: true,
  primaryGoalKey: 'something_else',
  allGoalKeys: ['something_else'],
};

describe('buildGoalProgressPromptText', () => {
  it('quotes her exact free text when she typed it, not a rewritten version', () => {
    expect(buildGoalProgressPromptText(HEADER_QUOTE)).toBe('How is "my knee acting up after golf" going for you lately?');
  });

  it('uses the existing product label for a normal goal', () => {
    expect(buildGoalProgressPromptText(HEADER_LABEL)).toBe('How is "Sleep better" going for you lately?');
  });
});

describe('buildGoalProgressView', () => {
  it('is due when there are no ratings yet', () => {
    const view = buildGoalProgressView(HEADER_LABEL, [], '2026-07-26');
    expect(view.promptDue).toBe(true);
    expect(view.points).toEqual([]);
  });

  it('is not due the day after a rating was given', () => {
    const view = buildGoalProgressView(HEADER_LABEL, [{ localDate: '2026-07-25', rating: 3 }], '2026-07-26');
    expect(view.promptDue).toBe(false);
  });

  it(`is due again once ${GOAL_PROGRESS_RECHECK_DAYS} days have passed since the last rating`, () => {
    const view = buildGoalProgressView(HEADER_LABEL, [{ localDate: '2026-07-19', rating: 3 }], '2026-07-26');
    expect(view.promptDue).toBe(true);
  });

  it('sorts ratings chronologically for charting regardless of input order', () => {
    const view = buildGoalProgressView(
      HEADER_LABEL,
      [
        { localDate: '2026-07-20', rating: 4 },
        { localDate: '2026-07-10', rating: 2 },
      ],
      '2026-07-26'
    );
    expect(view.points.map((p) => p.date)).toEqual(['2026-07-10', '2026-07-20']);
  });
});
