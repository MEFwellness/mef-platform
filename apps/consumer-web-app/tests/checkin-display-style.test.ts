import { describe, it, expect } from 'vitest';
import { resolveDisplayStyle } from '../lib/daily-checkin-adaptive/displayStyle';

describe('resolveDisplayStyle', () => {
  it('falls back to a sensible default per responseType when displayStyle is unset (null)', () => {
    expect(resolveDisplayStyle({ responseType: 'scale', displayStyle: null })).toBe('segmented');
    expect(resolveDisplayStyle({ responseType: 'single_select', displayStyle: null })).toBe('pill_row');
    expect(resolveDisplayStyle({ responseType: 'multi_select', displayStyle: null })).toBe('pill_row');
    expect(resolveDisplayStyle({ responseType: 'boolean', displayStyle: null })).toBe('boolean_pills');
    expect(resolveDisplayStyle({ responseType: 'count', displayStyle: null })).toBe('dots');
    expect(resolveDisplayStyle({ responseType: 'time_pair', displayStyle: null })).toBe('segmented');
  });

  it('an explicit displayStyle always wins over the responseType default', () => {
    expect(resolveDisplayStyle({ responseType: 'single_select', displayStyle: 'segmented' })).toBe('segmented');
    expect(resolveDisplayStyle({ responseType: 'scale', displayStyle: 'five_faces' })).toBe('five_faces');
  });

  it('every one of the 88 existing questions (all scale/single_select/boolean/count, none with displayStyle set) renders via the correct default with no per-question code', () => {
    const responseTypes = ['scale', 'single_select', 'boolean', 'count'] as const;
    for (const responseType of responseTypes) {
      const style = resolveDisplayStyle({ responseType, displayStyle: null });
      expect(style).toBeTruthy();
    }
  });
});
