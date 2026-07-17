import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { UtensilsCrossed, ChevronRight, Settings2 } from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import {
  listMyFoodLensScansAction,
  getActivePrimalPatternProfileAction,
} from '@/app/actions/food-lens';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  analyzing: 'Analyzing',
  analyzed: 'Analyzed',
  not_configured: 'Awaiting Food Lens setup',
  failed: 'Couldn’t analyze',
  member_reviewed: 'Reviewed',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default async function FoodLensPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, scans, pattern] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    listMyFoodLensScansAction(),
    getActivePrimalPatternProfileAction(),
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <UtensilsCrossed className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Food Lens</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Meal coaching, not counting
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          Photograph a meal and Root will let you know how it compares to your own eating pattern —
          no calories, no gram weights, ever.
        </p>

        <Link
          href={'/food-lens/new' as Route}
          className="mt-6 flex items-center justify-center rounded-full bg-[#1B3A2D] py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_-6px_rgba(27,58,45,0.35)]"
        >
          Scan a meal
        </Link>

        <Link
          href={'/food-lens/pattern' as Route}
          className={`${CARD} mt-4 flex items-center justify-between p-4`}
        >
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-4 w-4 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[#1B3A2D]">
                {pattern ? pattern.pattern_label : 'Set your Primal Pattern target'}
              </p>
              <p className="mt-0.5 text-xs text-[#6B7A72]">
                {pattern
                  ? 'Update your protein/carb/fat emphasis'
                  : 'Needed for a personalized comparison'}
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <section className="mt-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
            Your recent scans
          </p>
          {scans.length === 0 ? (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">
                No scans yet — photograph a meal above to get your first read.
              </p>
            </div>
          ) : (
            <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
              {scans.map((scan) => (
                <li key={scan.id}>
                  <Link
                    href={`/food-lens/${scan.id}` as Route}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#1B3A2D]/[0.02]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1B3A2D]">
                        {scan.headline ?? 'Meal scan'}
                      </p>
                      <p className="mt-0.5 text-xs text-[#6B7A72]">{formatDate(scan.createdAt)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]">
                      {STATUS_LABEL[scan.status] ?? scan.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
