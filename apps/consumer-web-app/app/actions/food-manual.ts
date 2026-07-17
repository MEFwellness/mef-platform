'use server';

/**
 * MEF Food Lens — manual entry (Part 3's fifth entry option: "Add a meal or
 * food yourself"). Creates a minimal food_products row (data_source =
 * 'mef_verified', barcode null) from whatever the member actually typed —
 * any nutrient field they don't know is simply left blank/null, never
 * guessed — then runs it through the exact same rules-engine/coaching
 * pipeline every other product does (lib/food-products/analyze.ts) via
 * food_lens_scans.linked_product_id (migration 60, scan_type =
 * 'manual_entry'). No separate "manual result" rendering path.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import type { DataCompleteness } from '@mef/shared-types-contracts';
import { insertFoodLensScan } from '@/lib/food-lens/data';
import { insertVerifiedFoodProductFromLabelScan } from '@/lib/food-products/data';
import { runProductAnalysisForScan } from '@/lib/food-products/analyze';

async function requireMember(): Promise<{ supabase: ReturnType<typeof createClient>; userId: string } | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function memberLocalDate(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
  const timezone = data?.timezone ?? 'America/New_York';
  return resolveLocalDate(new Date(new Date().toLocaleString('en-US', { timeZone: timezone })), false);
}

export type CreateManualFoodEntryInput = {
  name: string;
  brand?: string | null;
  servingSizeText?: string | null;
  calories?: number | null;
  proteinG?: number | null;
  totalCarbohydrateG?: number | null;
  fiberG?: number | null;
  totalSugarG?: number | null;
  addedSugarG?: number | null;
  totalFatG?: number | null;
  saturatedFatG?: number | null;
  sodiumMg?: number | null;
  ingredientsText?: string | null;
};

const TRACKED_FIELDS = [
  'calories',
  'proteinG',
  'totalCarbohydrateG',
  'fiberG',
  'totalSugarG',
  'totalFatG',
  'saturatedFatG',
  'sodiumMg',
] as const;

function computeManualDataCompleteness(input: CreateManualFoodEntryInput): DataCompleteness {
  const present = TRACKED_FIELDS.filter((f) => input[f] !== undefined && input[f] !== null).length;
  const ratio = present / TRACKED_FIELDS.length;
  if (ratio >= 0.9) return 'complete';
  if (ratio >= 0.3) return 'partial';
  return 'minimal';
}

export async function createManualFoodEntryAction(
  input: CreateManualFoodEntryInput
): Promise<ActionResult & { scanId?: string }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  if (!input.name || input.name.trim().length === 0) {
    return { error: 'Give this food a name.' };
  }

  const dataCompleteness = computeManualDataCompleteness(input);

  const product = await insertVerifiedFoodProductFromLabelScan(supabase, {
    productName: input.name.trim(),
    brand: input.brand ?? null,
    servingSizeText: input.servingSizeText ?? null,
    nutrients: {
      calories: input.calories ?? null,
      proteinG: input.proteinG ?? null,
      totalCarbohydrateG: input.totalCarbohydrateG ?? null,
      fiberG: input.fiberG ?? null,
      totalSugarG: input.totalSugarG ?? null,
      addedSugarG: input.addedSugarG ?? null,
      totalFatG: input.totalFatG ?? null,
      saturatedFatG: input.saturatedFatG ?? null,
      monounsaturatedFatG: null,
      polyunsaturatedFatG: null,
      transFatG: null,
      sodiumMg: input.sodiumMg ?? null,
      potassiumMg: null,
    },
    ingredientsText: input.ingredientsText ?? null,
    allergensText: null,
    dataCompleteness,
  });
  if (!product) return { error: 'Could not save this food.' };

  const scan = await insertFoodLensScan(supabase, userId, 'manual_entry', null, product.product.id);
  if (!scan) return { error: 'Could not create this entry.' };

  const localDate = await memberLocalDate(supabase, userId);
  const result = await runProductAnalysisForScan(supabase, userId, localDate, scan.id, product.product.id);
  if (result.status !== 'analyzed') return { error: result.error ?? 'Could not analyze this food.' };

  return { scanId: scan.id };
}
