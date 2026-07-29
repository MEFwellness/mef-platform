/**
 * Two-fixes pass (2026-07-27), fix 2: duplicate pain-screen copy and
 * the location-clearing bug ("tap Hips, then tap a severity level --
 * the Hips selection clears"). Root cause was CheckinForm.tsx's
 * `onSeverityChange` calling `setPainLocation(null)` whenever severity
 * dropped below PAIN_FOLLOWUP_THRESHOLD -- BodySeverityOutline.tsx
 * itself never owned or reset either value. No rendering harness exists
 * in this repo (plain 'node' vitest environment), so this is a static
 * source scan; the real independent-in-either-order and
 * persists-across-back-and-forward behavior is confirmed live via
 * Playwright, reported separately.
 *
 * 2026-07-29 addendum: the "Any discomfort today?" gate legitimately
 * resets severity/location when she flips the gate itself (a real
 * top-level answer changing, not a sibling question silently reaching
 * into another's state) — a different, intentional exception from the
 * pain-aggravating-factor one below, not a regression of this fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const PAIN_SCREEN = source('components/checkin/BodySeverityOutline.tsx');
const MORNING_FORM = source('app/checkin/CheckinForm.tsx');

describe('fix 2a: the duplicate leftover-silhouette prompt is gone', () => {
  // Scoped to the component's own rendered JSX, not its doc comment
  // (which legitimately names the removed phrase as history).
  const renderedBody = PAIN_SCREEN.slice(PAIN_SCREEN.indexOf('return ('));

  it('no longer renders the stale "tap a spot" instructional copy', () => {
    expect(renderedBody).not.toContain('Tap a spot below');
    expect(renderedBody).not.toMatch(/tap a spot/i);
  });

  it('exactly one location question is rendered (MultiSelectChipGrid\'s own "Where is the discomfort, mainly?", 2026-07-29 wording)', () => {
    const matches = renderedBody.match(/Where is the discomfort/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('fix 2b: severity no longer clears location -- the actual bug, isolated to CheckinForm.tsx\'s call site', () => {
  it('BodySeverityOutline.tsx itself never resets either prop -- it has no internal state for location/severity at all', () => {
    expect(PAIN_SCREEN).not.toContain('useState<string | null>'); // no local locationValue state
    expect(PAIN_SCREEN).not.toContain('useState<number | null>'); // no local severityValue state
  });

  it("CheckinForm's onSeverityChange no longer calls setPainLocation at all", () => {
    const start = MORNING_FORM.indexOf('onSeverityChange={(value) => {');
    const end = MORNING_FORM.indexOf('}}', start);
    const handlerBody = MORNING_FORM.slice(start, end);
    expect(handlerBody).not.toContain('setPainLocation(');
  });

  it('the follow-up-only answer (painAggravatingFactor) may still clear when its own gating condition (severity below threshold) makes it disappear -- a different, narrower behavior than clearing a sibling question', () => {
    const start = MORNING_FORM.indexOf('onSeverityChange={(value) => {');
    const end = MORNING_FORM.indexOf('}}', start);
    const handlerBody = MORNING_FORM.slice(start, end);
    expect(handlerBody).toContain('setSeverity(value);');
    expect(handlerBody).toContain('setPainAggravatingFactor(null);');
  });

  it('onLocationChange is a plain pass-through, never conditioned on the current severity value', () => {
    const start = MORNING_FORM.indexOf('onLocationChange={(locations) => setPainLocation(locations)}');
    expect(start).toBeGreaterThan(-1);
  });
});

describe('audit: no other question pair in either flow has a handler that clears a sibling\'s state', () => {
  const EVENING_FORM = source('app/checkin/evening/EveningReflectionForm.tsx');

  it('CheckinForm has exactly one place any onChange handler calls a different field\'s setter to null (the pain-aggravating-factor case just verified above)', () => {
    // Every other `set...(null)` in this file is either an initial
    // useState default or the one documented exception above -- none of
    // them live inside a *different* question's onChange handler.
    const settersToNull = [...MORNING_FORM.matchAll(/set(\w+)\(null\)/g)].map((m) => m[0]);
    const uniqueSetters = new Set(settersToNull);
    expect(uniqueSetters.has('setPainAggravatingFactor(null)')).toBe(true);
    // painLocation must never appear as a set-to-null call anywhere anymore.
    expect(MORNING_FORM).not.toContain('setPainLocation(null)');
  });

  it('EveningReflectionForm has no cross-field clearing at all', () => {
    expect(EVENING_FORM).not.toMatch(/set\w+\(null\)/);
  });
});

describe('both values still write to their existing, unchanged fields (no schema change)', () => {
  it('severity still feeds pain_discomfort_level and the clamped morning_soreness', () => {
    expect(MORNING_FORM).toContain('pain_discomfort_level: painLevel');
    expect(MORNING_FORM).toContain('morning_soreness: morningSoreness');
  });

  it('painLocation/painAggravatingFactor still submit through the existing probe-answer action', () => {
    expect(MORNING_FORM).toContain("submitProbeAnswerAction(localDate, 'checkin_probe.pain_location', painLocation)");
    expect(MORNING_FORM).toContain(
      "submitProbeAnswerAction(localDate, 'checkin_probe.pain_aggravating_factor', painAggravatingFactor)"
    );
  });

  it('reopening still seeds both from initialProbeAnswers (never discards a revealed follow-up answer)', () => {
    expect(MORNING_FORM).toContain("initialProbeAnswers['checkin_probe.pain_location']");
    expect(MORNING_FORM).toContain("initialProbeAnswers['checkin_probe.pain_aggravating_factor']");
  });
});
