'use server';

import { createClient } from '@/lib/supabase/server';
import { CONSENT_ITEMS, CONSENT_VERSION } from '@/lib/consent/copy';
import type { ActionResult } from './auth';

/**
 * Records all four required consents in one call. Relies entirely on the
 * member_insert_own_consent RLS policy (user_id = auth.uid()) — there is no
 * server-side "trust me, this is the right user" shortcut; if the session
 * user doesn't match, the insert is rejected by Postgres, not by this
 * function's logic.
 */
export async function recordAllConsents(): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not signed in.' };

  const rows = CONSENT_ITEMS.map((item) => ({
    user_id: user.id,
    consent_type: item.type,
    version: CONSENT_VERSION,
    granted_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('consent_records').insert(rows);
  if (error) return { error: error.message };
  return {};
}

/** Used to gate onboarding — a member must have all four before proceeding. */
export async function hasCompletedConsent(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('consent_records')
    .select('consent_type')
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error || !data) return false;

  const grantedTypes = new Set(data.map((r) => r.consent_type));
  return CONSENT_ITEMS.every((item) => grantedTypes.has(item.type));
}
