/**
 * HER HEALTH APPRAISAL RESULTS: twenty one areas, loudest first.
 *
 * A SERVER COMPONENT, DELIBERATELY. Nothing on this screen is interactive,
 * so nothing about it needs to reach the browser as code. What reaches her
 * is words.
 *
 * NO NUMBER EXCEPT THE THREE SHE IS MEANT TO READ. The summary block counts
 * her own areas, and those three counts are computed here from the cards
 * themselves (lib/haq/results.ts), so the page's own props carry no number
 * at all and no total, percentage, cutoff or grade can travel with them.
 * There is no overall result on this page because the instrument has none.
 *
 * SYMPTOMS, NEVER CONDITIONS. Every sentence says what an AREA is showing
 * from what she reported. A section is named, never an organ, and nothing
 * here diagnoses anything.
 *
 * THE TREND IS A COMPARISON OF REPORTS. It appears only when she has an
 * earlier finished sitting, it says Quieter, Unchanged or Louder, and it is
 * never framed as getting better or getting worse.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { Card } from '@/components/layout';
import { HAQ_ROUTE } from '@/lib/haq/constants';
import {
  HAQ_MEMBER_LABELS,
  HAQ_RESULTS_BACK_LABEL,
  HAQ_RESULTS_COMPARISON_LINE,
  HAQ_RESULTS_INTRO,
  HAQ_RESULTS_SUMMARY_HEADING,
  HAQ_RESULTS_TITLE,
  HAQ_TREND_LABELS,
  haqAreaCountLabel,
} from '@/lib/haq/copy';
import { HAQ_RESULT_COLOR_ORDER, haqResultCounts, type HaqMemberResults } from '@/lib/haq/results';
import type { HaqResultColor } from '@/lib/haq/types';

/**
 * THE THREE STATES, DRAWN. Quiet, warm and calm in that order, and never a
 * traffic light: Red is the colour of "worth a closer look with someone",
 * not of alarm.
 */
const TONE: Record<HaqResultColor, { surface: string; ink: string; dot: string; chip: string }> = {
  red: { surface: 'bg-[#FDECEC]', ink: 'text-[#8A3A3A]', dot: 'bg-[#B9524F]', chip: 'bg-[#F7D9D9] text-[#7A3130]' },
  yellow: { surface: 'bg-[#FDF6E7]', ink: 'text-[#7A5714]', dot: 'bg-[#C4A050]', chip: 'bg-[#F4E6C4] text-[#6E4E12]' },
  green: { surface: 'bg-[#EFF6F1]', ink: 'text-[#1B3A2D]', dot: 'bg-[#4F7A63]', chip: 'bg-[#DCE9E1] text-[#1B3A2D]' },
};

export function HaqResults({ results }: { results: HaqMemberResults }) {
  const counts = haqResultCounts(results.cards);

  return (
    <div data-testid="haq-results">
      <h1 className={`${CVS_DISPLAY_FONT} text-[30px] leading-tight tracking-[0.02em] text-[#1B3A2D]`}>
        {HAQ_RESULTS_TITLE}
      </h1>
      <p className="mt-3 text-[15.5px] leading-relaxed text-[#4F645A]">{HAQ_RESULTS_INTRO}</p>

      {results.hasPrevious && (
        <p className="mt-3 text-[14px] leading-relaxed text-[#6B7A72]" data-testid="haq-results-comparison-line">
          {HAQ_RESULTS_COMPARISON_LINE}
        </p>
      )}

      <Card className="mef-animate-in mt-6" data-testid="haq-results-summary">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#6B7A72]">
          {HAQ_RESULTS_SUMMARY_HEADING}
        </h2>
        <dl className="mt-3 divide-y divide-[#1B3A2D]/5">
          {HAQ_RESULT_COLOR_ORDER.map((color) => (
            <div key={color} className="flex items-center justify-between gap-4 py-2.5" data-testid={`haq-summary-${color}`}>
              <dt className="flex items-center gap-2.5 text-[15px] text-[#1B3A2D]">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[color].dot}`} aria-hidden="true" />
                {HAQ_MEMBER_LABELS[color]}
              </dt>
              <dd className="text-[15px] font-semibold text-[#1B3A2D]">{haqAreaCountLabel(counts[color])}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <ol className="mt-5 list-none space-y-3.5">
        {results.cards.map((card) => {
          const tone = TONE[card.resultColor];
          return (
            <li key={card.sectionId}>
              <Card className={`${tone.surface} mef-animate-in`} data-testid={`haq-result-card-${card.sectionId}`}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className={`${CVS_DISPLAY_FONT} text-[21px] leading-snug ${tone.ink}`}>{card.sectionTitle}</h3>
                  {card.trend && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone.chip}`}
                      data-testid={`haq-trend-${card.sectionId}`}
                    >
                      {HAQ_TREND_LABELS[card.trend]}
                    </span>
                  )}
                </div>
                <p className={`mt-1.5 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] ${tone.ink}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                  {card.memberResultLabel}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-[#3F5B50]">{card.explanation}</p>
              </Card>
            </li>
          );
        })}
      </ol>

      <Link
        href={'/questionnaires' as Route}
        className="mef-press mef-focus-ring mt-7 block w-full rounded-2xl border border-[#1B3A2D]/12 bg-white px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D]"
      >
        {HAQ_RESULTS_BACK_LABEL}
      </Link>
      {/* Her own sitting stays one tap away, so the results are never a dead end. */}
      <Link
        href={HAQ_ROUTE as Route}
        className="mef-focus-ring mt-3 block text-center text-[13px] font-medium text-[#6B7A72] underline decoration-[#6B7A72]/30 underline-offset-4"
      >
        Back to your Health Appraisal
      </Link>
    </div>
  );
}
