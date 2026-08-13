/**
 * TEST ACCOUNTS ONLY. Clears this week's Weekly Root Review so a
 * verification pass can watch it arrive again.
 *
 * WHY THIS EXISTS. The review's trigger is the calendar: the first app open
 * on or after the member's own local Monday. That is correct behavior and it
 * is also unverifiable on demand, because a verification run cannot wait
 * seven days to see the second delivery, or prove the once-per-week rule by
 * observing a single one.
 *
 * WHY IT IS SAFE. Four independent gates, and no two of them are the same
 * mechanism:
 *
 *   1. A session is required. No session, 401, nothing read.
 *   2. profiles.is_test must be true FOR THE CALLER. Checked here, on the
 *      server, against her own row. A real member gets 403 and nothing is
 *      touched.
 *   3. Migration 151's DELETE policies on both tables grant the delete only
 *      to a member whose own profiles.is_test is true. So even if this
 *      handler's own check were removed, the database would still refuse.
 *   4. It can only ever delete the CALLER'S OWN rows for the CURRENT week.
 *      There is no member id parameter and no week parameter, so there is
 *      nothing to tamper with and no other member's data it could reach.
 *
 * WHAT IT DOES NOT DO. It does not compose a review, does not fabricate
 * data, and does not change what the composer would say. It removes this
 * week's row, its week focus row, and the pop-up dismissal that records "she
 * has already been shown it this week". The next render then does exactly
 * what a real Monday morning does, over her real data. Nothing about the
 * review a verification pass then sees is different from the one a member
 * would get.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveLocalDate } from '@/app/actions/checkin';
import { deleteWeeklyReviewForWeek } from '@/lib/weekly-review/data';
import { weekStartFor } from '@/lib/weekly-review/week';
import {
  clearRootPopupDismissal,
  weeklyReviewPopupMessageKey,
} from '@/lib/root-popup-messages/data';

export async function POST(): Promise<NextResponse> {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  const supabase = createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_test, timezone')
    .eq('id', user.id)
    .maybeSingle();

  // Fail closed. A missing profile row, a read error, or is_test false all
  // resolve to refused, exactly like lib/reset-plan/eligibility.ts's own
  // entitlement gate.
  if (!profile?.is_test) {
    return NextResponse.json({ ok: false, error: 'not_a_test_account' }, { status: 403 });
  }

  const timezone = (profile.timezone as string | null) ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
  const weekStart = weekStartFor(localDate);

  const deleted = await deleteWeeklyReviewForWeek(supabase, user.id, weekStart);
  await clearRootPopupDismissal(supabase, user.id, weeklyReviewPopupMessageKey(weekStart));

  return NextResponse.json({ ok: true, weekStart, deleted });
}
