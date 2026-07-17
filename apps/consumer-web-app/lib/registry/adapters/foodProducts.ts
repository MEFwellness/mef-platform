/**
 * Universal Registry adapter — packaged-food (barcode) analysis. Same shape
 * as lib/registry/adapters/foodLens.ts: reshapes a food_analysis_results
 * row into a registry_entries row with domain: 'nutrition', so barcode
 * scans become visible to the Intelligence Engine and Root with zero
 * changes to either system. No coach-review gate, same reasoning as meal
 * photos — this is member self-education, not a clinical finding.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FoodAnalysisResult } from '@mef/shared-types-contracts';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import type { RegistryEntryDraft } from '../types';

const CODE = 'packaged_food_analysis';

/** Conservative rollup for the registry's single severity column: a member allergen match or a "meaningful" combination finding makes this 'mild' (never higher — a single scan is not a diagnosis); otherwise 'none'. */
function severityFor(result: FoodAnalysisResult): 'none' | 'mild' {
  if (result.member_allergen_matches.length > 0) return 'mild';
  if (result.rules_result.nutrientCombinations.some((f) => f.severity === 'meaningful'))
    return 'mild';
  return 'none';
}

function narrativeFor(result: FoodAnalysisResult, productName: string | null): string {
  return result.coaching_result.supportsYou
    ? `${productName ?? 'Scanned product'}: ${result.coaching_result.supportsYou}`
    : `Scanned ${productName ?? 'a packaged product'}.`;
}

export async function upsertRegistryEntryFromFoodAnalysis(
  supabase: SupabaseClient,
  memberId: string,
  result: FoodAnalysisResult,
  productName: string | null
): Promise<void> {
  const existing = await findActiveRegistryEntry(supabase, memberId, 'nutrition', CODE);
  if (existing && existing.source_record_id === result.id) return;

  const draft: RegistryEntryDraft = {
    entry_kind: 'finding',
    domain: 'nutrition',
    code: CODE,
    label: 'Packaged food scan',
    severity: severityFor(result),
    numeric_value: null,
    unit: null,
    confidence: result.overall_confidence,
    narrative: narrativeFor(result, productName),
    evidence_refs: [{ type: 'food_lens_scan', id: result.scan_id }],
    source_feature: 'food_analysis_result',
    source_record_id: result.id,
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    recorded_at: result.created_at,
  };

  await insertRegistryEntry(supabase, memberId, draft, { supersedesId: existing?.id ?? null });
}
