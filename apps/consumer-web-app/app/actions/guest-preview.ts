'use server';

import { getCachedUser } from '@/lib/supabase/currentUser';
import { getTodaysCheckin, resolveLocalDate, submitDailyCheckin } from './checkin';
import { buildMigratedCheckinInput } from '@/lib/guest-preview/mergeCheckin';
import type { GuestPreviewAnswers } from '@/lib/guest-preview/types';

export interface GuestPreviewMigrationResult {
  error?: string;
  /**
   * True only once a real submitDailyCheckin call has actually happened.
   * false (not an error) means "no session yet — try again once signed
   * in", which the caller must treat as "don't clear local guest data".
   */
  migrated: boolean;
}

/**
 * Called once, client-side, the moment a session first exists after the
 * guest completes signup or logs in (see app/GuestPreviewMigrator.tsx). A
 * no-op, not an error, when there's no session yet — the migrator relies
 * on migrated === false to know it must leave local guest data in place
 * and retry later rather than clearing it prematurely.
 */
export async function migrateGuestPreview(
  answers: GuestPreviewAnswers,
  timezone: string
): Promise<GuestPreviewMigrationResult> {
  const user = await getCachedUser();
  if (!user) return { migrated: false };

  const localDate = await resolveLocalDate(new Date(), false);
  const existing = await getTodaysCheckin(localDate);
  const input = buildMigratedCheckinInput(existing, answers, timezone, localDate);

  const result = await submitDailyCheckin(input);
  if (result.error) return { error: result.error, migrated: false };
  return { migrated: true };
}
