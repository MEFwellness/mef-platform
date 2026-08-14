import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { PASSWORD_RECOVERY_COOKIE } from '@/lib/auth/recovery';
import { ConfirmResetForm } from './ConfirmResetForm';

// Reads cookies and the current session, so it can never be prerendered.
export const dynamic = 'force-dynamic';

/**
 * Server half of the set-new-password screen. Its only job is to answer one
 * question before anything renders: is this browser genuinely in the middle
 * of a password recovery?
 *
 * Both halves of the answer are required. A session on its own is not
 * enough, and deliberately so: without the recovery marker, any ordinary
 * signed-in member could open this URL and set a new password without being
 * asked for their current one, which would quietly undo the whole point of
 * the change-password flow at app/account/password. The marker is only ever
 * set by a link that arrived from a reset email.
 *
 * A recovery that landed with its tokens in the URL fragment has neither
 * yet, because the server cannot see a fragment. That case renders as
 * "checking" and is resolved in the browser by ConfirmResetForm.
 */
export default async function ConfirmResetPage() {
  const recoveryPending = Boolean(cookies().get(PASSWORD_RECOVERY_COOKIE)?.value);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <ConfirmResetForm serverReady={recoveryPending && Boolean(user)} />;
}
