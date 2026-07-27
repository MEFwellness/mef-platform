/**
 * Sleep dial readability fix — three changes: (a) tap either printed
 * time to open the phone's native time picker, (b) label the dial's
 * four quarters and make the printed time track a drag live, (c)
 * pre-fill both handles from her recent check-ins' typical bedtime/wake.
 * No schema change: everything still lands on the existing
 * actual_bedtime/actual_wake_time/sleep_duration fields. This covers the
 * pure math (directly testable) and a source-level scan for the
 * component wiring (no rendering harness in this repo — vitest.config.ts
 * runs a plain 'node' environment).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  parseTimeToMinutes,
  durationMinutes,
  deriveDurationBucket,
  typicalMinutesOfDay,
} from '../lib/daily-checkin-adaptive/sleepMath';
import { typicalSleepTimes } from '../lib/daily-checkin-adaptive/sleepHistory';

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, '..', relativePath), 'utf-8');
}

describe('parseTimeToMinutes — regression: a real stored value ("HH:MM:SS", how Postgres time columns round-trip) must parse, not just "HH:MM"', () => {
  it('parses plain HH:MM (what this app has always written)', () => {
    expect(parseTimeToMinutes('22:30')).toBe(22 * 60 + 30);
  });

  it('parses HH:MM:SS (what a real stored actual_bedtime/actual_wake_time value actually looks like)', () => {
    expect(parseTimeToMinutes('22:30:00')).toBe(22 * 60 + 30);
    expect(parseTimeToMinutes('06:30:15')).toBe(6 * 60 + 30);
  });

  it('rejects garbage rather than silently misparsing', () => {
    expect(parseTimeToMinutes('not a time')).toBeNull();
    expect(parseTimeToMinutes('')).toBeNull();
  });
});

describe('typicalMinutesOfDay — circular median, correctly handling the midnight wrap', () => {
  it('a plain mid-range median with no wraparound involved', () => {
    expect(typicalMinutesOfDay([6 * 60, 6 * 60 + 30, 7 * 60], 0)).toBe(6 * 60 + 30);
  });

  it('bedtime samples straddling midnight (23:30 and 00:30) average to about midnight, not noon, once rotated around the noon boundary', () => {
    const justBeforeMidnight = 23 * 60 + 30;
    const justAfterMidnight = 0 * 60 + 30;
    const typical = typicalMinutesOfDay([justBeforeMidnight, justAfterMidnight], 12 * 60);
    // The two samples are 60 minutes apart across the wrap; the correct
    // "typical" sits at midnight (0), not the nonsense ~720 (noon) a
    // naive arithmetic mean of 1410 and 30 would produce.
    expect(typical).toBe(0);
  });

  it('returns null for an empty sample set rather than a fabricated number', () => {
    expect(typicalMinutesOfDay([], 0)).toBeNull();
  });
});

describe('typicalSleepTimes — the sleep dial pre-fill data source (task 3c)', () => {
  it('computes a typical bedtime and wake time from real recent check-ins, and the duration bucket that pair would derive', () => {
    const recent = [
      { actual_bedtime: '22:30:00', actual_wake_time: '06:30:00' },
      { actual_bedtime: '22:45:00', actual_wake_time: '06:15:00' },
      { actual_bedtime: '22:15:00', actual_wake_time: '06:45:00' },
    ];
    const result = typicalSleepTimes(recent);
    expect(result.bedtime).toBe('22:30');
    expect(result.wakeTime).toBe('06:30');
    expect(result.durationBucket).toBe(deriveDurationBucket(durationMinutes(22 * 60 + 30, 6 * 60 + 30)));
  });

  it('with no history at all, returns all-null — never a fabricated "typical" pretending to be hers', () => {
    expect(typicalSleepTimes([])).toEqual({ bedtime: null, wakeTime: null, durationBucket: null });
  });

  it('a night with only one of the two logged still contributes to that one side independently', () => {
    const recent = [
      { actual_bedtime: '22:30:00', actual_wake_time: null },
      { actual_bedtime: null, actual_wake_time: '06:30:00' },
    ];
    const result = typicalSleepTimes(recent);
    expect(result.bedtime).toBe('22:30');
    expect(result.wakeTime).toBe('06:30');
  });

  it('ignores rows with no bedtime/wake data at all', () => {
    const recent = [
      { actual_bedtime: null, actual_wake_time: null },
      { actual_bedtime: '22:30:00', actual_wake_time: '06:30:00' },
    ];
    expect(typicalSleepTimes(recent).bedtime).toBe('22:30');
  });
});

describe('both bedtime/wake entry methods write through the exact same contract (task: "must write to the same existing bedtime and wake-time fields")', () => {
  const SLEEP_ARC = source('components/checkin/SleepArc.tsx');

  it('applyDirectTime (the tap-to-pick handler) calls onTimesChange with formatMinutesToTimeValue and deriveDurationBucket(durationMinutes(...)) — the same shape updateFromPointer (drag) uses', () => {
    const dragBlock = SLEEP_ARC.slice(
      SLEEP_ARC.indexOf('const updateFromPointer'),
      SLEEP_ARC.indexOf('startDrag')
    );
    const tapBlock = SLEEP_ARC.slice(
      SLEEP_ARC.indexOf('function applyDirectTime'),
      SLEEP_ARC.indexOf('const bedtimeInputId')
    );
    for (const block of [dragBlock, tapBlock]) {
      expect(block).toContain('onTimesChange(');
      expect(block).toContain('formatMinutesToTimeValue(nextBedtime)');
      expect(block).toContain('formatMinutesToTimeValue(nextWake)');
      expect(block).toContain('deriveDurationBucket(durationMinutes(nextBedtime, nextWake))');
    }
  });

  it('the native time picker is a real <input type="time"> linked to its printed label via htmlFor, for both bedtime and wake', () => {
    expect(SLEEP_ARC).toContain('htmlFor={bedtimeInputId}');
    expect(SLEEP_ARC).toContain('htmlFor={wakeInputId}');
    expect(SLEEP_ARC).toMatch(/id=\{bedtimeInputId\}\s*\n\s*type="time"/);
    expect(SLEEP_ARC).toMatch(/id=\{wakeInputId\}\s*\n\s*type="time"/);
  });

  it('dragging the handles still works — the pointer handlers are untouched, not replaced by the tap picker', () => {
    expect(SLEEP_ARC).toContain('onPointerDown={(e) => startDrag(');
    expect(SLEEP_ARC).toContain('onPointerMove={(e) => onDragMove(');
  });
});

describe('the dial is labeled at its four quarters, with minor ticks between (task 3b)', () => {
  const SLEEP_ARC = source('components/checkin/SleepArc.tsx');

  it('12 AM/6 AM/12 PM/6 PM are the four labeled quarters, matching angleForMinutes\' own top/right/bottom/left orientation', () => {
    expect(SLEEP_ARC).toContain("{ angle: 0, label: '12 AM' }");
    expect(SLEEP_ARC).toContain("{ angle: 90, label: '6 AM' }");
    expect(SLEEP_ARC).toContain("{ angle: 180, label: '12 PM' }");
    expect(SLEEP_ARC).toContain("{ angle: 270, label: '6 PM' }");
  });

  it('minor tick marks exist between the four labeled quarters', () => {
    expect(SLEEP_ARC).toContain('MINOR_TICK_ANGLES');
    expect(SLEEP_ARC).toMatch(/MINOR_TICK_ANGLES\.map/);
  });
});

describe('the printed time tracks a drag live via local preview state, not only on release (task 3b)', () => {
  const SLEEP_ARC = source('components/checkin/SleepArc.tsx');

  it('a dragPreview state exists and feeds the same bedtimeMinutes/wakeMinutes the printed labels and the arc itself read', () => {
    expect(SLEEP_ARC).toContain('const [dragPreview, setDragPreview]');
    expect(SLEEP_ARC).toContain("dragPreview?.handle === 'bedtime' ? dragPreview.minutes : committedBedtimeMinutes");
    expect(SLEEP_ARC).toContain("dragPreview?.handle === 'wake' ? dragPreview.minutes : committedWakeMinutes");
  });

  it('updateFromPointer (called on every pointer move during a drag) sets the preview synchronously, before calling onTimesChange', () => {
    const block = SLEEP_ARC.slice(
      SLEEP_ARC.indexOf('const updateFromPointer'),
      SLEEP_ARC.indexOf('[committedBedtimeMinutes, committedWakeMinutes, onTimesChange]')
    );
    const previewIndex = block.indexOf('setDragPreview(');
    const onTimesChangeIndex = block.indexOf('onTimesChange(');
    expect(previewIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeLessThan(onTimesChangeIndex);
  });

  it('the preview clears on drag end, handing display back to the committed (parent-confirmed) value', () => {
    const block = SLEEP_ARC.slice(SLEEP_ARC.indexOf('function endDrag'), SLEEP_ARC.indexOf('function onKeyDown'));
    expect(block).toContain('setDragPreview(null)');
  });
});

describe('CheckinForm pre-fills the sleep dial from typical history only when today has no bedtime/wake yet (task 3c)', () => {
  const FORM = source('app/checkin/CheckinForm.tsx');

  it('bedtime/wake state falls back through existingCheckin, then typicalSleep, never inventing a value ahead of a real answer', () => {
    expect(FORM).toContain('existingCheckin?.actual_bedtime ?? typicalSleep.bedtime ?? \'\'');
    expect(FORM).toContain('existingCheckin?.actual_wake_time ?? typicalSleep.wakeTime ?? \'\'');
  });

  it('sleep_duration pre-fills from the same typical computation', () => {
    expect(FORM).toContain('existingCheckin?.sleep_duration ?? typicalSleep.durationBucket');
  });
});
