'use server';

/**
 * Restaurant Intelligence (Food Lens Part 8, "first useful version") —
 * server actions. Same conventions as app/actions/food-products.ts and
 * app/actions/food-lens.ts: a session-scoped Supabase client, RLS
 * (migration 60) as the real authorization boundary, `{ error }`-shaped
 * results for mutations.
 *
 * No external restaurant/menu API integration in this version (product
 * decision, see docs/food-lens README and the migration 60 header) —
 * "search for a restaurant" is free-text entry, not a fragile scraping
 * dependency. A photographed menu or a photographed restaurant meal both
 * reuse the existing Food Lens meal-photo scan machinery exactly
 * (startFoodLensScanAction('meal_photo') + the same capture upload/record/
 * analyze flow from app/actions/food-lens.ts) — this file never
 * duplicates that pipeline, only stores the resulting scan_id.
 */

import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from './auth';
import { resolveLocalDate } from './checkin';
import type {
  RestaurantEntrySource,
  RestaurantEstimateBasis,
  RestaurantMealEntry,
} from '@mef/shared-types-contracts';
import {
  getRestaurantMealEntry,
  insertRestaurantMealEntry,
  listMyRestaurantMealEntries,
  updateRestaurantMealEntryAnalysis,
} from '@/lib/restaurant/data';
import { analyzeMenuItemHeuristics } from '@/lib/restaurant/menuItemHeuristics';
import { generateRestaurantCoachingNarrative } from '@/lib/restaurant/coachingNarrative';
import { getFoodLensScan, listCurrentFoodLensDetectedItems } from '@/lib/food-lens/data';
import { getMemberFoodPreferences } from '@/lib/food-products/data';

async function requireMember(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

async function memberLocalDate(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
  const timezone = data?.timezone ?? 'America/New_York';
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

const VALID_SOURCES: RestaurantEntrySource[] = [
  'search',
  'manual_entry',
  'menu_photo',
  'menu_text',
  'meal_photo',
];

export type CreateRestaurantMealEntryInput = {
  restaurantName: string;
  menuItemName?: string | null;
  source: RestaurantEntrySource;
  rawMenuText?: string | null;
  scanId?: string | null;
};

export async function createRestaurantMealEntryAction(
  input: CreateRestaurantMealEntryInput
): Promise<ActionResult & { entry?: RestaurantMealEntry }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const restaurantName = input.restaurantName.trim();
  if (!restaurantName) return { error: 'Please enter a restaurant name.' };
  if (!VALID_SOURCES.includes(input.source)) return { error: 'Invalid entry source.' };

  if (input.source === 'menu_photo' || input.source === 'meal_photo') {
    if (!input.scanId) return { error: 'A photo capture is required for this entry type.' };
    const scan = await getFoodLensScan(supabase, input.scanId);
    if (!scan || scan.member_id !== userId) return { error: 'Scan not found.' };
  }

  if (input.source === 'menu_text' && !input.rawMenuText?.trim()) {
    return { error: 'Please paste the menu text.' };
  }

  const entry = await insertRestaurantMealEntry(supabase, {
    memberId: userId,
    restaurantName,
    menuItemName: input.menuItemName?.trim() || null,
    source: input.source,
    scanId: input.scanId ?? null,
    rawMenuText: input.rawMenuText?.trim() || null,
  });
  if (!entry) return { error: 'Could not save this entry.' };
  return { entry };
}

/**
 * Runs the deterministic menu-item heuristics, then Root's coaching layer,
 * over one restaurant meal entry, and persists both the resulting
 * `analysis` and the `estimate_basis` that tells the member how much to
 * trust it (product requirement §8 — never presented as if it were
 * lab-verified data).
 */
export async function analyzeRestaurantMealEntryAction(
  entryId: string
): Promise<ActionResult & { entry?: RestaurantMealEntry }> {
  const ctx = await requireMember();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, userId } = ctx;

  const entry = await getRestaurantMealEntry(supabase, entryId);
  if (!entry || entry.member_id !== userId) return { error: 'Entry not found.' };

  try {
    let visualEstimateLabels: string[] = [];
    if (entry.scan_id) {
      const items = await listCurrentFoodLensDetectedItems(supabase, entry.scan_id);
      // Food Lens inserts freshly detected items as 'pending_confirmation',
      // only becoming 'confirmed' after a member reviews them — the member
      // hasn't had that chance yet in this flow (capture -> analyze scan ->
      // analyze restaurant entry happen back-to-back), so both statuses
      // count as a usable visual signal here. Rejected items are real
      // corrections and are excluded.
      visualEstimateLabels = items
        .filter((item) => item.status !== 'rejected' && item.status !== 'superseded')
        .map((item) => item.label);
    }

    const heuristics = analyzeMenuItemHeuristics({
      menuItemName: entry.menu_item_name,
      description: entry.raw_menu_text,
      rawMenuText: entry.raw_menu_text,
      visualEstimateLabels,
    });

    const estimateBasis: RestaurantEstimateBasis =
      visualEstimateLabels.length > 0
        ? 'visual_estimate'
        : (entry.raw_menu_text?.trim().length ?? 0) > 0
          ? 'ingredient_estimate'
          : 'member_entered';

    const [localDate, preferences] = await Promise.all([
      memberLocalDate(supabase, userId),
      getMemberFoodPreferences(supabase, userId),
    ]);

    const { result } = await generateRestaurantCoachingNarrative({
      supabase,
      memberId: userId,
      localDate,
      restaurantName: entry.restaurant_name,
      menuItemName: entry.menu_item_name,
      estimateBasis,
      heuristics,
      dietaryPattern: preferences?.dietary_pattern ?? null,
    });

    const updated = await updateRestaurantMealEntryAnalysis(supabase, entryId, {
      analysis: result,
      estimateBasis,
    });
    if (!updated) return { error: 'Could not save this analysis.' };
    return { entry: updated };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed.';
    console.error(`analyzeRestaurantMealEntryAction failed for entry ${entryId}`, err);
    return { error: message };
  }
}

export async function getRestaurantMealEntryAction(
  id: string
): Promise<RestaurantMealEntry | null> {
  const ctx = await requireMember();
  if (!ctx) return null;
  const entry = await getRestaurantMealEntry(ctx.supabase, id);
  if (!entry || entry.member_id !== ctx.userId) return null;
  return entry;
}

export async function listMyRestaurantMealEntriesAction(): Promise<RestaurantMealEntry[]> {
  const ctx = await requireMember();
  if (!ctx) return [];
  return listMyRestaurantMealEntries(ctx.supabase, ctx.userId);
}
