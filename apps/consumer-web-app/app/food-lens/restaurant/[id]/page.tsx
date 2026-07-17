import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { getRestaurantMealEntryAction } from '@/app/actions/restaurant';
import { getFoodLensScanAction } from '@/app/actions/food-lens';
import type { RestaurantEstimateBasis, RestaurantMealAnalysis } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SOURCE_LABEL: Record<string, string> = {
  search: 'Typed in by you',
  manual_entry: 'Typed in by you',
  menu_photo: 'Photographed menu',
  menu_text: 'Pasted menu text',
  meal_photo: 'Photographed meal',
};

const ESTIMATE_BASIS_BANNER: Record<RestaurantEstimateBasis, { label: string; text: string }> = {
  published_nutrition: {
    label: 'Published nutrition data',
    text: "This reflects the restaurant's own published nutrition information for this item.",
  },
  visual_estimate: {
    label: 'Visual estimate',
    text: "This is a visual estimate Root made from your photo — not the restaurant's own nutrition data.",
  },
  ingredient_estimate: {
    label: 'Estimate from menu description',
    text: "This is an estimate based on the menu description you provided — not the restaurant's own nutrition data.",
  },
  member_entered: {
    label: 'Information you entered',
    text: 'This is based only on the information you entered yourself.',
  },
};

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#6B7A72]">Nothing specific stood out here.</p>
      )}
    </div>
  );
}

function hasAnalysis(
  analysis: RestaurantMealAnalysis | Record<string, never>
): analysis is RestaurantMealAnalysis {
  return 'supportsYou' in analysis;
}

export default async function RestaurantMealEntryResultPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, entry] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getRestaurantMealEntryAction(params.id),
  ]);
  if (!entry) notFound();

  const capturedImageUrl = entry.scan_id
    ? (await getFoodLensScanAction(entry.scan_id))?.captures[0]?.signedViewUrl ?? null
    : null;

  const banner = ESTIMATE_BASIS_BANNER[entry.estimate_basis];
  const analysis = hasAnalysis(entry.analysis) ? entry.analysis : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pl-28 md:pb-16">
        <Link
          href={'/food-lens' as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Food Lens
        </Link>

        <div className="mt-6 space-y-5">
          <div className={`${CARD} overflow-hidden`}>
            {capturedImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={capturedImageUrl}
                alt={entry.menu_item_name ?? entry.restaurant_name}
                className="h-56 w-full object-cover"
              />
            )}
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
                {SOURCE_LABEL[entry.source] ?? entry.source}
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
                {entry.menu_item_name || 'This item'}
              </h1>
              <p className="mt-1 text-sm text-[#6B7A72]">{entry.restaurant_name}</p>
            </div>
          </div>

          <div className={`${CARD} flex items-start gap-3 p-5`}>
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{banner.label}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{banner.text}</p>
            </div>
          </div>

          {entry.raw_menu_text && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                Menu text you provided
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#1B3A2D]">
                {entry.raw_menu_text}
              </p>
            </div>
          )}

          {!analysis && (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">This entry hasn&apos;t been analyzed yet.</p>
            </div>
          )}

          {analysis && (
            <>
              <Section title="Supports you" items={analysis.supportsYou} />
              <Section title="Things to be mindful of" items={analysis.mindfulOf} />
              <Section title="Practical modifications" items={analysis.modifications} />
              <Section title="Useful pairings" items={analysis.pairings} />
              <Section title="Better-fit alternatives" items={analysis.betterFitAlternatives} />

              <div className={`${CARD} p-6`}>
                <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Portion guidance
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[#1B3A2D]">
                  {analysis.portionGuidance ?? 'No specific portion guidance for this entry.'}
                </p>
              </div>

              <p className="px-1 text-xs leading-relaxed text-[#9AA79F]">
                This reflects your own entry and the available menu information — not a medical
                assessment, and not the restaurant's own nutrition facts unless stated above.
              </p>
            </>
          )}

          <Link
            href={'/food-lens/restaurant/new' as Route}
            className="block w-full rounded-full border border-[#1B3A2D]/15 py-3 text-center text-sm font-medium text-[#1B3A2D]"
          >
            Log another restaurant meal
          </Link>
        </div>
      </main>

      <BottomNav isCoach={isCoach} />

      {analysis && (
        <FloatingCoachLauncher
          entryPoint="food_lens"
          entryContext={`Member just logged the restaurant meal "${entry.menu_item_name ?? entry.restaurant_name}" at ${entry.restaurant_name} with Restaurant Intelligence. Root told them: "${analysis.supportsYou[0] ?? ''}"`}
        />
      )}
    </div>
  );
}
