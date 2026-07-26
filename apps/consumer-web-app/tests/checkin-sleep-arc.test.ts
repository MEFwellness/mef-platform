/**
 * Daily Check-In redesign v2 — "REMOVE the separate 'About how many
 * hours did you sleep?' question... Derive duration from the arc and
 * keep writing to the existing hours field so nothing downstream
 * breaks. Do not drop the field." deriveDurationBucket is the exact
 * function CheckinForm.tsx's SleepArc onTimesChange callback uses to
 * compute sleep_duration straight from the dragged bedtime/wake
 * minutes — this pins its bucket boundaries against the same 5
 * strings (`'<5h' | '5-6h' | '6-7h' | '7-8h' | '8h+'`) the database
 * column (`daily_checkins.sleep_duration`) and DailyCheckinInput type
 * have always used.
 */
import { describe, it, expect } from 'vitest';
import { deriveDurationBucket } from '../components/checkin/SleepArc';

describe('deriveDurationBucket', () => {
  it('< 5 hours', () => {
    expect(deriveDurationBucket(4 * 60)).toBe('<5h');
    expect(deriveDurationBucket(4 * 60 + 59)).toBe('<5h');
  });

  it('5-6 hours', () => {
    expect(deriveDurationBucket(5 * 60)).toBe('5-6h');
    expect(deriveDurationBucket(5 * 60 + 45)).toBe('5-6h');
  });

  it('6-7 hours', () => {
    expect(deriveDurationBucket(6 * 60)).toBe('6-7h');
  });

  it('7-8 hours', () => {
    expect(deriveDurationBucket(7 * 60)).toBe('7-8h');
    expect(deriveDurationBucket(7 * 60 + 59)).toBe('7-8h');
  });

  it('8+ hours', () => {
    expect(deriveDurationBucket(8 * 60)).toBe('8h+');
    expect(deriveDurationBucket(10 * 60)).toBe('8h+');
  });

  it('a typical bedtime-10:30pm/wake-6:30am window (8h) buckets as 8h+', () => {
    const bedtime = 22 * 60 + 30;
    const wake = 6 * 60 + 30;
    const duration = wake + (24 * 60 - bedtime); // crosses midnight
    expect(duration).toBe(8 * 60);
    expect(deriveDurationBucket(duration)).toBe('8h+');
  });
});
