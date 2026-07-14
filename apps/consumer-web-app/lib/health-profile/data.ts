/**
 * Read-side database access for the persisted Longitudinal Health Profile —
 * same shape as every other data.ts in this codebase. The write side
 * (upsert_member_health_profile RPC) lives in orchestration.ts; this file
 * exists purely so app/actions/health-profile.ts has something to call.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberHealthProfileRow } from '@mef/shared-types-contracts';

export async function getMemberHealthProfile(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberHealthProfileRow | null> {
  const { data, error } = await supabase
    .from('member_health_profiles')
    .select('*')
    .eq('member_id', memberId)
    .maybeSingle();

  if (error) {
    console.error('getMemberHealthProfile failed', error);
    return null;
  }
  return data as MemberHealthProfileRow | null;
}
