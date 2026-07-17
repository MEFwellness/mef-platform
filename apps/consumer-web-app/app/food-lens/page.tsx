import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  UtensilsCrossed,
  ChevronRight,
  Settings2,
  Barcode,
  Camera,
  ScanLine,
  Search,
  PenLine,
  NotebookText,
  ScrollText,
  Refrigerator,
  Store,
  MessageCircle,
} from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { AvatarLink } from '@/components/AvatarLink';
import {
  listMyFoodLensScansAction,
  getActivePrimalPatternProfileAction,
} from '@/app/actions/food-lens';
import { getTodaysCoachingMessageAction } from '@/app/actions/food-insights';

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

/** Where a recent scan's row should link — the unified product result page for anything with a resolved product, the label confirm screen for one still awaiting confirmation, and the meal-photo result page otherwise. */
function scanHref(scan: { id: string; scanType: string }): Route {
  if (scan.scanType === 'nutrition_label') return `/food-lens/label/${scan.id}` as Route;
  if (scan.scanType === 'barcode' || scan.scanType === 'manual_entry') {
    return `/food-lens/barcode/${scan.id}` as Route;
  }
  return `/food-lens/${scan.id}` as Route;
}

const FALLBACK_SCAN_LABEL: Record<string, string> = {
  barcode: 'Barcode scan',
  nutrition_label: 'Label scan',
  manual_entry: 'Manual entry',
  meal_photo: 'Meal scan',
};

const ENTRY_OPTIONS = [
  {
    href: '/food-lens/new' as Route,
    icon: Camera,
    title: 'Scan a Meal',
    description: 'Take a photo and review the foods and portions before saving.',
  },
  {
    href: '/food-lens/barcode/new' as Route,
    icon: Barcode,
    title: 'Scan a Barcode',
    description: 'Identify packaged foods and receive ingredient and nutrition guidance.',
  },
  {
    href: '/food-lens/label/new' as Route,
    icon: ScanLine,
    title: 'Scan a Label',
    description: 'Capture Nutrition Facts and ingredients when a product is missing from the database.',
  },
  {
    href: '/food-lens/search' as Route,
    icon: Search,
    title: 'Search',
    description: 'Find a previously scanned or commonly logged food.',
  },
  {
    href: '/food-lens/manual/new' as Route,
    icon: PenLine,
    title: 'Manual Entry',
    description: 'Add a meal or food yourself.',
  },
];

export default async function FoodLensPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, scans, pattern, { data: profile }, dailyCoaching] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    listMyFoodLensScansAction(),
    getActivePrimalPatternProfileAction(),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    getTodaysCoachingMessageAction(),
  ]);
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <UtensilsCrossed className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">Food Lens</p>
          </div>
          <AvatarLink firstName={firstName} />
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Meal coaching, not counting
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6B7A72]">
          However you'd like to log it, Root will walk through what actually matters — never just
          one nutrient in isolation.
        </p>

        {dailyCoaching.messages.length > 0 && (
          <div className={`${CARD} mt-5 p-5`}>
            <div className="flex items-center gap-2 text-[#1B3A2D]">
              <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                Today
              </p>
            </div>
            <div className="mt-2 space-y-2">
              {dailyCoaching.messages.map((message, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-[#1B3A2D]">
                  {message}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-2.5">
          {ENTRY_OPTIONS.map((option) => (
            <Link
              key={option.href}
              href={option.href}
              className={`${CARD} flex items-center gap-3.5 p-4`}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1B3A2D]/[0.06]">
                <option.icon className="h-5 w-5 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1B3A2D]">{option.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#6B7A72]">{option.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ))}
        </div>

        <Link
          href={'/food-lens/pattern' as Route}
          className={`${CARD} mt-5 flex items-center justify-between p-4`}
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

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            href={'/food-lens/log' as Route}
            className={`${CARD} flex items-center gap-2.5 p-4`}
          >
            <NotebookText
              className="h-4 w-4 text-[#9AA79F]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-[#1B3A2D]">Today&apos;s food log</p>
          </Link>
          <Link
            href={'/food-lens/preferences' as Route}
            className={`${CARD} flex items-center gap-2.5 p-4`}
          >
            <Settings2 className="h-4 w-4 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-medium text-[#1B3A2D]">Allergies &amp; preferences</p>
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link
            href={'/food-lens/pantry' as Route}
            className={`${CARD} flex items-center gap-2.5 p-4`}
          >
            <Refrigerator className="h-4 w-4 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-medium text-[#1B3A2D]">Pantry</p>
          </Link>
          <Link
            href={'/food-lens/restaurant/new' as Route}
            className={`${CARD} flex items-center gap-2.5 p-4`}
          >
            <Store className="h-4 w-4 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-medium text-[#1B3A2D]">Eating out</p>
          </Link>
        </div>

        <Link
          href={'/food-lens/report' as Route}
          className={`${CARD} mt-3 flex items-center justify-between p-4`}
        >
          <div className="flex items-center gap-2.5">
            <ScrollText className="h-4 w-4 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[#1B3A2D]">Your Week in Food</p>
              <p className="mt-0.5 text-xs text-[#6B7A72]">A calm weekly summary of your patterns</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[#9AA79F]" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <section className="mt-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Your recent scans
          </p>
          {scans.length === 0 ? (
            <div className={`${CARD} p-6`}>
              <p className="text-sm text-[#6B7A72]">
                No scans yet — choose an option above to get your first read.
              </p>
            </div>
          ) : (
            <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
              {scans.map((scan) => (
                <li key={scan.id}>
                  <Link
                    href={scanHref({ id: scan.id, scanType: scan.scanType })}
                    className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-[#1B3A2D]/[0.02]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1B3A2D]">
                        {scan.headline ?? FALLBACK_SCAN_LABEL[scan.scanType] ?? 'Scan'}
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
