/**
 * Data access for member_discovery_moments (migration 143) — one row per
 * correlation-engine finding (keyed the same way member_pattern_states
 * itself keys a correlation finding: `correlation::<pairKey>`) that has
 * already been presented to the member as a one-time "I noticed
 * something" discovery. Written only by this presentation layer, never
 * by the correlation engine itself.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function listSurfacedDiscoverySignalKeys(
  supabase: SupabaseClient,
  memberId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('member_discovery_moments')
    .select('signal_key')
    .eq('member_id', memberId);

  if (error || !data) return new Set();
  return new Set(data.map((row) => row.signal_key as string));
}

/** Best-effort: a failure to record "shown" must never break the dashboard render that's already returning the discovery to the member — same "best-effort, never breaks the page" discipline as the rest of this app's presentation-layer writes. */
export async function markDiscoverySurfaced(
  supabase: SupabaseClient,
  memberId: string,
  signalKey: string
): Promise<void> {
  const { error } = await supabase
    .from('member_discovery_moments')
    .upsert({ member_id: memberId, signal_key: signalKey }, { onConflict: 'member_id,signal_key', ignoreDuplicates: true });

  if (error) {
    console.error('markDiscoverySurfaced failed', error);
  }
}
