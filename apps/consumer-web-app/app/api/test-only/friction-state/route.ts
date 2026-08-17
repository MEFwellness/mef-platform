/**
 * TEST ACCOUNTS ONLY. Puts this account's coaching threads into the
 * three-consecutive-days-ignored state, so the friction question can be
 * watched appearing, answered, and its effect on the next day observed.
 *
 * WHY THIS EXISTS, AND WHY IT COULD NOT BE DONE BEFORE. The friction
 * question fires when a thread reaches `consecutive_ignored = 3`
 * (IGNORES_BEFORE_APPROACH_CHANGE). The standing production test member has
 * responded to her priority card on every single day it has ever been shown
 * to her, so her counter is zero and there is no honest way to reach that
 * state on her account: writing a 3 into her thread asserts three days of
 * ignoring that did not happen, and the engine would then ACT on that lie,
 * changing how it speaks to her and, two changes later, handing her thread
 * to a coach. Her profile also has is_test = false, so the test-account-only
 * policies do not apply to her anyway.
 *
 * A throwaway member with is_test = true is the honest place to do this.
 * There is no real person behind the counter, nothing it could be wrong
 * about, and the whole account exists to be reset.
 *
 * WHY IT IS SAFE. The same four independent gates as the other two
 * test-only routes, deliberately rather than coincidentally:
 *
 *   1. A session is required. No session, 401.
 *   2. profiles.is_test must be true FOR THE CALLER, checked here against
 *      her own row. A real member gets 403 and nothing is touched.
 *   3. RLS. The update runs through the caller's own session, which may only
 *      reach her own thread rows (member_update_own_coaching_threads,
 *      migration 150), and the delete of today's decisions is restricted in
 *      the database to test accounts (migration 156).
 *   4. There is no member id parameter, so there is nothing to tamper with.
 *
 * WHAT IT DOES NOT DO. It does not ask the question, does not answer it, and
 * does not choose the next framing. It sets one counter and clears today's
 * claim; the real engine then runs over her real state on the next render.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveLocalDate } from '@/app/actions/checkin';
import { IGNORES_BEFORE_APPROACH_CHANGE } from '@/lib/coaching-direction/adaptation';

export async function POST(): Promise<NextResponse> {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  const supabase = createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_test, timezone')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_test) {
    return NextResponse.json({ ok: false, error: 'not_a_test_account' }, { status: 403 });
  }

  const timezone = (profile.timezone as string | null) ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );

  // The counter, and only the counter. approach_changes is deliberately
  // left alone: this route sets up the day the question is asked, not the
  // state after two reframings, and conflating the two would make a passing
  // check meaningless.
  const { data: threads } = await supabase
    .from('member_coaching_threads')
    .update({
      consecutive_ignored: IGNORES_BEFORE_APPROACH_CHANGE,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', user.id)
    .select('thread_key, consecutive_ignored, approach, approach_changes');

  // Today's claim is cleared so the next render runs the engine again
  // rather than replaying a decision made before the counter moved. Same
  // mechanism, and the same database policy, as the movement priority
  // reset route.
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

  return NextResponse.json({
    ok: true,
    localDate,
    threads: (threads ?? []).map((t) => ({
      threadKey: (t as { thread_key: string }).thread_key,
      consecutiveIgnored: (t as { consecutive_ignored: number }).consecutive_ignored,
      approach: (t as { approach: number }).approach,
      approachChanges: (t as { approach_changes: number }).approach_changes,
    })),
    cleared: { priorities: priorities ?? 0, decisions: decisions ?? 0 },
  });
}
