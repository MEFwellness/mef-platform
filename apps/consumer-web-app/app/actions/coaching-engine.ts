'use server';

/**
 * Root Proactive Coaching Engine — server actions. Same convention every
 * other action file in this app uses: session-scoped Supabase client, RLS
 * as the real authorization boundary, null for unauthenticated reads.
 */

import { createClient } from '@/lib/supabase/server';
import { resolveLocalDate } from './checkin';
import type { MorningBrief } from '@mef/shared-types-contracts';
import { getOrCreateTodaysMorningBrief } from '@/lib/coaching-engine/service';

/** The member's Daily Morning Brief for today, generating it on the spot if the daily cron hasn't pre-warmed it yet for their timezone — same lazy-idempotent pattern getOrCreateTodaysFeed already uses for the Daily Coaching Feed. */
export async function getMyMorningBrief(): Promise<MorningBrief | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', user.id)
    .single();

  const timezone = profile?.timezone ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return getOrCreateTodaysMorningBrief(supabase, user.id, localDate, firstName);
}
