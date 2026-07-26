/**
 * "Her forecast must NOT be visible anywhere on the check-in screen
 * before she submits... enforce it in code, not just layout." The
 * strongest code-level guarantee available is structural: the morning
 * check-in's page and form simply never import anything from the
 * forecast module, so there is no code path through which a forecast
 * value could reach that screen, however the JSX is later reorganized.
 *
 * This is a static-scan guard, the same pattern this codebase already
 * uses elsewhere (tests/assessments-isolation.test.ts's "only one file
 * may reference Four Doctors outside its own module" scan) — reading the
 * real source files as text rather than mocking/rendering them, so it
 * catches the mistake even if it's just an unused import added by habit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const MORNING_CHECKIN_FILES = [
  path.resolve(__dirname, '../app/checkin/page.tsx'),
  path.resolve(__dirname, '../app/checkin/CheckinForm.tsx'),
];

const FORBIDDEN_PATTERNS = [
  'energy-forecast',
  'energy_forecasts',
  'root_energy_forecasts',
  'EnergyForecast',
  'RootEnergyForecast',
  'predicted_energy_level',
  'predictedEnergyLevel',
];

describe('the forecast is never readable from the morning check-in screen', () => {
  for (const file of MORNING_CHECKIN_FILES) {
    it(`${path.basename(file)} has no reference to the forecast module or its data shape`, () => {
      const source = readFileSync(file, 'utf-8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(source.includes(pattern)).toBe(false);
      }
    });
  }
});
