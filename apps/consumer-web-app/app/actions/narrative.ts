'use server';

import { createClient } from '@/lib/supabase/server';
import type { NarrativeItem, NarrativeCategory } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import {
  listNarrativeItems,
  getNarrativeItem,
  setPinned,
  setProtected,
  setStatus,
  insertNarrativeItem,
  supersedeNarrativeItem,
} from '@/lib/narrative/data';

/** The signed-in member's own narrative — member-visible rows only (RLS-enforced regardless). */
export async function getMyNarrative(): Promise<NarrativeItem[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  return listNarrativeItems(supabase, user.id, { statusFilter: ['active', 'resolved'] });
}

/** A client's full narrative from the coach's side — coach_read_assigned_narrative (migration 29) includes coach-only items the member never sees; an unassigned clientId simply returns nothing. */
export async function getClientNarrative(clientId: string): Promise<NarrativeItem[]> {
  const supabase = createClient();
  return listNarrativeItems(supabase, clientId);
}

export async function pinNarrativeItemAction(
  itemId: string,
  pinned: boolean
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const ok = await setPinned(supabase, itemId, pinned, user.id);
  if (!ok) return { error: 'Could not update this item. You may not be assigned to this client.' };
  return {};
}

export async function protectNarrativeItemAction(
  itemId: string,
  protectedValue: boolean
): Promise<ActionResult> {
  const supabase = createClient();
  const ok = await setProtected(supabase, itemId, protectedValue);
  if (!ok) return { error: 'Could not update this item.' };
  return {};
}

export async function markNarrativeItemOutdatedAction(itemId: string): Promise<ActionResult> {
  const supabase = createClient();
  const ok = await setStatus(supabase, itemId, 'outdated');
  if (!ok) return { error: 'Could not update this item.' };
  return {};
}

/**
 * A coach correcting an inaccurate interpretation (Milestone 2's "Human
 * coach controls"). Never edits the old row in place — inserts a new
 * coach_entered item and supersedes the old one, preserving the full
 * history the way every other narrative update does.
 */
export async function correctNarrativeItemAction(
  clientId: string,
  itemId: string,
  correction: { title: string; summary: string }
): Promise<ActionResult> {
  const trimmedTitle = correction.title.trim();
  const trimmedSummary = correction.summary.trim();
  if (!trimmedTitle || !trimmedSummary) return { error: 'Title and summary are required.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const original = await getNarrativeItem(supabase, itemId);
  if (!original) return { error: 'Original item not found.' };

  const created = await insertNarrativeItem(
    supabase,
    clientId,
    'coach',
    user.id,
    {
      category: original.category as NarrativeCategory,
      title: trimmedTitle,
      summary: trimmedSummary,
      provenance: 'coach_entered',
      confidence: null,
      memberVisible: original.member_visible,
      sourceRefs: [
        { type: 'coach_correction', id: itemId, note: 'Corrects a prior interpretation.' },
      ],
    },
    itemId
  );
  if (!created) return { error: 'Could not save the correction.' };

  const superseded = await supersedeNarrativeItem(supabase, itemId, created.id);
  if (!superseded)
    return { error: 'Correction saved, but the original item could not be marked outdated.' };

  return {};
}

/** A coach adding brand-new context directly (Milestone 2's "add or confirm context"). */
export async function addCoachNarrativeItemAction(
  clientId: string,
  input: { category: NarrativeCategory; title: string; summary: string; memberVisible: boolean }
): Promise<ActionResult> {
  const trimmedTitle = input.title.trim();
  const trimmedSummary = input.summary.trim();
  if (!trimmedTitle || !trimmedSummary) return { error: 'Title and summary are required.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const created = await insertNarrativeItem(supabase, clientId, 'coach', user.id, {
    category: input.category,
    title: trimmedTitle,
    summary: trimmedSummary,
    provenance: 'coach_entered',
    confidence: null,
    memberVisible: input.memberVisible,
    sourceRefs: [],
  });
  if (!created) return { error: 'Could not save. You may not be assigned to this client.' };

  return {};
}
