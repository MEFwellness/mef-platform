/**
 * Daily Check-In redesign v2 — "the six protected core questions ...
 * must still all appear every day," now spread across the wizard's
 * dynamic screen split (section mode groups them into
 * feeling/night/body; cinematic mode gives each its own screen — see
 * lib/daily-checkin-adaptive/wizardUnits.ts for the grouping mechanism
 * itself, tested directly in checkin-wizard-units.test.ts). There's no
 * component-rendering harness in this repo (vitest.config.ts runs a
 * plain 'node' environment, no jsdom/RTL — every existing test is
 * logic-only), so this is a source-level static scan (same pattern as
 * tests/energy-forecast-anchoring.test.ts), not a rendered-DOM one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FIXED_CORE_QUESTION_KEYS } from '../lib/daily-checkin-adaptive/constants';

const CHECKIN_FORM_SOURCE = readFileSync(
  path.resolve(__dirname, '../app/checkin/CheckinForm.tsx'),
  'utf-8'
);

/**
 * One distinctive, hard-to-accidentally-delete marker per
 * FIXED_CORE_QUESTION_KEYS entry — the state setter that question's
 * control actually calls. Pain's real live setter is `setSeverity` (the
 * combined body-outline severity gesture, task requirement 6) rather
 * than a dedicated `setPainLevel` — `painLevel` is now a derived
 * constant (`const painLevel = severity`), not its own setter.
 */
const CORE_KEY_MARKERS: Record<(typeof FIXED_CORE_QUESTION_KEYS)[number], string> = {
  'checkin.mood': 'setMoodLevel',
  'checkin.energy': 'setEnergyLevel',
  'checkin.stress': 'setStressLevel',
  'checkin.sleep_quality': 'setSleepQuality',
  'checkin.sleep_duration': 'setSleepDuration',
  'checkin.pain': 'setSeverity',
};

/** Pulls the source text of one `{ key: '<unitKey>', ... }` object literal out of the `units` array, from its `key:` line up to the next `key:` occurrence — good enough to assert what a given unit's own render/section includes. */
function unitBlock(unitKey: string): string {
  const start = CHECKIN_FORM_SOURCE.indexOf(`key: '${unitKey}',`);
  expect(start, `unit '${unitKey}' not found in CheckinForm.tsx`).toBeGreaterThan(-1);
  const nextKey = CHECKIN_FORM_SOURCE.indexOf("key: '", start + 1);
  return CHECKIN_FORM_SOURCE.slice(start, nextKey === -1 ? undefined : nextKey);
}

describe('all six protected core questions survive the screen split', () => {
  it('CORE_KEY_MARKERS covers every FIXED_CORE_QUESTION_KEYS entry, no more, no fewer', () => {
    expect(Object.keys(CORE_KEY_MARKERS).sort()).toEqual([...FIXED_CORE_QUESTION_KEYS].sort());
  });

  for (const key of FIXED_CORE_QUESTION_KEYS) {
    it(`${key} still has a live state setter in CheckinForm.tsx`, () => {
      expect(CHECKIN_FORM_SOURCE.includes(CORE_KEY_MARKERS[key])).toBe(true);
    });
  }

  it('mood/energy/stress are all in the "feeling" section', () => {
    expect(unitBlock('mood')).toContain("section: 'feeling'");
    expect(unitBlock('energy')).toContain("section: 'feeling'");
    expect(unitBlock('stress')).toContain("section: 'feeling'");
  });

  it('sleep quality, sleep duration, and bedtime/wake are one combined "night" unit — never split, in either mode', () => {
    const night = unitBlock('night');
    expect(night).toContain("section: 'night'");
    expect(night).toContain('FiveMoonsScale');
    expect(night).toContain('SleepArc');
    expect(night).toContain('setSleepDuration');
  });

  it('the combined body-severity gesture is in the "body" section and required', () => {
    const body = unitBlock('body-severity');
    expect(body).toContain("section: 'body'");
    expect(body).toContain('required: true');
    expect(body).toContain('BodySeverityOutline');
  });

  it('the wizard groups units by mode (cinematic vs section), not a fixed screen count', () => {
    expect(CHECKIN_FORM_SOURCE).toContain('groupUnitsIntoScreens');
    expect(CHECKIN_FORM_SOURCE).toContain("isFirstCheckin ? ('cinematic' as const) : ('section' as const)");
  });
});
