import Link from 'next/link';
import type { Route } from 'next';
import { Lightbulb, ArrowRight } from 'lucide-react';
import type { CoachingInsightView } from '@/app/actions/coaching-insights';
import { RootQuickLink } from '@/components/RootQuickLink';

const CARD = 'rounded-[28px] bg-[#1B3A2D] shadow-[0_8px_32px_-8px_rgba(27,58,45,0.45)] p-6';
const CHIP_CLASS =
  'rounded-full border border-[#F5F0E4]/25 bg-[#F5F0E4]/10 px-4 py-2 text-sm font-medium text-[#F5F0E4] transition hover:bg-[#F5F0E4]/20';

/**
 * Coaching Insights — the single highest-contrast block on the Progress
 * page ("Your Wellness Story" rework). Previously a pale `#EFF6F1` tint
 * with gray text and light-outline chips — low enough contrast against
 * the page's own cream/sage background that it read as recessed and got
 * skipped. Now a filled forest-green `#1B3A2D` card: cream `#F5F0E4`
 * text throughout, the insight statement itself set large in Cormorant
 * Garamond so it reads as a statement, not a caption. This dark
 * treatment is reserved for this card only — no other section on the
 * page uses a filled background, which is exactly why it's the one
 * thing on the page that pulls the eye. No gold anywhere in this file,
 * per this task's explicit constraint (gold overuse was flagged in a
 * prior UX review): the chips are cream-on-forest, not gold.
 *
 * Still reads the same `coaching_insights` source the full /insights
 * view reads (getMyCoachingInsightsAction), preferring the
 * `todays_insight` category since that's the closest existing concept to
 * "the latest insight." The three suggested-question chips are the same
 * RootQuickLink entry points that used to live in the page's old "Talk
 * to Root" section — they sit directly beneath the insight text, in
 * context with what they're about.
 */
/**
 * Interpretation-layer migration (2026-08-17). Two surfaces one tap apart
 * used to disagree about whether Root had noticed anything at all: this
 * panel said "Complete a few check-ins and Root will start noticing
 * patterns worth surfacing here" while /insights, on the very next screen,
 * listed three things it had noticed. They read different systems.
 *
 * They still read different systems, because they are genuinely about
 * different things: this is today's generated coaching insight, /insights
 * is the longitudinal picture. What changed is that this panel is now told
 * whether the shared interpretation layer has anything for this member, so
 * it can no longer claim there is nothing when there is. It does not
 * borrow the other screen's content; it stops contradicting it.
 */
export function CoachingInsightsPanel({
  insights,
  entryContext,
  hasInterpretationFindings = false,
}: {
  insights: CoachingInsightView[];
  entryContext: string;
  /** True when the Member Interpretation Layer has at least one canonical finding. */
  hasInterpretationFindings?: boolean;
}) {
  const featured = insights.find((i) => i.category === 'todays_insight') ?? insights[0] ?? null;

  return (
    <section className={`${CARD} mt-5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[#F5F0E4]/70">
          <Lightbulb className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Coaching Insights</p>
        </div>
        <Link
          href={'/insights' as Route}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#F5F0E4] hover:underline"
        >
          See all
          <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      {/* Reading (Prompt 2), left-aligned rather than the component's usual
          centered treatment: this card runs the page's full md:max-w-5xl
          width and the header row above (label + "See all") stays flush
          left/right, so centering this text block alone would misalign it
          against that row. `max-w-[var(--mef-reading-max-width)]` caps the
          measure without the auto-centering `.mef-reading` also applies —
          layout only, recipe/colors untouched. */}
      {featured ? (
        <p className="mt-4 max-w-[var(--mef-reading-max-width)] font-[family-name:var(--font-cormorant-garamond)] text-[1.85rem] leading-tight text-[#F5F0E4]">
          {featured.statement}
        </p>
      ) : (
        <p className="mt-4 max-w-[var(--mef-reading-max-width)] text-sm leading-relaxed text-[#F5F0E4]/80">
          {hasInterpretationFindings
            ? "Nothing new from today's check-ins yet. What Root has noticed so far is under See all."
            : 'Complete a few check-ins and Root will start noticing things worth surfacing here.'}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <RootQuickLink
          entryPoint="progress_pattern"
          entryContext={entryContext}
          className={CHIP_CLASS}
        >
          Help me understand this
        </RootQuickLink>
        <RootQuickLink
          entryPoint="progress_improved"
          entryContext={entryContext}
          className={CHIP_CLASS}
        >
          What has improved?
        </RootQuickLink>
        <RootQuickLink
          entryPoint="progress_focus"
          entryContext={entryContext}
          className={CHIP_CLASS}
        >
          What should I focus on?
        </RootQuickLink>
      </div>
    </section>
  );
}
