/**
 * UX audit fix (item 3 in the priority list): cinematic screen 7 ("How
 * groggy did you feel when you first woke up?") was the only five-point
 * scale in either flow with no word anchors — a bare 1-5 segmented row,
 * since `checkin_probe.morning_grogginess` is a `scale`-type driver-probe
 * question and DriverProbeField.tsx renders every `scale` question as
 * plain numbers by default. Confirmed via a live local-DB query that it's
 * the only `scale`-type question that actually reaches this generic path
 * (`morning_soreness` and `digestion_rating` are the only other two
 * `scale` rows, and both are specially-handled elsewhere in
 * CheckinForm.tsx — SPECIALLY_HANDLED_QUESTION_KEYS — so they never call
 * DriverProbeField at all).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SCALE_ANCHOR_LABELS } from '../components/checkin/DriverProbeField';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

const DRIVER_PROBE_FIELD = source('components/checkin/DriverProbeField.tsx');

describe('SCALE_ANCHOR_LABELS — endpoint word anchors for bare-number scale questions', () => {
  it('morning_grogginess has real word anchors, not a placeholder', () => {
    expect(SCALE_ANCHOR_LABELS['checkin_probe.morning_grogginess']).toEqual({
      low: 'Not groggy',
      high: 'Very groggy',
    });
  });

  it('a scale question with no entry here is simply absent (renders as before, no crash)', () => {
    expect(SCALE_ANCHOR_LABELS['checkin_probe.some_future_scale_question']).toBeUndefined();
  });
});

describe('DriverProbeField renders anchors under the scale row only when present for that question', () => {
  it('the scale branch looks up SCALE_ANCHOR_LABELS by questionKey and renders low/high conditionally', () => {
    expect(DRIVER_PROBE_FIELD).toContain('SCALE_ANCHOR_LABELS[question.questionKey]');
    expect(DRIVER_PROBE_FIELD).toMatch(/\{anchors &&/);
    expect(DRIVER_PROBE_FIELD).toContain('{anchors.low}');
    expect(DRIVER_PROBE_FIELD).toContain('{anchors.high}');
  });

  it('the numeric ShortOptionRow itself is untouched — anchors are additive, not a replacement for the numbers', () => {
    expect(DRIVER_PROBE_FIELD).toContain("options={numericOptions.map((n) => ({ value: n, label: String(n) }))}");
  });
});
