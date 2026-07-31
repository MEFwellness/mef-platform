'use server';

/**
 * THROWAWAY — Protein Phase 1b scouting only. Proves the camera → barcode →
 * Your Move nutrition lookup → protein grams chain works live on a real
 * device before any ledger gets built. Delete this file (and
 * app/coach/protein-scan-test/, components/protein-scan-test/) when the
 * real ledger is built — it should reuse app/actions/food-products.ts'
 * lookupBarcodeAction (the existing, already-shipped Open Food Facts
 * pipeline) rather than this one-off Your Move call.
 */

import { getCachedUser } from '@/lib/supabase/currentUser';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { validateBarcode } from '@/lib/food-products/barcode';

async function requireCoach(): Promise<{ coachId: string } | { error: string }> {
  const user = await getCachedUser();
  if (!user) return { error: 'Not signed in.' };
  const supabase = createClient();
  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) return { error: 'Coach access required.' };
  return { coachId: user.id };
}

type YourMoveFoodResult = {
  id: string;
  name: string;
  displayName?: string | null;
  brand?: string | null;
  barcode?: string | null;
  servingDescription?: string | null;
  servingSize?: number | null;
  protein: number | null;
  calories: number | null;
  source: string;
  imageUrl?: string | null;
};

export type ProteinScanTestResult = {
  status: 'found' | 'not_found' | 'invalid' | 'error';
  barcode?: string;
  product?: {
    name: string;
    brand: string | null;
    servingDescription: string | null;
    proteinGramsPerServing: number | null;
    caloriesPerServing: number | null;
    source: string;
  };
  error?: string;
};

/** Calls Your Move's /foods/barcode/{upc} endpoint directly — a one-off fetch, not the shared lib/your-move/apiClient.ts (that client only covers the exercise/workout/program endpoints; adding food methods there isn't warranted for a page that's getting deleted). */
export async function testYourMoveBarcodeLookupAction(
  rawBarcode: string
): Promise<ProteinScanTestResult> {
  const check = await requireCoach();
  if ('error' in check) return { status: 'error', error: check.error };

  const validation = validateBarcode(rawBarcode);
  if (!validation.valid) {
    return {
      status: 'invalid',
      error: "That doesn't look like a valid UPC-A, UPC-E, EAN-8, or EAN-13 barcode.",
    };
  }

  const apiKey = process.env.YMOVE_API_KEY;
  if (!apiKey) return { status: 'error', error: 'YMOVE_API_KEY is not configured.' };

  try {
    const response = await fetch(
      `https://exercise-api.ymove.app/api/v2/foods/barcode/${encodeURIComponent(validation.normalized)}`,
      { method: 'GET', headers: { 'X-API-Key': apiKey }, cache: 'no-store' }
    );

    if (response.status === 404) {
      return { status: 'not_found', barcode: validation.normalized };
    }
    if (!response.ok) {
      return { status: 'error', error: `Your Move returned ${response.status}` };
    }

    const json = (await response.json()) as { data?: YourMoveFoodResult; error?: string };
    if (!json.data) {
      return { status: 'not_found', barcode: validation.normalized };
    }

    const food = json.data;
    return {
      status: 'found',
      barcode: validation.normalized,
      product: {
        name: food.displayName || food.name,
        brand: food.brand ?? null,
        servingDescription: food.servingDescription ?? null,
        proteinGramsPerServing: food.protein ?? null,
        caloriesPerServing: food.calories ?? null,
        source: food.source,
      },
    };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Lookup failed.',
    };
  }
}
