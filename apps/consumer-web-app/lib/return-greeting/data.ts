/**
 * Data access for member_return_greetings (migration 143). One row per
 * gap episode a member has already been greeted for, keyed on
 * gap_start_local_date (her last real check-in date before the gap) so
 * the same gap can never earn the greeting twice, while a later, genuinely
 * new gap (a different gap_start_local_date) earns its own fresh one.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Atomically claims this gap episode's one-time greeting: `ignoreDuplicates`
 * maps to `insert ... on conflict do nothing`, so under a concurrent
 * double-request only one caller ever gets `true` back, regardless of
 * which process's insert the database actually keeps. Returns `false` on
 * any error (fail closed — never show a greeting we can't confirm is new).
 */
export async function tryMarkReturnGreetingShown(
  supabase: SupabaseClient,
  memberId: string,
  gapStartLocalDate: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_return_greetings')
    .upsert(
      { member_id: memberId, gap_start_local_date: gapStartLocalDate },
      { onConflict: 'member_id,gap_start_local_date', ignoreDuplicates: true }
    )
    .select('member_id');

  if (error) {
    console.error('tryMarkReturnGreetingShown failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
