/**
 * Database access for the Member Health Narrative — mirrors lib/ai/data.ts
 * and lib/safety/data.ts's shape: pure functions taking a SupabaseClient,
 * RLS (migration 29) decides who may read/write what.
 *
 * Inserts generate their own id and skip `.select()` after writing —
 * Postgres RLS filters `INSERT ... RETURNING` through the table's SELECT
 * policies, and the inserting session (member or coach) isn't always
 * guaranteed a matching SELECT policy for every row shape it's allowed to
 * write (this exact class of bug was caught by
 * tests/safety-integration.test.ts in Milestone 1 — see
 * lib/safety/data.ts's insertReviewQueueEntry for the original writeup).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  NarrativeItem,
  NarrativeCategory,
  NarrativeStatus,
  NarrativeActorType,
} from '@mef/shared-types-contracts';
import type { NarrativeItemDraft } from './types';

export async function insertNarrativeItem(
  supabase: SupabaseClient,
  memberId: string,
  actorType: NarrativeActorType,
  actorId: string | null,
  draft: NarrativeItemDraft,
  supersedesId: string | null = null
): Promise<NarrativeItem | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase.from('narrative_items').insert({
    id,
    member_id: memberId,
    category: draft.category,
    title: draft.title,
    summary: draft.summary,
    provenance: draft.provenance,
    confidence: draft.confidence,
    status: 'active',
    is_pinned: false,
    coach_protected: false,
    member_visible: draft.memberVisible,
    source_refs: draft.sourceRefs,
    supersedes_id: supersedesId,
    created_by_actor_type: actorType,
    created_by_actor_id: actorId,
  });

  if (error) {
    console.error('insertNarrativeItem failed', error);
    return null;
  }

  return {
    id,
    member_id: memberId,
    category: draft.category,
    title: draft.title,
    summary: draft.summary,
    provenance: draft.provenance,
    confidence: draft.confidence,
    status: 'active',
    is_pinned: false,
    pinned_by: null,
    pinned_at: null,
    coach_protected: false,
    member_visible: draft.memberVisible,
    source_refs: draft.sourceRefs,
    supersedes_id: supersedesId,
    superseded_by_id: null,
    created_by_actor_type: actorType,
    created_by_actor_id: actorId,
    valid_from: now,
    valid_until: null,
    created_at: now,
    updated_at: now,
  };
}

/** Marks an old item outdated and links it forward to whatever replaced it — the supersede chain IS the audit trail (see migration 29's header comment). */
export async function supersedeNarrativeItem(
  supabase: SupabaseClient,
  oldItemId: string,
  newItemId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('narrative_items')
    .update({
      status: 'outdated',
      superseded_by_id: newItemId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', oldItemId);

  if (error) {
    console.error('supersedeNarrativeItem failed', error);
    return false;
  }
  return true;
}

/** The current active item for a (member, category, title) triple, if any — the dedup key the update service checks before creating a duplicate. */
export async function findActiveItem(
  supabase: SupabaseClient,
  memberId: string,
  category: NarrativeCategory,
  title: string
): Promise<NarrativeItem | null> {
  const { data, error } = await supabase
    .from('narrative_items')
    .select('*')
    .eq('member_id', memberId)
    .eq('category', category)
    .eq('title', title)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('findActiveItem failed', error);
    return null;
  }
  return data as NarrativeItem | null;
}

/** Every currently-active item in one category — used by the update service to decide whether a changed fact (e.g. restricted topics changing) should supersede an old one rather than merely sit alongside it. */
export async function findActiveItemsByCategory(
  supabase: SupabaseClient,
  memberId: string,
  category: NarrativeCategory
): Promise<NarrativeItem[]> {
  const { data, error } = await supabase
    .from('narrative_items')
    .select('*')
    .eq('member_id', memberId)
    .eq('category', category)
    .eq('status', 'active');

  if (error) {
    console.error('findActiveItemsByCategory failed', error);
    return [];
  }
  return data as NarrativeItem[];
}

export async function listNarrativeItems(
  supabase: SupabaseClient,
  memberId: string,
  options: { statusFilter?: NarrativeStatus[] } = {}
): Promise<NarrativeItem[]> {
  let query = supabase
    .from('narrative_items')
    .select('*')
    .eq('member_id', memberId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (options.statusFilter && options.statusFilter.length > 0) {
    query = query.in('status', options.statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listNarrativeItems failed', error);
    return [];
  }
  return data as NarrativeItem[];
}

export async function getNarrativeItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<NarrativeItem | null> {
  const { data, error } = await supabase
    .from('narrative_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (error) {
    console.error('getNarrativeItem failed', error);
    return null;
  }
  return data as NarrativeItem | null;
}

export async function setPinned(
  supabase: SupabaseClient,
  itemId: string,
  pinned: boolean,
  pinnedBy: string | null
): Promise<boolean> {
  const { error } = await supabase
    .from('narrative_items')
    .update({
      is_pinned: pinned,
      pinned_by: pinned ? pinnedBy : null,
      pinned_at: pinned ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);

  if (error) {
    console.error('setPinned failed', error);
    return false;
  }
  return true;
}

export async function setProtected(
  supabase: SupabaseClient,
  itemId: string,
  protectedValue: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('narrative_items')
    .update({ coach_protected: protectedValue, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) {
    console.error('setProtected failed', error);
    return false;
  }
  return true;
}

export async function setStatus(
  supabase: SupabaseClient,
  itemId: string,
  status: NarrativeStatus
): Promise<boolean> {
  const { error } = await supabase
    .from('narrative_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', itemId);

  if (error) {
    console.error('setStatus failed', error);
    return false;
  }
  return true;
}
