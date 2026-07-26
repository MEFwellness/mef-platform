/**
 * Daily Check-In redesign v2 — "the earlier no-wrap rule caused chopped
 * labels... Truncating an answer is worse than any layout problem."
 * resolveSingleSelectLayout is the pure decision DriverProbeField.tsx
 * uses: any option label over MAX_INLINE_LABEL_LENGTH forces the whole
 * question onto full-width stacked rows instead of a single-line
 * segment. Pinned here against the exact real option sets named in the
 * bug report ("Below av…", "Overwhelmed…", "Dipped in th…", "Fully
 * reco…") plus a handful of the 88-question bank's own long labels, so
 * a future edit can't quietly reintroduce truncation.
 */
import { describe, it, expect } from 'vitest';
import { resolveSingleSelectLayout } from '../components/checkin/DriverProbeField';
import { MAX_INLINE_LABEL_LENGTH } from '../components/checkin/scales/shared';

function labels(...words: string[]) {
  return words.map((label) => ({ label }));
}

describe('resolveSingleSelectLayout — the never-truncate rule', () => {
  it('MAX_INLINE_LABEL_LENGTH is 10, matching the task\'s own threshold', () => {
    expect(MAX_INLINE_LABEL_LENGTH).toBe(10);
  });

  it('an option set where every label is <=10 chars stays a single row', () => {
    expect(resolveSingleSelectLayout(labels('Normal', 'Loose', 'Regular'))).toBe('row');
    expect(resolveSingleSelectLayout(labels('Yes', 'No'))).toBe('row');
  });

  it('any single label over 10 chars forces the whole question onto stacked rows', () => {
    expect(resolveSingleSelectLayout(labels('Below average'))).toBe('stacked');
    expect(resolveSingleSelectLayout(labels('Overwhelmed'))).toBe('stacked'); // 11 chars
    expect(resolveSingleSelectLayout(labels('Dipped in the afternoon'))).toBe('stacked');
    expect(resolveSingleSelectLayout(labels('Fully recovered'))).toBe('stacked');
  });

  it('a mixed set (some short, some long) still stacks — never a partially-truncated row', () => {
    expect(resolveSingleSelectLayout(labels('None', 'Full session'))).toBe('stacked');
  });

  it('exactly 10 characters stays inline; 11 tips over to stacked', () => {
    expect(resolveSingleSelectLayout(labels('A'.repeat(10)))).toBe('row');
    expect(resolveSingleSelectLayout(labels('A'.repeat(11)))).toBe('stacked');
  });

  it('real long labels from the 88-question bank all resolve to stacked, not a clipped row', () => {
    const realLongLabels = [
      'Desk/mouse/phone favoring one side',
      'Uncomfortable — had to hunch',
      "Couldn't fall back asleep",
      'Backpack / evenly loaded',
    ];
    for (const label of realLongLabels) {
      expect(resolveSingleSelectLayout(labels(label))).toBe('stacked');
    }
  });
});
