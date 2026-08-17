/**
 * TEST ACCOUNTS ONLY. Clears this account's stored visibility decisions and
 * its intake submission, so intake can be run again with different answers
 * and the app watched changing shape.
 *
 * WHY THIS EXISTS. The whole promise of this build is that a member's own
 * answers decide what her app contains. That promise is only checkable by
 * running intake more than once with deliberately different answers and
 * comparing what appears, which a real member's account can never be used
 * for: her submission is a permanent record and her visibility rows carry
 * real reveals she has been told about.
 *
 * WHY IT IS SAFE. Four independent gates, and no two of them are the same
 * mechanism. Deliberately the same four the movement-priority reset route
 * and the weekly-review reset route already use, because a second, weaker
 * shape of this would be the thing that eventually leaked.
 *
 *   1. A session is required. No session, 401, nothing read.
 *   2. profiles.is_test must be true FOR THE CALLER. Checked here, on the
 *      server, against her own row. A real member gets 403 and nothing is
 *      touched.
 *   3. RLS. Every delete below runs through the caller's own session, and
 *      each one is additionally restricted in the database to test accounts
 *      (migration 167's test_member_delete_own_feature_visibility, and
 *      migration 44's own member delete policies for onboarding), so the
 *      database refuses regardless of what this handler believes.
 *   4. It can only ever delete the CALLER'S OWN rows. There is no member id
 *      parameter, so there is nothing to tamper with and no other member's
 *      data it could reach.
 *
 * WHAT IT DOES NOT DO. It does not decide any feature's visibility, does not
 * fabricate an answer, and does not complete anything. It removes the stored
 * decisions and the submission behind them; the next render then runs the
 * real rules over whatever she answers next.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false, error: 'no_session' }, { status: 401 });

  const supabase = createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_test')
    .eq('id', user.id)
    .maybeSingle();

  // Fail closed. A missing profile row, a read error, or is_test false all
  // resolve to refused.
  if (!profile?.is_test) {
    return NextResponse.json({ ok: false, error: 'not_a_test_account' }, { status: 403 });
  }

  let alsoIntake = false;
  try {
    const body = (await request.json()) as { intake?: boolean } | null;
    alsoIntake = body?.intake === true;
  } catch {
    // No body is the ordinary case: clear visibility only.
  }

  const { count: visibilityRows } = await supabase
    .from('member_feature_visibility')
    .delete({ count: 'exact' })
    .eq('member_id', user.id)
    .select('id');

  let submissions = 0;
  if (alsoIntake) {
    // Answers are removed with their submission rather than separately: the
    // answer rows reference the submission, so deleting the parent is the
    // one operation, and a half-deleted intake would be a worse state than
    // either a kept one or a cleared one.
    const { data: rows } = await supabase
      .from('onboarding_submissions')
      .delete()
      .eq('user_id', user.id)
      .select('id');
    submissions = rows?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    deleted: { visibility: visibilityRows ?? 0, submissions },
  });
}
