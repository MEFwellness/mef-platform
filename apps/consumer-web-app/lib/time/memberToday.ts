/**
 * The member's own calendar date, resolved on the server.
 *
 * B3, THE COACH SIDE (2026-08-28). Four coach panels computed "today" with
 * `new Date()` while rendering. They are client components, so they render
 * twice: once on Vercel, which runs in UTC, and once in the coach's
 * browser, which does not. The two passes disagreed for the whole of a US
 * evening, and the disagreement landed in a date input's value and in a
 * default schedule, which is exactly the hydration-mismatch family
 * (#418/#423/#425) `lib/time/displayDate.ts` was written for on the
 * display side.
 *
 * A date input on a coach's screen is not a display string, so pinning it
 * to UTC would be the wrong fix: the date that matters is the one the
 * member is living in, which is also the one the server uses when the
 * coach presses the button. This resolves that date once, on the server,
 * and the panel receives it as a prop, so there is one date and both
 * passes render it.
 *
 * Same three lines that already lived privately in app/actions/caseView.ts
 * and beside `resolveMemberTimezone` in app/actions/coach-programs.ts,
 * stated once.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { todaysLocalDate } from './localDate';

/** The default when a member has no timezone on file, matching every other caller in this app. */
export const FALLBACK_TIMEZONE = 'America/New_York';

export async function memberTimezone(
  supabase: SupabaseClient,
  memberId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', memberId).maybeSingle();
  return data?.timezone ?? FALLBACK_TIMEZONE;
}

export async function memberTodayLocalDate(
  supabase: SupabaseClient,
  memberId: string
): Promise<string> {
  return todaysLocalDate(await memberTimezone(supabase, memberId));
}
