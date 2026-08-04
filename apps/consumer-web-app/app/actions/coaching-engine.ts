'use server';

/**
 * Root Proactive Coaching Engine — server actions. Same convention every
 * other action file in this app uses: session-scoped Supabase client, RLS
 * as the real authorization boundary, null for unauthenticated reads.
 */

import { getRequestClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { firstNameFrom } from '@/lib/profile/greeting';
import { resolveLocalDate } from './checkin';
import type { MorningBrief } from '@mef/shared-types-contracts';
import { getOrCreateTodaysMorningBrief } from '@/lib/coaching-engine/service';

/**
 * The member's Daily Morning Brief for today, generating it on the spot if
 * the daily cron hasn't pre-warmed it yet for their timezone, same lazy-
 * idempotent pattern getOrCreateTodaysFeed already uses for the Daily
 * Coaching Feed. `timezone`/`displayName` are optional caller-supplied
 * values (e.g. the Dashboard already fetched its own profile row),
 * passing them skips this function's own redundant profiles query for the
 * exact same row; omit them and behavior is unchanged from before.
 */
export async function getMyMorningBrief(
  timezone?: string,
  displayName?: string | null
): Promise<MorningBrief | null> {
  const supabase = getRequestClient();
  const user = await getCachedUser();
  if (!user) return null;

  let resolvedTimezone = timezone;
  let resolvedDisplayName = displayName;
  if (!resolvedTimezone) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, timezone')
      .eq('id', user.id)
      .single();
    resolvedTimezone = profile?.timezone ?? 'America/New_York';
    resolvedDisplayName = profile?.display_name;
  }

  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: resolvedTimezone })),
    false
  );
  // greeting_name is stored but never re-rendered directly (see
  // MorningBriefCard.tsx's own header comment — the page header already
  // says the greeting once), so an empty string here is a contained,
  // honest "no name yet" rather than the never-render 'there' fallback.
  const firstName = firstNameFrom(resolvedDisplayName) ?? '';

  return getOrCreateTodaysMorningBrief(supabase, user.id, localDate, firstName);
}
