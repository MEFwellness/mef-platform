/**
 * Universal Registry adapter — Food Lens.
 *
 * Reshapes a food_lens_pattern_comparisons row into a registry_entries row
 * with domain: 'nutrition' — the slot migration 40 already reserved for
 * exactly this. No coach-review gate exists for Food Lens (doc 3 §3.2), so
 * unlike lib/registry/adapters/bodyAssessment.ts (which only registers
 * coach-confirmed findings), every comparison is registered as soon as it's
 * written — the member's own confirm/correct loop is the only gate this
 * feature has, same as lib/registry/adapters/wearables.ts's passive sync.
 *
 * This is the single integration point that makes Food Lens findings
 * visible to the Intelligence Engine, Intelligence Core, and Root's
 * Conversation Coach with zero changes to any of those three systems —
 * see docs/food-lens/08-coach-integration.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FoodLensComparisonSignal,
  FoodLensPatternComparison,
} from '@mef/shared-types-contracts';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import type { RegistryEntryDraft } from '../types';

const CODE = 'meal_pattern_match';

/** A conservative rollup for the registry's single severity column: any 'heavy'/'light' dimension makes the entry 'mild' (worth noticing, never alarming for a single meal); all three 'match' is 'none'. Food Lens never has enough signal for 'moderate'/'significant' from one meal. */
function severityFor(signals: FoodLensComparisonSignal[]): 'none' | 'mild' {
  return signals.some((s) => s.direction !== 'match') ? 'mild' : 'none';
}

export async function upsertRegistryEntryFromFoodLensComparison(
  supabase: SupabaseClient,
  memberId: string,
  comparison: FoodLensPatternComparison
): Promise<void> {
  const existing = await findActiveRegistryEntry(supabase, memberId, 'nutrition', CODE);
  if (existing && existing.source_record_id === comparison.id) return;

  const draft: RegistryEntryDraft = {
    entry_kind: 'finding',
    domain: 'nutrition',
    code: CODE,
    label: 'Meal vs. Primal Pattern match',
    severity: severityFor(comparison.signals),
    numeric_value: null,
    unit: null,
    confidence: comparison.confidence,
    narrative: comparison.narrative,
    evidence_refs: [{ type: 'food_lens_scan', id: comparison.scan_id }],
    source_feature: 'food_lens_pattern_comparison',
    source_record_id: comparison.id,
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    recorded_at: comparison.created_at,
  };

  await insertRegistryEntry(supabase, memberId, draft, { supersedesId: existing?.id ?? null });
}
