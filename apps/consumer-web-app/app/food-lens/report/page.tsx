import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import {
  ChevronLeft,
  NotebookText,
  Leaf,
  Sparkles,
  Compass,
  CalendarDays,
  TrendingUp,
} from 'lucide-react';
import { hasActiveRole } from '@/lib/auth/guards';
import { BottomNav } from '@/components/BottomNav';
import { getOrGenerateWeeklyNutritionReportAction } from '@/app/actions/nutrition-reports';
import { INSUFFICIENT_DATA_MESSAGE } from '@/lib/food-lens/weeklyReport';
import { getHistoryPatternsAction } from '@/app/actions/food-insights';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatWeekRange(weekStart: string, weekEnd: string): string {
  // week_end is the exclusive upper bound (the following Monday) — display
  // the inclusive Sunday so the range reads as a real 7-day week.
  const start = new Date(`${weekStart}T00:00:00.000Z`);
  const endExclusive = new Date(`${weekEnd}T00:00:00.000Z`);
  const endInclusive = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const year = start.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(endInclusive)}, ${year}`;
}

export default async function WeeklyNutritionReportPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [isCoach, result, thirtyDayPatterns] = await Promise.all([
    hasActiveRole(supabase, user.id, 'coach'),
    getOrGenerateWeeklyNutritionReportAction(),
    getHistoryPatternsAction(30),
  ]);

  const report = result.report;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pl-28">
        <Link
          href={'/food-lens' as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Food Lens
        </Link>

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <NotebookText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Weekly Nutrition Report</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          Your Week in Food
        </h1>

        {report ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-[#9AA79F]">
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span>{formatWeekRange(report.week_start, report.week_end)}</span>
          </div>
        ) : null}

        {!report ? (
          <div className={`${CARD} mt-6 p-6`}>
            <p className="text-sm leading-relaxed text-[#6B7A72]">{result.error}</p>
          </div>
        ) : report.status === 'insufficient_data' ? (
          <div className={`${CARD} mt-6 p-6`}>
            <p className="text-[15px] leading-relaxed text-[#1B3A2D]">
              {INSUFFICIENT_DATA_MESSAGE}
            </p>
            <Link
              href={'/food-lens/log' as Route}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B3A2D]"
            >
              Log a meal now
              <ChevronLeft className="h-3.5 w-3.5 rotate-180" strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {/* Your Week in Food */}
            <section className={`${CARD} p-6`}>
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                Your Week in Food
              </p>
              <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">
                {report.report.yourWeekInFood}
              </p>
            </section>

            {/* What Supported You */}
            {report.report.whatSupportedYou.length > 0 ? (
              <section className={`${CARD} p-6`}>
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                    What Supported You
                  </p>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {report.report.whatSupportedYou.map((item, i) => (
                    <li key={i} className="text-[15px] leading-relaxed text-[#1B3A2D]">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Patterns Worth Noticing */}
            {report.report.patternsWorthNoticing.length > 0 ? (
              <section className={`${CARD} p-6`}>
                <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                  Patterns Worth Noticing
                </p>
                <ul className="mt-3 space-y-2.5">
                  {report.report.patternsWorthNoticing.map((item, i) => (
                    <li key={i} className="text-[15px] leading-relaxed text-[#6B7A72]">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* A Win to Build On */}
            {report.report.winToBuildOn ? (
              <section className={`${CARD} p-6`}>
                <div className="flex items-center gap-2">
                  <Sparkles
                    className="h-4 w-4 text-[#854D0E]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                    A Win to Build On
                  </p>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">
                  {report.report.winToBuildOn}
                </p>
              </section>
            ) : null}

            {/* Your Rooted Focus for Next Week */}
            {report.report.rootedFocusForNextWeek ? (
              <section className={`${CARD} p-6`}>
                <div className="flex items-center gap-2">
                  <Compass
                    className="h-4 w-4 text-[#1B3A2D]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                    Your Rooted Focus for Next Week
                  </p>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">
                  {report.report.rootedFocusForNextWeek}
                </p>
              </section>
            ) : null}
          </div>
        )}

        {!thirtyDayPatterns.insufficientData && thirtyDayPatterns.observations.length > 0 && (
          <section className={`${CARD} mt-4 p-6`}>
            <div className="flex items-center gap-2">
              <TrendingUp
                className="h-4 w-4 text-[#1B3A2D]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
                Your Last 30 Days
              </p>
            </div>
            <ul className="mt-3 space-y-2.5">
              {thirtyDayPatterns.observations.map((item, i) => (
                <li key={i} className="text-[15px] leading-relaxed text-[#6B7A72]">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <BottomNav isCoach={isCoach} />
    </div>
  );
}
