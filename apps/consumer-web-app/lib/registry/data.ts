/**
 * Database access for the Universal Metric & Finding Registry — same shape
 * as lib/intelligence/data.ts: pure functions taking a SupabaseClient, RLS
 * (migration 40) decides who may read/write what. Inserts generate their
 * own id and skip `.select()` after writing, same defensive discipline as
 * insertWellnessInsight/insertFinding (a coach-only, member_visible=false
 * row wouldn't satisfy the inserting session's own SELECT policy on
 * RETURNING).
 *
 * The supersede step goes through the supersede_registry_entry RPC
 * (migration 84), not a direct `.update()` — a real, previously-latent bug
 * that migration's own comment documents in full: marking a row
 * status='superseded' moves it outside member_read_own_registry_entries's
 * `status = 'active'` SELECT policy, and Postgres's row-security
 * machinery requires an UPDATE's resulting row to still satisfy the
 * table's SELECT policy for the executing role, regardless of how
 * permissive the UPDATE policy itself is. The RPC bakes the same
 * authorization check into a SECURITY DEFINER function body instead.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { RegistryEntry, RegistryEntryStatus } from '@mef/shared-types-contracts';
import type { RegistryEntryDraft } from './types';

export async function insertRegistryEntry(
  supabase: SupabaseClient,
  memberId: string,
  draft: RegistryEntryDraft,
  options: { supersedesId?: string | null } = {}
): Promise<RegistryEntry | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const row = {
    id,
    member_id: memberId,
    entry_kind: draft.entry_kind,
    domain: draft.domain,
    code: draft.code,
    label: draft.label,
    severity: draft.severity,
    numeric_value: draft.numeric_value,
    unit: draft.unit,
    confidence: draft.confidence,
    narrative: draft.narrative,
    evidence_refs: draft.evidence_refs,
    source_feature: draft.source_feature,
    source_record_id: draft.source_record_id,
    status: 'active' as const,
    trend_status: draft.trend_status,
    member_visible: draft.member_visible,
    coach_context: draft.coach_context,
    coach_reviewed_by: draft.coach_reviewed_by,
    coach_reviewed_at: draft.coach_reviewed_at,
    supersedes_id: options.supersedesId ?? null,
    recorded_at: draft.recorded_at,
  };

  const { error } = await supabase.from('registry_entries').insert(row);
  if (error) {
    console.error('insertRegistryEntry failed', error);
    return null;
  }

  if (options.supersedesId) {
    const { error: supersedeError } = await supabase.rpc('supersede_registry_entry', {
      p_id: options.supersedesId,
      p_superseded_by_id: id,
    });
    if (supersedeError) console.error('insertRegistryEntry supersede failed', supersedeError);
  }

  return {
    ...row,
    superseded_by_id: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * The current active row for a (member, domain, code) triple, if any — the
 * dedup key an adapter checks before deciding whether to insert a fresh
 * entry or supersede the old one. Goes through the find_active_registry_entry
 * RPC (migration 40) rather than a direct table SELECT for the same reason
 * findActiveInsightByPatternKey does: this lookup is internal bookkeeping
 * that must see a coach-only prior row regardless of member_visible.
 */
export async function findActiveRegistryEntry(
  supabase: SupabaseClient,
  memberId: string,
  domain: string,
  code: string
): Promise<RegistryEntry | null> {
  const { data, error } = await supabase
    .rpc('find_active_registry_entry', { p_member: memberId, p_domain: domain, p_code: code })
    .maybeSingle();

  if (error) {
    console.error('findActiveRegistryEntry failed', error);
    return null;
  }
  return data as RegistryEntry | null;
}

export async function listRegistryEntriesForMember(
  supabase: SupabaseClient,
  memberId: string,
  options: { statusFilter?: RegistryEntryStatus[] } = {}
): Promise<RegistryEntry[]> {
  let query = supabase
    .from('registry_entries')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (options.statusFilter && options.statusFilter.length > 0) {
    query = query.in('status', options.statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listRegistryEntriesForMember failed', error);
    return [];
  }
  return data as RegistryEntry[];
}

/**
 * Domain- and date-ranged variant of listRegistryEntriesForMember. Every
 * current consumer of that function pulls the member's whole active set
 * and filters in memory, which is fine at today's registry volume but
 * doesn't scale to a consumer that only cares about one domain over a
 * rolling window — e.g. a future Coaching Intelligence Engine source
 * provider (lib/coaching-insights/sources/) reading domain='wearable' or
 * domain='sleep' entries for the last N days once those domains have real
 * producers. Filters on `recorded_at` (when the underlying event actually
 * happened), not `created_at` (when the row was written), since a
 * consumer reasoning about "what happened between these dates" needs the
 * former.
 */
export async function listRegistryEntriesForMemberInRange(
  supabase: SupabaseClient,
  memberId: string,
  options: {
    domains?: RegistryEntry['domain'][];
    sinceLocalDate?: string;
    untilLocalDate?: string;
    statusFilter?: RegistryEntryStatus[];
  } = {}
): Promise<RegistryEntry[]> {
  let query = supabase
    .from('registry_entries')
    .select('*')
    .eq('member_id', memberId)
    .order('recorded_at', { ascending: false });

  if (options.domains && options.domains.length > 0) {
    query = query.in('domain', options.domains);
  }
  if (options.sinceLocalDate) {
    query = query.gte('recorded_at', options.sinceLocalDate);
  }
  if (options.untilLocalDate) {
    query = query.lte('recorded_at', options.untilLocalDate);
  }
  if (options.statusFilter && options.statusFilter.length > 0) {
    query = query.in('status', options.statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listRegistryEntriesForMemberInRange failed', error);
    return [];
  }
  return data as RegistryEntry[];
}
