import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import {
  ChevronLeft,
  Lightbulb,
  Repeat,
  CalendarDays,
  Eye,
  Sparkles,
  Compass,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  getMyCoachingInsightsAction,
  type CoachingInsightView,
} from '@/app/actions/coaching-insights';
import { getMyLongitudinalPicture } from '@/app/actions/longitudinalIntelligence';
import { CoachingInsightCard } from '@/components/coaching-insights/CoachingInsightCard';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SECTIONS: Array<{
  category: CoachingInsightView['category'];
  title: string;
  icon: LucideIcon;
}> = [
  { category: 'todays_insight', title: "Today's Insight", icon: Lightbulb },
  { category: 'recent_pattern', title: 'Recent Pattern', icon: Repeat },
  { category: 'weekly_observation', title: 'Weekly Observation', icon: CalendarDays },
  { category: 'watch', title: 'Things Worth Watching', icon: Eye },
  { category: 'small_win', title: 'Small Wins', icon: Sparkles },
];

export default async function CoachingInsightsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { insights, safetyMessage } = await getMyCoachingInsightsAction();
  const byCategory = new Map(insights.map((i) => [i.category, i]));
  const picture = safetyMessage ? null : await getMyLongitudinalPicture();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8 sm:px-6 md:max-w-2xl md:px-10 md:pl-28">
        <Link
          href={'/progress' as Route}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Back to Progress
        </Link>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D]">
          Coaching Insights
        </h1>
        <p className="mt-1 text-sm text-[#6B7A72]">
          Educational observations Root has noticed across your check-ins, meals, and progress —
          always grounded in what you&apos;ve actually logged, never a guess.
        </p>

        {safetyMessage ? (
          <section className={`${CARD} mt-6 p-6`}>
            <p className="text-sm leading-relaxed text-[#1B3A2D]">{safetyMessage}</p>
          </section>
        ) : insights.length === 0 ? (
          <section className={`${CARD} mt-6 p-6`}>
            <p className="text-sm leading-relaxed text-[#1B3A2D]">
              Nothing to share yet — keep logging your check-ins and meals, and Root will have real
              patterns to point out here soon.
            </p>
          </section>
        ) : (
          SECTIONS.map(({ category, title, icon: Icon }) => {
            const insight = byCategory.get(category);
            if (!insight) return null;
            return (
              <section key={category} className={`${CARD} mt-5 p-6`}>
                <div className="flex items-center gap-2 text-[#6B7A72]">
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden={true} />
                  <p className="text-sm font-semibold uppercase tracking-wider">{title}</p>
                </div>
                <ul className="mt-3 space-y-3">
                  <CoachingInsightCard insight={insight} />
                </ul>
              </section>
            );
          })
        )}

        {picture ? <LongitudinalPictureSection picture={picture} /> : null}
      </main>
    </div>
  );
}

function LongitudinalPictureSection({
  picture,
}: {
  picture: Awaited<ReturnType<typeof getMyLongitudinalPicture>>;
}) {
  const groups: Array<{ title: string; items: string[] }> = [
    { title: "What's Changing", items: picture.whatsChanging },
    { title: "Patterns We're Beginning to Notice", items: picture.emergingPatterns },
    { title: 'What Seems to Be Helping', items: picture.whatSeemsToBeHelping },
    { title: "What We're Still Learning", items: picture.stillLearning },
  ].filter((g) => g.items.length > 0);

  if (groups.length === 0 && !picture.nextBestStep) return null;

  return (
    <section className={`${CARD} mt-5 p-6`}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Compass className="h-4 w-4" strokeWidth={1.75} aria-hidden={true} />
        <p className="text-sm font-semibold uppercase tracking-wider">Your Longitudinal Picture</p>
      </div>
      <p className="mt-1 text-xs text-[#6B7A72]">
        How things have been trending across your check-ins and history — held loosely, never a diagnosis.
      </p>

      <div className="mt-4 space-y-5">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="text-sm font-semibold text-[#1B3A2D]">{group.title}</p>
            <ul className="mt-2 space-y-2">
              {group.items.map((item, i) => (
                <li key={i} className="text-sm leading-relaxed text-[#1B3A2D]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {picture.nextBestStep ? (
          <div className="rounded-2xl bg-[#EFF6F1] p-4">
            <p className="text-sm font-semibold text-[#1B3A2D]">Your Next Best Step</p>
            <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{picture.nextBestStep}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
