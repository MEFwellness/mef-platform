/**
 * The one question every Health Appraisal surface asks: what is this
 * member's state right now. Reads only; nothing here writes, including on
 * the render that shows the shelf card.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveHaqState, type HaqState } from './access';
import {
  fetchLatestCompletedHaqInstance,
  fetchOpenHaqInstance,
  fetchPendingHaqAssignment,
  haqRuntimeDefinitionId,
} from './data';

export async function buildHaqState(supabase: SupabaseClient, memberId: string): Promise<HaqState | null> {
  const [assignment, definitionId] = await Promise.all([
    fetchPendingHaqAssignment(supabase, memberId),
    haqRuntimeDefinitionId(supabase),
  ]);
  if (!definitionId) return null;

  const [open, completed] = await Promise.all([
    fetchOpenHaqInstance(supabase, memberId, definitionId),
    fetchLatestCompletedHaqInstance(supabase, memberId, definitionId),
  ]);

  return resolveHaqState({ assignment, open, completed });
}
