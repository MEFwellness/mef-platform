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
import {
  groupUnitsIntoScreens,
  isScreenComplete,
  interleaveFollowUps,
  type CheckinUnit,
} from '../lib/daily-checkin-adaptive/wizardUnits';
import type { DriverProbeQuestion } from '../lib/daily-checkin-adaptive/types';

function probeQuestion(overrides: Partial<DriverProbeQuestion> = {}): DriverProbeQuestion {
  return {
    questionKey: 'checkin_probe.example',
    driverId: 'FUE-1',
    prompt: 'Example?',
    responseType: 'boolean',
    options: [],
    storage: 'probe_answer',
    dailyCheckinsColumn: null,
    wearableMetricCode: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
    screen: 'morning',
    displayStyle: null,
    ...overrides,
  };
}

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

describe('interleaveFollowUps — a follow-up renders directly beneath the question that triggered it', () => {
  it('splices a single follow-up in immediately after its own parent, not after every probe', () => {
    const bedtimeLater = probeQuestion({ questionKey: 'checkin_probe.bedtime_later_than_wanted' });
    const eveningCraving = probeQuestion({ questionKey: 'checkin_probe.cravings_today' });
    const whatKeptYouUp = probeQuestion({
      questionKey: 'checkin_probe.what_kept_you_up',
      driverId: null,
      requires: [{ question_key: 'checkin_probe.bedtime_later_than_wanted', op: 'eq', value: true }],
    });

    const ordered = interleaveFollowUps([bedtimeLater, eveningCraving], [whatKeptYouUp]);
    expect(ordered.map((q) => q.questionKey)).toEqual([
      'checkin_probe.bedtime_later_than_wanted',
      'checkin_probe.what_kept_you_up',
      'checkin_probe.cravings_today',
    ]);
  });

  it('a parent probe with two follow-ups gets both immediately after it, in the follow-ups\' own order', () => {
    const digestion = probeQuestion({ questionKey: 'checkin_probe.digestion_rating' });
    const other = probeQuestion({ questionKey: 'checkin_probe.other_probe' });
    const followUpA = probeQuestion({
      questionKey: 'checkin_probe.follow_a',
      driverId: null,
      requires: [{ question_key: 'checkin_probe.digestion_rating', op: 'lte', value: 2 }],
    });
    const followUpB = probeQuestion({
      questionKey: 'checkin_probe.follow_b',
      driverId: null,
      requires: [{ question_key: 'checkin_probe.digestion_rating', op: 'lte', value: 2 }],
    });

    const ordered = interleaveFollowUps([digestion, other], [followUpA, followUpB]);
    expect(ordered.map((q) => q.questionKey)).toEqual([
      'checkin_probe.digestion_rating',
      'checkin_probe.follow_a',
      'checkin_probe.follow_b',
      'checkin_probe.other_probe',
    ]);
  });

  it('a follow-up whose parent is NOT among the probes (should not happen in practice) still renders, appended at the end rather than dropped', () => {
    const someProbe = probeQuestion({ questionKey: 'checkin_probe.some_probe' });
    const orphanFollowUp = probeQuestion({
      questionKey: 'checkin_probe.orphan_follow_up',
      driverId: null,
      requires: [{ question_key: 'checkin_probe.never_rendered_today', op: 'eq', value: true }],
    });

    const ordered = interleaveFollowUps([someProbe], [orphanFollowUp]);
    expect(ordered.map((q) => q.questionKey)).toEqual([
      'checkin_probe.some_probe',
      'checkin_probe.orphan_follow_up',
    ]);
  });

  it('reproduces the reported bug scenario: a craving follow-up and a pain-adjacent probe never separate a probe from its own follow-up', () => {
    const deskHours = probeQuestion({ questionKey: 'checkin_probe.desk_hours_today', driverId: 'MEC-1' });
    const cravings = probeQuestion({ questionKey: 'checkin_probe.cravings_today', driverId: 'FUE-4' });
    const gotUpHourly = probeQuestion({
      questionKey: 'checkin_probe.got_up_hourly',
      driverId: null,
      requires: [{ question_key: 'checkin_probe.desk_hours_today', op: 'in', value: ['4_to_6h', 'over_6h'] }],
    });

    const ordered = interleaveFollowUps([deskHours, cravings], [gotUpHourly]);
    const deskIndex = ordered.findIndex((q) => q.questionKey === 'checkin_probe.desk_hours_today');
    const followUpIndex = ordered.findIndex((q) => q.questionKey === 'checkin_probe.got_up_hourly');
    expect(followUpIndex).toBe(deskIndex + 1);
  });

  it('no probes, no follow-ups -> empty', () => {
    expect(interleaveFollowUps([], [])).toEqual([]);
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
