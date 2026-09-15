/**
 * The one place a service role client is built for the Signal Library.
 *
 * WHY INGESTION NEEDS ONE, AND WHY IT IS NOT A WORKAROUND.
 * cross_system_signals is coach only by design: migration 240 gives it no
 * member select policy and no member insert policy at all, so a member's
 * session cannot read a signal about herself and cannot write one either.
 * That is the fence, and it is the point. But the moment a signal should
 * be captured is the moment a member finishes a sitting, on her own
 * request, under her own session.
 *
 * Widening the table with a member insert policy would have been the wrong
 * trade twice over: it would hand a hand made POST the ability to
 * manufacture signals about its own account, and it would put a write
 * policy on a table whose whole safety property is that her session
 * touches none of it. Writing through the same trusted connection this app
 * already uses for rows no session has a policy for is the established
 * answer (lib/coaching-direction/serviceRole.ts states the precedent, and
 * migration 149's own authorization comment names the case).
 *
 * THE MEMBER ID IS NEVER TAKEN FROM A REQUEST BODY. Every caller below
 * passes an id it got from an authenticated session, and every draft is
 * built by an adapter from rows READ BACK OUT OF THE DATABASE rather than
 * from anything the client posted. A member cannot choose what her sitting
 * says about her by posting something different.
 *
 * Returns null when the key is absent (local development and the test
 * environment) rather than throwing, and every caller degrades to doing
 * less: a sitting still saves, a coach still sees the assessment itself,
 * and the signals for that sitting can be backfilled later. A missing
 * credential must never cost a member her completed assessment.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '../supabase/env';
import { forgetRememberedReadsOnWrite } from '../supabase/readOnce';

export function signalLibraryServiceRoleClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  try {
    const { url } = getSupabaseEnv();
    // See lib/supabase/readOnce.ts, and serviceRole.ts's copy of this note.
    return createSupabaseClient(url, serviceRoleKey, {
      global: { fetch: forgetRememberedReadsOnWrite },
    });
  } catch (error) {
    console.error('signalLibraryServiceRoleClient failed to build', error);
    return null;
  }
}
