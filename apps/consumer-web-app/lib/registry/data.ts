/**
 * Database access for the Universal Metric & Finding Registry — same shape
 * as lib/intelligence/data.ts: pure functions taking a SupabaseClient, RLS
 * (migration 40) decides who may read/write what. Inserts generate their
 * own id and skip `.select()` after writing, same defensive discipline as
 * insertWellnessInsight/insertFinding (a coach-only, member_visible=false
 * row wouldn't satisfy the inserting session's own SELECT policy on
 * RETURNING).
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
    const { error: supersedeError } = await supabase
      .from('registry_entries')
      .update({ status: 'superseded', superseded_by_id: id, updated_at: now })
      .eq('id', options.supersedesId);
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
