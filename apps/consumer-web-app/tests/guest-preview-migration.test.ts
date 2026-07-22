import { describe, it, expect } from 'vitest';
import { buildMigratedCheckinInput } from '@/lib/guest-preview/mergeCheckin';
import { EMPTY_GUEST_PREVIEW_ANSWERS } from '@/lib/guest-preview/types';
import type { DailyCheckin } from '@mef/shared-types-contracts';

const TIMEZONE = 'America/New_York';
const LOCAL_DATE = '2026-07-22';

function makeExistingCheckin(overrides: Partial<DailyCheckin>): DailyCheckin {
  return {
    id: 'existing-id',
    user_id: 'member-1',
    recorded_at: '2026-07-22T08:00:00Z',
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: '2026-07-21',
    sleep_observation_period_end: '2026-07-22',
    created_at: '2026-07-22T08:00:00Z',
    timezone: TIMEZONE,
    local_date: LOCAL_DATE,
    mood_level: null,
    sleep_quality: null,
    sleep_duration: null,
    energy_level: null,
    stress_level: null,
    water_cups: null,
    digestion_rating: null,
    pain_discomfort_level: null,
    movement_today: null,
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    ...overrides,
  };
}

describe('buildMigratedCheckinInput (guest-to-member merge)', () => {
  it('fills every field from guest answers when there is no existing check-in', () => {
    const answers = {
      energy_level: 4,
      stress_level: 2,
      sleep_quality: 5,
      digestion_rating: 3,
      movement_today: 'moderate' as const,
      pain_discomfort_level: 1,
      mood_level: 4,
    };

    const input = buildMigratedCheckinInput(null, answers, TIMEZONE, LOCAL_DATE);

    expect(input.energy_level).toBe(4);
    expect(input.stress_level).toBe(2);
    expect(input.sleep_quality).toBe(5);
    expect(input.digestion_rating).toBe(3);
    expect(input.movement_today).toBe('moderate');
    expect(input.pain_discomfort_level).toBe(1);
    expect(input.mood_level).toBe(4);
    expect(input.new_or_worsening_concern).toBe(false);
    expect(input.timezone).toBe(TIMEZONE);
    expect(input.local_date).toBe(LOCAL_DATE);
    // Fields the guest quiz never asks about stay null.
    expect(input.water_cups).toBeNull();
    expect(input.sleep_duration).toBeNull();
  });

  it('never overwrites a real, already-recorded value with guest data', () => {
    const existing = makeExistingCheckin({
      mood_level: 5,
      energy_level: 5,
      new_or_worsening_concern: true,
    });
    const guestAnswers = {
      ...EMPTY_GUEST_PREVIEW_ANSWERS,
      mood_level: 1,
      energy_level: 1,
      stress_level: 5,
    };

    const input = buildMigratedCheckinInput(existing, guestAnswers, TIMEZONE, LOCAL_DATE);

    // Real values win outright, even though the guest answered differently.
    expect(input.mood_level).toBe(5);
    expect(input.energy_level).toBe(5);
    // A field the real check-in left blank is still filled from the guest.
    expect(input.stress_level).toBe(5);
    // A real true concern flag must never be silently reset to false.
    expect(input.new_or_worsening_concern).toBe(true);
  });

  it('fills only the genuinely blank fields, leaving every other real field untouched', () => {
    const existing = makeExistingCheckin({
      sleep_quality: 4,
      water_cups: 6,
      optional_notes: 'felt off today',
    });
    const guestAnswers = {
      ...EMPTY_GUEST_PREVIEW_ANSWERS,
      digestion_rating: 3,
      movement_today: 'light' as const,
    };

    const input = buildMigratedCheckinInput(existing, guestAnswers, TIMEZONE, LOCAL_DATE);

    expect(input.sleep_quality).toBe(4);
    expect(input.water_cups).toBe(6);
    expect(input.optional_notes).toBe('felt off today');
    expect(input.digestion_rating).toBe(3);
    expect(input.movement_today).toBe('light');
  });

  it('defaults new_or_worsening_concern to false when there is no existing check-in', () => {
    const input = buildMigratedCheckinInput(
      null,
      EMPTY_GUEST_PREVIEW_ANSWERS,
      TIMEZONE,
      LOCAL_DATE
    );
    expect(input.new_or_worsening_concern).toBe(false);
  });
});
