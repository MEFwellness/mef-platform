/**
 * TEST ACCOUNTS ONLY. Clears today's Priority Card decision so a
 * verification pass can watch Root claim a new one, and reports whether
 * today's Daily Reset is done, which is the condition the movement flip's
 * enriched fallback turns on.
 *
 * WHY THIS EXISTS. The card claims one priority per member per local day
 * and never rewrites it (migration 147's own insert-if-absent rule), which
 * is correct behavior and also unverifiable on demand: a pass cannot wait
 * until tomorrow to see the next claim, and it cannot prove "a movement
 * session is offered once the Daily Reset is done" by observing a day whose
 * priority was claimed before the reset was finished.
 *
 * WHY IT IS SAFE. Four independent gates, and no two of them are the same
 * mechanism. Deliberately the same four the weekly review's own reset route
 * uses, because a second, weaker shape of this would be the thing that
 * eventually leaked.
 *
 *   1. A session is required. No session, 401, nothing read.
 *   2. profiles.is_test must be true FOR THE CALLER. Checked here, on the
 *      server, against her own row. A real member gets 403 and nothing is
 *      touched.
 *   3. RLS. Every delete below runs through the caller's own session, so
 *      the database itself refuses any row that is not hers, whatever this
 *      handler believes.
 *   4. It can only ever delete the CALLER'S OWN rows for TODAY. There is no
 *      member id parameter and no date parameter, so there is nothing to
 *      tamper with and no other member's data it could reach.
 *
 * WHAT IT DOES NOT DO. It does not choose a priority, does not fabricate a
 * signal, does not complete a Daily Reset, and does not decide whether a
 * movement session is offered. It removes today's claim and today's ledger
 * row, and the next render then runs the real engine over her real data.
 * Nothing the pass then sees differs from what a member would get.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveLocalDate } from '@/app/actions/checkin';

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
  // resolve to refused.
  if (!profile?.is_test) {
    return NextResponse.json({ ok: false, error: 'not_a_test_account' }, { status: 403 });
  }

  const timezone = (profile.timezone as string | null) ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );

  const { count: priorities } = await supabase
    .from('member_daily_priorities')
    .delete({ count: 'exact' })
    .eq('member_id', user.id)
    .eq('local_date', localDate)
    .select('id');

  const { count: decisions } = await supabase
    .from('member_coaching_decisions')
    .delete({ count: 'exact' })
    .eq('member_id', user.id)
    .eq('local_date', localDate)
    .select('id');

  // Reported, never changed. Whether today's Daily Reset is done is the
  // whole condition the enriched fallback turns on, and a pass that cannot
  // see it cannot tell "movement was not offered because the reset is not
  // done" (correct) from "movement was not offered at all" (a regression).
  //
  // Reads `daily_checkins_current` on `user_id`, which is exactly what
  // app/actions/checkin.ts's getTodaysCheckin reads and exactly what
  // app/today/page.tsx passes the engine as `checkinDoneToday`. Reading the
  // base table on `member_id` instead is a real mistake this route made
  // first time out: it reported false for an account the engine had
  // correctly seen as done, which is precisely the kind of disagreement a
  // verification probe exists to avoid.
  const { data: checkin } = await supabase
    .from('daily_checkins_current')
    .select('id')
    .eq('user_id', user.id)
    .eq('local_date', localDate)
    .maybeSingle();

  // Same reporting discipline: whether the six sessions are reachable at
  // all from this account's session. An empty list is the correct dormant
  // state before migration 153, and it is not the same failure as the
  // engine declining to offer one.
  const { data: templates } = await supabase
    .from('movement_session_templates')
    .select('session_key')
    .eq('is_active', true);

  return NextResponse.json({
    ok: true,
    localDate,
    deleted: { priorities: priorities ?? 0, decisions: decisions ?? 0 },
    checkinDoneToday: checkin !== null,
    liveSessionCount: templates?.length ?? 0,
  });
}
