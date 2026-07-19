import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { buildFoodLensEntryContext } from '@/lib/conversation-coach/entryContext';
import { getFoodLensScanAction } from '@/app/actions/food-lens';
import { getPrimalPatternProfileById } from '@/lib/food-lens/data';
import { DetectedItemsList } from '@/components/food-lens/DetectedItemsList';
import { MacroBalanceMeter } from '@/components/food-lens/MacroBalanceMeter';
import { MealQualityIndicator } from '@/components/food-lens/MealQualityIndicator';
import { PatternComparisonCard } from '@/components/food-lens/PatternComparisonCard';
import { MealLogActions } from '@/components/food-lens/MealLogActions';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export default async function FoodLensScanPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, detail] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getFoodLensScanAction(params.id),
  ]);
  if (!detail) notFound();

  const { scan, detectedItems, macroEstimate, comparison, mealQuality, captures } = detail;

  const pattern = comparison
    ? await getPrimalPatternProfileById(supabase, comparison.primal_pattern_profile_id)
    : null;

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

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Meal scan
        </h1>
        <p className="mt-1 text-sm text-[#6B7A72]">
          {new Date(scan.created_at).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>

        <div className="mt-6 space-y-5">
          {captures.length === 1 && captures[0]!.signedViewUrl && (
            // A single meal photo (the common case) gets a full-width hero
            // treatment, not a small square grid thumbnail — a 4:3 crop
            // keeps most of a typical phone photo in frame instead of the
            // aggressive center-crop a forced square applies to a taller
            // portrait shot.
            <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black/5">
              <img
                src={captures[0]!.signedViewUrl!}
                alt="Meal capture"
                className="h-full w-full object-cover"
              />
            </div>
          )}

          {captures.length > 1 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {captures.map((capture) => (
                <div
                  key={capture.captureId}
                  className="aspect-square overflow-hidden rounded-2xl bg-black/5"
                >
                  {capture.signedViewUrl && (
                    <img
                      src={capture.signedViewUrl}
                      alt="Meal capture"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {mealQuality && (
            <MealQualityIndicator
              rating={mealQuality.rating}
              explanation={mealQuality.explanation}
            />
          )}

          {scan.status === 'not_configured' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">
                Food Lens isn&apos;t available yet — no vision provider is configured. This scan is
                saved and will be analyzed automatically once one is connected.
              </p>
            </div>
          )}

          {scan.status === 'failed' && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#B45309]">
                {scan.provider_error ?? "This scan couldn't be analyzed."}
              </p>
            </div>
          )}

          {(scan.status === 'analyzing' || scan.status === 'pending') && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">Analyzing your meal…</p>
            </div>
          )}

          {macroEstimate && (
            <div className={`${CARD} p-6`}>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                Macro balance
              </p>
              <MacroBalanceMeter
                protein={{
                  level: macroEstimate.protein_level,
                  confidence: macroEstimate.protein_confidence,
                }}
                carb={{
                  level: macroEstimate.carb_level,
                  confidence: macroEstimate.carb_confidence,
                }}
                fat={{ level: macroEstimate.fat_level, confidence: macroEstimate.fat_confidence }}
              />
            </div>
          )}

          {comparison && pattern ? (
            <PatternComparisonCard
              patternLabel={pattern.pattern_label}
              narrative={comparison.narrative}
              signals={comparison.signals}
              confidence={comparison.confidence}
            />
          ) : macroEstimate ? (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#1B3A2D]">
                Set your Primal Pattern target for a personalized comparison against your own eating
                pattern.
              </p>
              <Link
                href={'/food-lens/pattern' as Route}
                className="mt-3 inline-block rounded-full bg-[#1B3A2D] px-4 py-2 text-xs font-semibold text-white"
              >
                Set my pattern
              </Link>
            </div>
          ) : null}

          {detectedItems.length > 0 && <DetectedItemsList scanId={scan.id} items={detectedItems} />}

          <MealLogActions
            scanId={scan.id}
            hasConfirmedItems={detectedItems.some((i) => i.status === 'confirmed')}
          />
        </div>
      </main>

      <BottomNav isCoach={isCoach} />

      {comparison && (
        <FloatingCoachLauncher
          entryPoint="food_lens"
          entryContext={buildFoodLensEntryContext(
            pattern?.pattern_label ?? null,
            comparison.signals,
            comparison.narrative
          )}
        />
      )}
    </div>
  );
}
