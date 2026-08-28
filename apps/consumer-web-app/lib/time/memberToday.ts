/**
 * The member's own timezone, and the calendar date she is living in,
 * resolved on the server.
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
 * B3, THE MEMBER SIDE (2026-08-28, build 5). The same defect was on
 * `/programs`: `MemberProgramsList` split her sessions into "Coming up"
 * and "Already done" on `new Date().toISOString().slice(0, 10)`, which is
 * UTC's date, not hers. Every evening after 8pm Eastern, UTC had already
 * rolled over, so tomorrow's session was filed under "Already done". The
 * split is decided here now and handed down as a prop.
 *
 * A date input on a coach's screen, and a day boundary a member's sessions
 * are sorted on, are not display strings, so pinning them to UTC would be
 * the wrong fix: the date that matters is the one the member is living in,
 * which is also the one the server uses when a button is pressed. This
 * resolves that date once, on the server, and the component receives it as
 * a prop, so there is one date and both passes render it.
 *
 * Request-memoized, through `lib/member/profileCore.ts`. A member screen
 * may resolve her timezone from more than one place in a single render
 * (the page, and a server action it calls), and that was a `profiles`
 * round trip each time. React's `cache()` scopes the memoization to one
 * request, exactly as `lib/supabase/currentUser.ts` already does for
 * `auth.getUser()`. It keys on argument identity, and `createClient()` is
 * itself request-memoized now, so every caller in one request shares one
 * client and therefore one answer.
 *
 * HER NAME COMES OFF THE SAME ROW. `memberProfileCore` selects
 * `display_name, timezone` together rather than each caller selecting its
 * own column, because they are one row and reading it twice is two round
 * trips for one fact.
 *
 * Same three lines that used to live privately in app/actions/caseView.ts
 * and beside `resolveMemberTimezone` in app/actions/coach-programs.ts,
 * stated once. Both now call this.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { todaysLocalDate } from './localDate';
import { memberProfileCore } from '../member/profileCore';

/** The default when a member has no timezone on file, matching every other caller in this app. */
export const FALLBACK_TIMEZONE = 'America/New_York';

export async function memberTimezone(
  supabase: SupabaseClient,
  memberId: string
): Promise<string> {
  const { timezone } = await memberProfileCore(supabase, memberId);
  return timezone ?? FALLBACK_TIMEZONE;
}

export async function memberTodayLocalDate(
  supabase: SupabaseClient,
  memberId: string
): Promise<string> {
  return todaysLocalDate(await memberTimezone(supabase, memberId));
}
