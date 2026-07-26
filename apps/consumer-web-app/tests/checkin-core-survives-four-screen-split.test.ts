/**
 * Daily Check-In redesign — "the six protected core questions ... must
 * still all appear every day" (task requirement 6), now spread across
 * Screen 1 (feeling), Screen 2 (night), and Screen 3 (body) instead of
 * one long form. There's no component-rendering harness in this repo
 * (vitest.config.ts runs in a plain 'node' environment, no jsdom/RTL —
 * every existing test is logic-only), so — same static-scan pattern as
 * tests/energy-forecast-anchoring.test.ts and
 * tests/assessments-isolation.test.ts — this reads CheckinForm.tsx's
 * real source and asserts each of the six FIXED_CORE_QUESTION_KEYS
 * (constants.ts) still has its own live state setter wired into the
 * form, so a future edit that accidentally drops one of the six during
 * further screen-shuffling fails loudly here instead of silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FIXED_CORE_QUESTION_KEYS } from '../lib/daily-checkin-adaptive/constants';

const CHECKIN_FORM_SOURCE = readFileSync(
  path.resolve(__dirname, '../app/checkin/CheckinForm.tsx'),
  'utf-8'
);

/** One distinctive, hard-to-accidentally-delete marker per FIXED_CORE_QUESTION_KEYS entry — the state setter that question's control calls onChange with. */
const CORE_KEY_MARKERS: Record<(typeof FIXED_CORE_QUESTION_KEYS)[number], string> = {
  'checkin.mood': 'setMoodLevel',
  'checkin.energy': 'setEnergyLevel',
  'checkin.stress': 'setStressLevel',
  'checkin.sleep_quality': 'setSleepQuality',
  'checkin.sleep_duration': 'setSleepDuration',
  'checkin.pain': 'setPainLevel',
};

describe('all six protected core questions survive the four-screen split', () => {
  it('CORE_KEY_MARKERS covers every FIXED_CORE_QUESTION_KEYS entry, no more, no fewer', () => {
    expect(Object.keys(CORE_KEY_MARKERS).sort()).toEqual([...FIXED_CORE_QUESTION_KEYS].sort());
  });

  for (const key of FIXED_CORE_QUESTION_KEYS) {
    it(`${key} still has a live state setter in CheckinForm.tsx`, () => {
      expect(CHECKIN_FORM_SOURCE.includes(CORE_KEY_MARKERS[key])).toBe(true);
    });
  }

  it('renders exactly a 4-screen wizard (SCREEN_COUNT = 4), not a re-collapsed single form', () => {
    expect(/SCREEN_COUNT\s*=\s*4/.test(CHECKIN_FORM_SOURCE)).toBe(true);
  });

  it('Screen 1 (feeling) carries mood, energy, and stress together', () => {
    const screen0 = CHECKIN_FORM_SOURCE.slice(
      CHECKIN_FORM_SOURCE.indexOf('key="screen-0"'),
      CHECKIN_FORM_SOURCE.indexOf('key="screen-1"')
    );
    expect(screen0).toContain('setMoodLevel');
    expect(screen0).toContain('setEnergyLevel');
    expect(screen0).toContain('setStressLevel');
  });

  it('Screen 2 (night) carries sleep quality, sleep duration, and bedtime/wake together', () => {
    const screen1 = CHECKIN_FORM_SOURCE.slice(
      CHECKIN_FORM_SOURCE.indexOf('key="screen-1"'),
      CHECKIN_FORM_SOURCE.indexOf('key="screen-2"')
    );
    expect(screen1).toContain('setSleepQuality');
    expect(screen1).toContain('setSleepDuration');
    expect(screen1).toContain('BedtimeWakeArc');
  });

  it('Screen 3 (body) carries soreness and pain together', () => {
    const screen2 = CHECKIN_FORM_SOURCE.slice(
      CHECKIN_FORM_SOURCE.indexOf('key="screen-2"'),
      CHECKIN_FORM_SOURCE.indexOf('key="screen-3"')
    );
    expect(screen2).toContain('setMorningSoreness');
    expect(screen2).toContain('setPainLevel');
  });
});
