import Link from 'next/link';
import type { Route } from 'next';
import { Lightbulb, ArrowRight } from 'lucide-react';
import type { CoachingInsightView } from '@/app/actions/coaching-insights';
import { RootQuickLink } from '@/components/RootQuickLink';

const CARD = 'rounded-[28px] bg-[#EFF6F1] p-6';

/**
 * Coaching Insights — promoted from a bare nav row into a content card
 * (Progress page restructure). Reads the same `coaching_insights` source
 * the full /insights view reads (getMyCoachingInsightsAction), preferring
 * the `todays_insight` category since that's the closest existing concept
 * to "the latest insight." The three suggested-question chips are the
 * same RootQuickLink entry points that used to live in the page's old
 * "Talk to Root" section — moved here so they sit in context with the
 * insight they're about, not stranded at the bottom of the page.
 */
export function CoachingInsightsPanel({
  insights,
  entryContext,
}: {
  insights: CoachingInsightView[];
  entryContext: string;
}) {
  const featured = insights.find((i) => i.category === 'todays_insight') ?? insights[0] ?? null;

  return (
    <section className={`${CARD} mt-5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Coaching Insights</p>
        </div>
        <Link
          href={'/insights' as Route}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#1B3A2D] hover:underline"
        >
          See all
          <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      {featured ? (
        <p className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[1.35rem] leading-relaxed text-[#1B3A2D]">
          {featured.statement}
        </p>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">
          Complete a few check-ins and Root will start noticing patterns worth surfacing here.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <RootQuickLink entryPoint="progress_pattern" entryContext={entryContext}>
          Help me understand this pattern
        </RootQuickLink>
        <RootQuickLink entryPoint="progress_improved" entryContext={entryContext}>
          What has improved?
        </RootQuickLink>
        <RootQuickLink entryPoint="progress_focus" entryContext={entryContext}>
          What should I focus on?
        </RootQuickLink>
      </div>
    </section>
  );
}
