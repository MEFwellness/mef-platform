/**
 * Part 1, rendered. The one component that draws the recap, used by the
 * member's own experience and by the coach's panel.
 *
 * One component, deliberately, because the whole promise of this feature
 * is that a coach and a member are looking at the same picture in the
 * Friday review. Two renderers over one set of descriptors would be two
 * pictures the moment either changed.
 *
 * A server component with no state, so it renders identically in both
 * places. The `tone` prop only changes colour: dark for the member's own
 * deep green screen, light for the coach's white card. It never changes
 * what is said.
 */

import { formatDisplayDate } from '@/lib/time/displayDate';
import type { RenderedRecap } from '@/lib/weekly-reflection/recap';

const TONE = {
  dark: {
    range: 'text-[#F5F0E4]/55',
    intro: 'text-[#F5F0E4]',
    card: 'rounded-2xl border border-[#F5F0E4]/12 bg-[#F5F0E4]/[0.06] p-4',
    label: 'text-[#C4A050]',
    tier: 'text-[#F5F0E4]/45',
    sentence: 'text-[#F5F0E4]/90',
    empty: 'text-[#F5F0E4]/60',
  },
  light: {
    range: 'text-[#6B7A72]',
    intro: 'text-[#1B3A2D]',
    card: 'rounded-2xl border border-[#1B3A2D]/10 bg-[#F3F6F4] p-4',
    label: 'text-[#8A6D1F]',
    tier: 'text-[#6B7A72]',
    sentence: 'text-[#1B3A2D]',
    empty: 'text-[#6B7A72]',
  },
} as const;

/**
 * The seven days, spelled out.
 *
 * formatDisplayDate, never toLocaleDateString: both of these are bare
 * YYYY-MM-DD day boundaries rather than instants, which is exactly the
 * case lib/time/displayDate.ts pins to UTC so the server pass and the
 * browser pass cannot disagree about which day a date is.
 */
function rangeLabel(from: string, to: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${formatDisplayDate(from, opts)} to ${formatDisplayDate(to, opts)}`;
}

export function WeeklyReflectionRecapBody({
  recap,
  tone = 'dark',
}: {
  recap: RenderedRecap;
  tone?: 'dark' | 'light';
}) {
  const t = TONE[tone];

  return (
    <div>
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${t.range}`}>
        {rangeLabel(recap.from, recap.to)}
      </p>

      <p className={`mt-3 text-[16px] leading-relaxed ${t.intro}`}>{recap.intro}</p>

      {recap.observations.length > 0 && (
        <ul className="mt-4 space-y-3">
          {recap.observations.map((observation) => (
            <li key={observation.signalKey} className={t.card}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={`text-[11px] font-semibold uppercase tracking-wider ${t.label}`}>
                  {observation.label}
                </p>
                {observation.tierLabel && (
                  <p className={`text-[11px] ${t.tier}`}>{observation.tierLabel}</p>
                )}
              </div>
              <p className={`mt-1 text-[15px] leading-relaxed ${t.sentence}`}>
                {observation.sentence}
              </p>
            </li>
          ))}
        </ul>
      )}

      {recap.emptyNote && (
        <p className={`mt-4 text-[15px] leading-relaxed ${t.empty}`}>{recap.emptyNote}</p>
      )}
    </div>
  );
}
