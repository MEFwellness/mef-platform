import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildFoodProductEntryContext } from '@/lib/conversation-coach/entryContext';
import { getProductScanAction } from '@/app/actions/food-products';
import { ProductHeader } from '@/components/food-products/ProductHeader';
import { NutritionFactsPanel } from '@/components/food-products/NutritionFactsPanel';
import { IngredientsPanel } from '@/components/food-products/IngredientsPanel';
import { AllergenAlert } from '@/components/food-products/AllergenAlert';
import { ObservationCard } from '@/components/food-products/ObservationCard';
import { NutrientCombinationsList } from '@/components/food-products/NutrientCombinationsList';
import { CoachingSections } from '@/components/food-products/CoachingSections';
import { AddToFoodLogSheet } from '@/components/food-products/AddToFoodLogSheet';
import { SwapSuggestionsList } from '@/components/food-products/SwapSuggestionsList';
import { generateSwapSuggestions } from '@/lib/food-products/swaps';
import { QuickProductActions } from '@/components/food-products/QuickProductActions';
import { isProductFavorited } from '@/lib/food-products/savedMeals';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const PROCESSING_LABEL: Record<string, string> = {
  minimally_processed: 'Minimally processed',
  lightly_processed: 'Lightly processed',
  moderately_processed: 'Moderately processed',
  highly_processed: 'Highly processed',
};

const FAT_SOURCE_LABEL: Record<string, string> = {
  whole_food: 'Largely whole-food sources',
  processed_or_industrial: 'Largely refined oils',
  mixed: 'Mixed sources',
  unknown: 'Source unclear from available data',
};

export default async function BarcodeScanResultPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, detail] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getProductScanAction(params.id),
  ]);
  if (!detail) notFound();

  const favorited = detail.product ? await isProductFavorited(supabase, user.id, detail.product.id) : false;

  const { scan, barcodeScan, product, nutrients, ingredients, allergens, analysis } = detail;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <Link
          href={'/food-lens' as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Food Lens
        </Link>

        <div className="mt-6 space-y-5">
          {!product && barcodeScan?.lookup_status === 'not_found' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">
                This barcode wasn&apos;t found in our product database.
              </p>
            </div>
          )}

          {!product && barcodeScan?.lookup_status === 'error' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#B45309]">
                {barcodeScan.lookup_error ?? 'This lookup failed.'}
              </p>
            </div>
          )}

          {product && <ProductHeader product={product} />}
          {product && <QuickProductActions productId={product.id} initiallyFavorited={favorited} />}

          {product && !analysis && scan.status === 'analyzing' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">Analyzing this product…</p>
            </div>
          )}

          {product && !analysis && scan.status === 'failed' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#B45309]">This product couldn&apos;t be analyzed.</p>
            </div>
          )}

          {product && (
            <>
              <NutritionFactsPanel nutrients={nutrients} />
              <AllergenAlert
                allergens={allergens}
                memberMatches={analysis?.member_allergen_matches ?? []}
              />
            </>
          )}

          {analysis && (
            <>
              <ObservationCard
                title="Fat quality"
                badge={FAT_SOURCE_LABEL[analysis.rules_result.fatQuality.fatSourceCategory]}
                observations={analysis.rules_result.fatQuality.observations}
              />
              <ObservationCard
                title="Carbohydrate quality"
                observations={analysis.rules_result.carbQuality.observations}
              />
              <ObservationCard
                title="Protein quality"
                observations={analysis.rules_result.proteinQuality.observations}
              />
              <ObservationCard
                title="Ingredient quality"
                observations={analysis.rules_result.ingredientQuality.observations}
              />
              <ObservationCard
                title="Processing context"
                badge={PROCESSING_LABEL[analysis.rules_result.processingContext.label]}
                observations={[analysis.rules_result.processingContext.reason]}
              />
              <NutrientCombinationsList findings={analysis.rules_result.nutrientCombinations} />
              <CoachingSections coaching={analysis.coaching_result} />
              <SwapSuggestionsList suggestions={generateSwapSuggestions(analysis.rules_result)} />
            </>
          )}

          {product && analysis && (
            <AddToFoodLogSheet
              productId={product.id}
              scanId={scan.id}
              servingSizeText={product.serving_size_text}
              caloriesPerServing={nutrients?.calories ?? null}
            />
          )}

          {product && (
            <div className="flex gap-3">
              <Link
                href={'/food-lens/barcode/new' as Route}
                className="flex-1 rounded-full border border-[#1B3A2D]/15 py-3 text-center text-sm font-medium text-[#1B3A2D]"
              >
                Scan another product
              </Link>
            </div>
          )}

          {ingredients && <IngredientsPanel ingredients={ingredients} />}
        </div>
      </main>

      <BottomNav isCoach={isCoach} />

      {analysis && (
        <FloatingCoachLauncher
          entryPoint="food_lens"
          entryContext={buildFoodProductEntryContext(
            product?.name ?? null,
            analysis.coaching_result.supportsYou
          )}
        />
      )}
    </div>
  );
}
