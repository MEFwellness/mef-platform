/**
 * The Visibility Layer — database access.
 *
 * Pure functions taking a SupabaseClient. RLS decides whose rows anyone
 * may read or write, same shape as every other data.ts in this codebase.
 *
 * Nothing here decides anything. The decisions are in resolve.ts, which
 * has no I/O at all.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { StoredVisibility } from './resolve';
import type { FeatureKey, VisibilitySource, VisibilityState } from './types';

type Row = {
  feature_key: string;
  state: string;
  source: string;
  rule_kind: string | null;
  reason: string | null;
  revealed_at: string | null;
  acknowledged_at: string | null;
};

function toStored(row: Row): StoredVisibility {
  return {
    featureKey: row.feature_key,
    state: row.state as VisibilityState,
    source: row.source as VisibilitySource,
    ruleKind: row.rule_kind,
    reason: row.reason,
    revealedAt: row.revealed_at,
    acknowledgedAt: row.acknowledged_at,
  };
}

/**
 * Every stored decision for one member. An unreadable table resolves to an
 * empty map, which is the safe direction: the layer then decides from the
 * rules alone, and grandfathering (which is recomputed from her real rows,
 * never from this table) still protects everything she has touched.
 */
export async function fetchStoredVisibility(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<FeatureKey, StoredVisibility>> {
  const { data, error } = await supabase
    .from('member_feature_visibility')
    .select('feature_key, state, source, rule_kind, reason, revealed_at, acknowledged_at')
    .eq('member_id', memberId);

  if (error) {
    console.error('fetchStoredVisibility failed', error);
    return new Map();
  }

  return new Map((data ?? []).map((row) => [row.feature_key, toStored(row as Row)] as const));
}

export type RevealToRecord = {
  featureKey: FeatureKey;
  ruleKind: string | null;
  reason: string;
  /** True when there is a plain sentence still owed to her. */
  needsSentence: boolean;
  source: VisibilitySource;
};

/**
 * Writes newly revealed features, so "revealed stays revealed" is a stored
 * fact rather than an opinion a render forms about today's data.
 *
 * `on conflict do nothing`: two page loads racing on the same first reveal
 * must not overwrite each other, and a row that already exists is already
 * the answer. Best effort throughout, because the caller is a page render
 * the member is waiting on and a failed write only means the reveal is
 * recomputed next time.
 */
export async function recordReveals(
  supabase: SupabaseClient,
  memberId: string,
  reveals: RevealToRecord[]
): Promise<void> {
  if (reveals.length === 0) return;

  const now = new Date().toISOString();
  const rows = reveals.map((reveal) => ({
    member_id: memberId,
    feature_key: reveal.featureKey,
    state: 'revealed',
    source: reveal.source,
    rule_kind: reveal.ruleKind,
    reason: reveal.reason,
    revealed_at: now,
    // A feature with no sentence to say has nothing to acknowledge, so it
    // is marked seen on the way in rather than sitting forever in the
    // "not yet told" index.
    acknowledged_at: reveal.needsSentence ? null : now,
  }));

  const { error } = await supabase
    .from('member_feature_visibility')
    .upsert(rows, { onConflict: 'member_id,feature_key', ignoreDuplicates: true });

  if (error) console.error('recordReveals failed', error);
}

/** The member has now been shown the sentence. Said once, not every morning. */
export async function acknowledgeReveals(
  supabase: SupabaseClient,
  memberId: string,
  featureKeys: FeatureKey[]
): Promise<void> {
  if (featureKeys.length === 0) return;

  const { error } = await supabase
    .from('member_feature_visibility')
    .update({ acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .in('feature_key', featureKeys)
    .is('acknowledged_at', null);

  if (error) console.error('acknowledgeReveals failed', error);
}

/**
 * A coach or administrator overriding by hand. Goes through
 * set_member_feature_visibility() (migration 167) rather than writing the
 * table directly, because a coach has no write policy on another member's
 * row and must not be given one: row level security can say who may write
 * a row, not which columns, so a coach update policy would also let a
 * coach forge `source = 'member'`.
 */
export async function setFeatureVisibilityAsCoach(
  supabase: SupabaseClient,
  memberId: string,
  featureKey: FeatureKey,
  state: VisibilityState,
  reason: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_member_feature_visibility', {
    p_member: memberId,
    p_feature_key: featureKey,
    p_state: state,
    p_reason: reason,
  });

  if (error) {
    console.error('setFeatureVisibilityAsCoach failed', error);
    return { error: 'Could not save that. Please try again.' };
  }
  return { error: null };
}

/**
 * The member turning something off for herself. Her own row, her own
 * session.
 *
 * Refuses when a coach has already decided this one by hand. Her RLS
 * update policy covers the whole row, so without this check a member could
 * overwrite `source = 'coach'` with `source = 'member'` and quietly undo a
 * coach's override, which rule 4 says wins.
 */
export async function hideFeatureAsMember(
  supabase: SupabaseClient,
  memberId: string,
  featureKey: FeatureKey
): Promise<{ error: string | null }> {
  const { data: existing } = await supabase
    .from('member_feature_visibility')
    .select('source')
    .eq('member_id', memberId)
    .eq('feature_key', featureKey)
    .maybeSingle();

  if ((existing as { source: string } | null)?.source === 'coach') {
    return { error: 'Your coach set this one up for you, so ask them to change it.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('member_feature_visibility').upsert(
    {
      member_id: memberId,
      feature_key: featureKey,
      state: 'hidden',
      source: 'member',
      reason: 'She turned this off herself.',
      hidden_at: now,
      acknowledged_at: now,
      updated_at: now,
    },
    { onConflict: 'member_id,feature_key' }
  );

  if (error) {
    console.error('hideFeatureAsMember failed', error);
    return { error: 'Could not save that. Please try again.' };
  }
  return { error: null };
}
