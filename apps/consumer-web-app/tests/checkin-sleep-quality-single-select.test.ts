/**
 * Two-fixes pass (2026-07-27), fix 1: "the moon icons use a cumulative
 * fill... there is no way to tell [only one is selected] by looking."
 * First requirement was to verify the data itself: `sleepQuality` is a
 * plain `useState<number | null>`, replaced (never appended to) by
 * every `onChange` call — confirmed by reading CheckinForm.tsx and
 * daily_checkins' own schema (a single `integer` column, not an array).
 * No rendering harness exists in this repo (plain 'node' vitest
 * environment), so the visual fix is a static source scan; the real
 * single-vs-multi-value behavior is confirmed live via Playwright
 * (including a direct database query), reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const MORNING_FORM = source('app/checkin/CheckinForm.tsx');
const MOONS = source('components/checkin/scales/FiveMoonsScale.tsx');

describe('sleep quality genuinely stores one value, replacing on change (not appending)', () => {
  it('sleepQuality is a single number-or-null useState, never an array', () => {
    expect(MORNING_FORM).toContain('const [sleepQuality, setSleepQuality] = useState<number | null>(');
    expect(MORNING_FORM).not.toMatch(/sleepQuality:\s*number\[\]/);
  });

  it("FiveMoonsScale's onChange is wired directly to the setter — a plain replace, not a functional append", () => {
    const start = MORNING_FORM.indexOf('<FiveMoonsScale');
    const block = MORNING_FORM.slice(start, MORNING_FORM.indexOf('/>', start));
    expect(block).toContain('onChange={setSleepQuality}');
    expect(block).not.toMatch(/onChange=\{\(.*\)\s*=>\s*setSleepQuality\(\s*\(?prev/);
  });

  it('the value written to daily_checkins.sleep_quality is that same single value, not a derived array/count', () => {
    expect(MORNING_FORM).toContain('sleep_quality: sleepQuality,');
  });
});

describe('FiveMoonsScale — the selected moon now sits in an unmistakable container, not just a cumulative fill', () => {
  it('isSelected (not isFilled) drives a real solid-fill container, the same shape mood/energy/stress already use', () => {
    expect(MOONS).toContain('isSelected');
    expect(MOONS).toMatch(/isSelected\s*\?\s*'scale-105 border-transparent shadow/);
    expect(MOONS).toContain('backgroundColor: SLEEP_QUALITY_SOLID');
  });

  it('the cumulative fill (magnitude) is preserved independently of the selected-container treatment', () => {
    expect(MOONS).toContain('isFilled = value !== null && optionValue <= value');
    expect(MOONS).toContain("fill={isSelected ? '#FFFFFF' : isFilled ? '#C4A050' : 'none'}");
  });

  it('only one moon can ever be the selected container at a time (isSelected is an equality check against a single value)', () => {
    expect(MOONS).toContain('const isSelected = value === optionValue;');
  });
});

describe('the identical fault, audited elsewhere: DotsCount ("count" questions) shared the same no-container bug', () => {
  const DOTS = source('components/checkin/scales/DotsCount.tsx');

  it('previously every filled dot rendered identically (isFilled alone drove the full style) -- now isSelected gets its own distinct, stronger treatment', () => {
    expect(DOTS).toContain('isSelected');
    expect(DOTS).toMatch(/isSelected\s*\?\s*'scale-110 border-transparent bg-\[#1B3A2D\] text-white shadow/);
    // Filled-but-unselected dots must not use the identical class branch the selected dot uses.
    const selectedBranch = /isSelected\s*\?\s*'scale-110[^']*'/.exec(DOTS)?.[0];
    const filledBranch = /isFilled\s*\?\s*'border-transparent bg-\[#1B3A2D\]\/30[^']*'/.exec(DOTS)?.[0];
    expect(selectedBranch).toBeTruthy();
    expect(filledBranch).toBeTruthy();
    expect(selectedBranch).not.toEqual(filledBranch);
  });
});
