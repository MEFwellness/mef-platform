import type { GuestPreviewAnswers } from './types';
import type { DailyCheckin, DailyCheckinInput } from '@mef/shared-types-contracts';

/**
 * Merges guest quiz answers into today's real check-in shape, favoring
 * whatever the member has already genuinely recorded. Existing values are
 * never overwritten by guest data — this only fills fields that are still
 * null, the same "partially answered day" merge shape submitEveningBodyCheckin
 * already uses in app/actions/checkin.ts. Kept in a plain (non-'use server')
 * module so it stays a synchronous, directly unit-testable function —
 * every export of a 'use server' file must be async, so this can't live in
 * app/actions/guest-preview.ts itself.
 */
export function buildMigratedCheckinInput(
  existing: DailyCheckin | null,
  answers: GuestPreviewAnswers,
  timezone: string,
  localDate: string
): DailyCheckinInput {
  return {
    timezone,
    local_date: localDate,
    mood_level: existing?.mood_level ?? answers.mood_level ?? null,
    sleep_quality: existing?.sleep_quality ?? answers.sleep_quality ?? null,
    sleep_duration: existing?.sleep_duration ?? null,
    energy_level: existing?.energy_level ?? answers.energy_level ?? null,
    stress_level: existing?.stress_level ?? answers.stress_level ?? null,
    water_cups: existing?.water_cups ?? null,
    digestion_rating: existing?.digestion_rating ?? answers.digestion_rating ?? null,
    pain_discomfort_level: existing?.pain_discomfort_level ?? answers.pain_discomfort_level ?? null,
    movement_today: existing?.movement_today ?? answers.movement_today ?? null,
    new_or_worsening_concern: existing?.new_or_worsening_concern ?? false,
    optional_notes: existing?.optional_notes ?? null,
    actual_bedtime: existing?.actual_bedtime ?? null,
    actual_wake_time: existing?.actual_wake_time ?? null,
    night_waking_count: existing?.night_waking_count ?? null,
    night_sweats: existing?.night_sweats ?? null,
    morning_soreness: existing?.morning_soreness ?? null,
    bowel_movement_status: existing?.bowel_movement_status ?? null,
  };
}
