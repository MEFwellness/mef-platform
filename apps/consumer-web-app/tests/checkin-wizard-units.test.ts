/**
 * Daily Check-In redesign v2 — "the screen split" and "both modes"
 * (task's own completion-workflow test requirements), tested at the
 * one place that actually decides it: groupUnitsIntoScreens. Section
 * mode groups units by their fixed section into the flow's real
 * screens (task requirement 2 — "/checkin currently renders one
 * screen... build the real flow"); cinematic mode gives every unit its
 * own screen (task requirement 1 — the member's very first check-in
 * only, "full ceremony... each question revealing on its own").
 */
import { describe, it, expect } from 'vitest';
import { groupUnitsIntoScreens, isScreenComplete, type CheckinUnit } from '../lib/daily-checkin-adaptive/wizardUnits';

function unit(overrides: Partial<CheckinUnit> = {}): CheckinUnit {
  return {
    key: 'example',
    section: 'feeling',
    required: true,
    answered: false,
    render: () => null,
    ...overrides,
  };
}

describe('groupUnitsIntoScreens — section mode', () => {
  it('groups units by section, in the given section order, one screen per section', () => {
    const units = [
      unit({ key: 'mood', section: 'feeling' }),
      unit({ key: 'energy', section: 'feeling' }),
      unit({ key: 'night', section: 'night' }),
      unit({ key: 'body', section: 'body' }),
    ];
    const screens = groupUnitsIntoScreens(units, 'section', ['feeling', 'night', 'body', 'other']);
    expect(screens).toHaveLength(3); // 'other' has no units today, so it's omitted entirely
    expect(screens[0]!.map((u) => u.key)).toEqual(['mood', 'energy']);
    expect(screens[1]!.map((u) => u.key)).toEqual(['night']);
    expect(screens[2]!.map((u) => u.key)).toEqual(['body']);
  });

  it('a rotating probe slots into its own screen\'s group alongside the fixed units, not a screen of its own', () => {
    const units = [
      unit({ key: 'mood', section: 'feeling' }),
      unit({ key: 'checkin_probe.some_sleep_probe', section: 'night', required: false }),
      unit({ key: 'night', section: 'night' }),
    ];
    const screens = groupUnitsIntoScreens(units, 'section', ['feeling', 'night', 'body', 'other']);
    expect(screens).toHaveLength(2);
    expect(screens[1]!.map((u) => u.key)).toEqual(['checkin_probe.some_sleep_probe', 'night']);
  });
});

describe('groupUnitsIntoScreens — cinematic mode', () => {
  it('gives every unit its own screen, one question at a time, in the original order', () => {
    const units = [
      unit({ key: 'mood', section: 'feeling' }),
      unit({ key: 'energy', section: 'feeling' }),
      unit({ key: 'night', section: 'night' }),
    ];
    const screens = groupUnitsIntoScreens(units, 'cinematic', ['feeling', 'night', 'body', 'other']);
    expect(screens).toHaveLength(3);
    expect(screens.map((s) => s.map((u) => u.key))).toEqual([['mood'], ['energy'], ['night']]);
  });

  it('never splits an already-combined unit (e.g. the sleep arc) into smaller pieces — it stays one screen, same as section mode', () => {
    const units = [unit({ key: 'night', section: 'night' })];
    const cinematic = groupUnitsIntoScreens(units, 'cinematic', ['feeling', 'night', 'body', 'other']);
    const section = groupUnitsIntoScreens(units, 'section', ['feeling', 'night', 'body', 'other']);
    expect(cinematic).toEqual([[units[0]]]);
    expect(section).toEqual([[units[0]]]);
  });
});

describe('isScreenComplete', () => {
  it('is false while any required unit is unanswered', () => {
    const screen = [unit({ required: true, answered: true }), unit({ required: true, answered: false })];
    expect(isScreenComplete(screen)).toBe(false);
  });

  it('is true once every required unit is answered, regardless of optional ones', () => {
    const screen = [unit({ required: true, answered: true }), unit({ required: false, answered: false })];
    expect(isScreenComplete(screen)).toBe(true);
  });

  it('an empty screen is trivially complete', () => {
    expect(isScreenComplete([])).toBe(true);
  });
});
