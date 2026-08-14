/**
 * Reading one account's entitlement state.
 *
 * One read, of the member_access_facts view (migration 159), which joins
 * the subscription row to profiles.is_test so the two facts the lock
 * decision needs arrive together rather than in two round trips. The view
 * is security_invoker, so this read is governed by the same RLS policies as
 * the underlying tables: a member sees their own row and nothing else.
 *
 * Never throws. A failed read resolves to "no subscription", which
 * decideMemberAccess treats as full access. See lib/membership/access.ts's
 * header for why that direction and not the other.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { subscriptionFromRow } from './access';
import type { MemberAccessFacts } from './types';

const FACT_COLUMNS =
  'member_id, tier, source, status, full_access, trial_started_at, trial_ends_at, is_test';

export async function fetchMemberAccessFacts(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberAccessFacts> {
  try {
    const { data, error } = await supabase
      .from('member_access_facts')
      .select(FACT_COLUMNS)
      .eq('member_id', memberId)
      .maybeSingle();

    if (error || !data) return { subscription: null, isTest: false };

    return {
      subscription: subscriptionFromRow(data),
      isTest: Boolean(data.is_test),
    };
  } catch (caught) {
    console.error('fetchMemberAccessFacts failed', caught);
    return { subscription: null, isTest: false };
  }
}
