/**
 * Four-fixes pass (2026-07-27), fix 4: "delete the silhouette
 * illustration entirely... render the locations as proper full-width
 * tappable rows... keep Widespread and Other as options within that
 * same list... make the severity levels visibly tappable... all
 * location and severity values must continue writing to the same
 * existing fields." Static source scan, same convention as this
 * feature's other tests (no rendering harness in this repo).
 *
 * 2026-07-29 update: the single-select full-width-rows treatment this
 * file originally pinned is superseded by a multi-select chip grid (a
 * real day can hurt in more than one place) — see
 * tests/checkin-discomfort-gate.test.ts for the new contract. The
 * silhouette-removal and severity-tile assertions below are unaffected
 * and still hold; only the location-list and prop-contract assertions
 * are updated in place.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const PAIN_SCREEN = source('components/checkin/BodySeverityOutline.tsx');
const MORNING_FORM = source('app/checkin/CheckinForm.tsx');

describe('the body silhouette is gone entirely', () => {
  it('no <svg> body illustration, no hand-placed x/y hotspot coordinates', () => {
    expect(PAIN_SCREEN).not.toContain('<svg');
    expect(PAIN_SCREEN).not.toMatch(/x:\s*\d+,\s*y:\s*\d+/); // the old { value, label, x, y } hotspot shape
    expect(PAIN_SCREEN).not.toContain('viewBox="0 0 100 220"');
  });

  it('no body-part <rect>/<ellipse>/<circle> silhouette primitives remain', () => {
    expect(PAIN_SCREEN).not.toContain('<rect');
    expect(PAIN_SCREEN).not.toContain('<ellipse');
  });
});

describe('location is a two-column multi-select chip grid, Widespread/Other included, not separate buttons', () => {
  it('reuses the shared MultiSelectChipGrid component, not a bespoke duplicate', () => {
    expect(PAIN_SCREEN).toContain("import { MultiSelectChipGrid } from './scales/MultiSelectChipGrid'");
    expect(PAIN_SCREEN).toContain('<MultiSelectChipGrid');
  });

  it('the location options array is one combined list containing every hotspot plus widespread and other', () => {
    const start = PAIN_SCREEN.indexOf('HOTSPOT_OPTIONS');
    const arrayText = PAIN_SCREEN.slice(start, PAIN_SCREEN.indexOf('] as const', start));
    for (const value of [
      'neck',
      'shoulders',
      'upper_back',
      'lower_back',
      'hips',
      'hands_or_wrists',
      'knees',
      'feet_or_ankles',
      'widespread',
      'other',
    ]) {
      expect(arrayText).toContain(`value: '${value}'`);
    }
    // Exactly one array feeds the rendered grid -- widespread/other are
    // not a second, separately-rendered button row.
    expect(PAIN_SCREEN.match(/<MultiSelectChipGrid/g)?.length).toBe(1);
  });
});

describe('severity levels are visibly tappable buttons, not a progress bar', () => {
  it('the old thin-bar treatment (a 10px-tall full-width strip) is gone', () => {
    expect(PAIN_SCREEN).not.toContain('h-2.5 w-full rounded-full');
  });

  it('each level is its own bordered, individually-styled button element with the fill-and-light treatment (solid color fill, scale/shadow on selection)', () => {
    expect(PAIN_SCREEN).toContain('function SeverityTile');
    expect(PAIN_SCREEN).toContain('rounded-xl border');
    expect(PAIN_SCREEN).toContain('scale-105');
  });

  it('uses the clay/terracotta SEVERITY_RAMP, still never a literal red color', () => {
    expect(PAIN_SCREEN).toContain('SEVERITY_RAMP');
    expect(PAIN_SCREEN).not.toMatch(/#f{2}0000|#ff0000|rgb\(\s*2\d\d,\s*0,\s*0\s*\)/i);
  });
});

describe('location/severity still write to the exact same existing fields (no schema change)', () => {
  it('BodySeverityOutline\'s prop contract keeps the same five prop names — locationValue/onLocationChange are now array-shaped (2026-07-29 multi-select redesign), severityValue/onSeverityChange/severityLabels unchanged', () => {
    expect(PAIN_SCREEN).toContain('locationValue: readonly string[]');
    expect(PAIN_SCREEN).toContain('onLocationChange: (value: string[]) => void');
    expect(PAIN_SCREEN).toContain('severityValue: number | null');
    expect(PAIN_SCREEN).toContain('onSeverityChange: (value: number) => void');
    expect(PAIN_SCREEN).toContain('severityLabels: readonly string[]');
  });

  it('CheckinForm still feeds severity into pain_discomfort_level and the clamped morning_soreness, unchanged', () => {
    expect(MORNING_FORM).toContain('pain_discomfort_level: painLevel');
    expect(MORNING_FORM).toContain('morning_soreness: morningSoreness');
    expect(MORNING_FORM).toContain('const morningSoreness = severity === null ? null : Math.max(severity, 1);');
  });

  it('CheckinForm still submits pain_location/pain_aggravating_factor through the existing probe-answer path', () => {
    expect(MORNING_FORM).toContain("submitProbeAnswerAction(localDate, 'checkin_probe.pain_location', painLocation)");
    expect(MORNING_FORM).toContain(
      "submitProbeAnswerAction(localDate, 'checkin_probe.pain_aggravating_factor', painAggravatingFactor)"
    );
  });
});
