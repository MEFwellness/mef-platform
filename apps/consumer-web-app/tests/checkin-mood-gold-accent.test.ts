/**
 * UX audit fix (batch 1, items 1+2, 2026-07-27): the mood scale
 * (FiveFacesScale.tsx) used to fill the selected card's whole surface
 * with a color pulled from MOOD_RAMP at that option's index — both a
 * full gold surface (gold is an accent color in this brand, never a
 * whole filled card) on the "Excellent" end, and a hue ramp that let a
 * member read "which answer the app approves of" from color alone. No
 * component-rendering harness exists in this repo (plain 'node' vitest
 * environment), so this is a static scan of the fixed source, same
 * discipline as tests/checkin-scale-contrast.test.ts. The real legibility
 * of the accent-only selected state is verified live via Playwright,
 * reported separately.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const MOOD = source('components/checkin/scales/FiveFacesScale.tsx');

describe('FiveFacesScale (mood): gold is an accent only, never a whole filled card surface', () => {
  it('no longer imports checkin-color-ramps or calls rampColorAt for its own rendering', () => {
    expect(MOOD).not.toContain("from '@/lib/checkin-color-ramps'");
    expect(MOOD).not.toContain('rampColorAt(');
  });

  it('the card never sets a backgroundColor style — the surface stays the same regardless of selection', () => {
    expect(MOOD).not.toMatch(/style=\{isSelected/);
    expect(MOOD).not.toContain('backgroundColor: fill');
  });

  it('gold appears only as a ring border around the selected card', () => {
    expect(MOOD).toContain("const MOOD_ACCENT = '#C4A050';");
    expect(MOOD).toMatch(/isSelected\s*\?\s*'scale-105 border-\[#C4A050\]/);
  });

  it('the face icon itself is stroked gold when selected, dark green otherwise', () => {
    expect(MOOD).toMatch(/const stroke = isSelected \? MOOD_ACCENT : '#1B3A2D';/);
  });

  it('the selected label is bold/dark-green; unselected stays medium-weight/gray', () => {
    expect(MOOD).toMatch(/isSelected\s*\?\s*'font-bold text-\[#1B3A2D\]'\s*:\s*'font-medium text-\[#6B7A72\]'/);
  });

  it('magnitude/direction is conveyed by a computed accent-dot opacity that varies with index, not by a per-index color (the stress-scale solution)', () => {
    expect(MOOD).toContain('accentOpacity');
    expect(MOOD).toMatch(/MIN_ACCENT_OPACITY \+ \(index/);
  });

  it('does not reuse forest green as the selected fill — Mood renders alongside Energy (already solid forest green) on the same section-mode screen', () => {
    expect(MOOD).not.toMatch(/backgroundColor:\s*['"`]?#?1B3A2D/i);
  });
});
