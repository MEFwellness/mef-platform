/**
 * The service-role client, for code that runs with NO session at all.
 *
 * WHO LEGITIMATELY NEEDS ONE, and it is a short list: a scheduled job,
 * which runs for a member who is asleep, and a staff tool that runs one of
 * those jobs on demand. Both are acting AS the platform rather than as
 * anybody, so there is no session whose policies could authorize the work.
 *
 * THIS IS NOT AN AUTHORIZATION SHORTCUT. A caller that has a session must
 * use it: RLS is what decides who may read and write what, and reaching
 * for this to get past a policy is how a bug becomes a data leak. The
 * administrator's force-run tool authorizes with the ADMINISTRATOR'S OWN
 * session first (an active platform_administrator role, checked against
 * the database), and only then runs the job with this, because the job
 * writes rows that no session on earth has a policy for: the delivery
 * receipt in migration 196 deliberately has no insert policy, so that
 * nobody can manufacture or erase one and give themselves a second
 * notification.
 *
 * Pulled out of the cron route files under app/api/cron/, which had four byte-identical
 * copies of it, when the admin tool became a second kind of caller.
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './env';

export function serviceRoleClient(): SupabaseClient {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is missing. Set it in your hosting provider's " +
        'project environment variables, then redeploy.'
    );
  }
  return createClient(url, serviceRoleKey);
}
