/**
 * The small shared pieces every admin analytics view is built from.
 *
 * All server components. Each one exists so a rule gets applied the same way
 * on all four screens rather than four times by hand:
 *
 *   MetricCard        a number, its definition, and its trend
 *   Unmeasurable      a reason, never a zero and never a dash
 *   EmptyState        what will make this fill in
 *   ThinDataNote      the counts are real but too small to rate
 *   Panel             a titled card
 *   ProportionBar     a share of a whole, drawn to scale
 *   ActionError       an authorization or query failure, said plainly
 *
 * Gold (#C4A050) appears in exactly three places across the section: the
 * active tab underline, the test-account banner, and the hairline above an
 * unmeasurable note. Everything else is forest on cream.
 */

import type { Trend } from '@/lib/analytics-dashboard/trend';
import { trendChip } from '@/lib/analytics-dashboard/trend';
import { formatCount } from '@/lib/analytics-dashboard/presentation';

export const CARD =
  'rounded-[24px] bg-white shadow-[0_2px_24px_-8px_rgba(27,58,45,0.16)] ring-1 ring-[#1B3A2D]/[0.04]';

export function Panel({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${CARD} p-6 md:p-7 ${className}`}>
      <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-[1.6rem] leading-tight text-[#1B3A2D]">
        {title}
      </h2>
      {description ? (
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[#6B7A72]">
          {description}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function TrendMark({ trend }: { trend: Trend }) {
  const chip = trendChip(trend);
  if (!chip) return null;

  const tone =
    trend.direction === 'up' || trend.direction === 'first'
      ? 'bg-[#1B3A2D]/8 text-[#1B3A2D]'
      : trend.direction === 'down'
        ? 'bg-[#8C3A2B]/8 text-[#8C3A2B]'
        : 'bg-[#1B3A2D]/5 text-[#1B3A2D]/60';

  const glyph =
    trend.direction === 'up' || trend.direction === 'first'
      ? '↑'
      : trend.direction === 'down'
        ? '↓'
        : '';

  return (
    <span
      data-trend={trend.direction}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11.5px] font-medium ${tone}`}
    >
      {glyph ? <span aria-hidden="true">{glyph}</span> : null}
      {chip}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  definition,
  trend,
  footnote,
  emphasis = false,
}: {
  label: string;
  value: string;
  definition?: string | undefined;
  trend?: Trend | undefined;
  footnote?: string | undefined;
  emphasis?: boolean | undefined;
}) {
  return (
    <div className={`${CARD} flex h-full flex-col p-5`} data-metric={label}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1B3A2D]/45">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`font-[family-name:var(--font-cormorant-garamond)] leading-none text-[#1B3A2D] ${
            emphasis ? 'text-[3rem]' : 'text-[2.4rem]'
          }`}
        >
          {value}
        </span>
        {trend ? <TrendMark trend={trend} /> : null}
      </div>
      {trend ? (
        <p className="mt-2 text-[12px] leading-relaxed text-[#6B7A72]">{trend.description}</p>
      ) : null}
      {footnote ? (
        <p className="mt-2 text-[12px] leading-relaxed text-[#6B7A72]">{footnote}</p>
      ) : null}
      {definition ? (
        <p className="mt-auto pt-3 text-[11.5px] leading-relaxed text-[#1B3A2D]/45">{definition}</p>
      ) : null}
    </div>
  );
}

/**
 * Something the instrumentation genuinely cannot answer. The reason comes
 * from the service layer verbatim; nothing here summarises or softens it,
 * and no zero or dash is ever shown in its place.
 */
export function Unmeasurable({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="border-t border-[#C4A050]/40 pt-3" data-unmeasurable={label}>
      <p className="text-[13px] font-medium text-[#1B3A2D]">{label}: cannot be measured yet</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#6B7A72]">{reason}</p>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  className = '',
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div
      data-empty-state="true"
      className={`rounded-[20px] border border-dashed border-[#1B3A2D]/18 bg-[#1B3A2D]/[0.02] px-5 py-6 ${className}`}
    >
      <p className="font-[family-name:var(--font-cormorant-garamond)] text-[1.35rem] leading-tight text-[#1B3A2D]">
        {title}
      </p>
      <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-[#6B7A72]">{body}</p>
    </div>
  );
}

/** The counts are real, there are just too few of them for a rate to mean anything. */
export function ThinDataNote({ children }: { children: React.ReactNode }) {
  return (
    <span
      data-thin-data="true"
      className="inline-flex items-center rounded-full bg-[#1B3A2D]/6 px-2 py-[3px] text-[11px] font-medium text-[#1B3A2D]/60"
    >
      {children}
    </span>
  );
}

/** A share of a whole, drawn to scale. Zero draws nothing rather than a misleading sliver. */
export function ProportionBar({
  value,
  total,
  tone = 'forest',
}: {
  value: number;
  total: number;
  tone?: 'forest' | 'muted';
}) {
  const share = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/8">
      {share > 0 ? (
        <div
          className={`h-full rounded-full ${tone === 'forest' ? 'bg-[#1B3A2D]' : 'bg-[#1B3A2D]/25'}`}
          style={{ width: `${share * 100}%` }}
        />
      ) : null}
    </div>
  );
}

/**
 * A refused or failed query. Deliberately distinct from an empty result: an
 * empty analytics report and a rejected one look identical on a dashboard,
 * and confusing the two is how a permissions bug hides for months.
 */
export function ActionError({ label, error }: { label: string; error: string }) {
  return (
    <div
      data-analytics-error="true"
      className="rounded-[20px] border border-[#8C3A2B]/25 bg-[#8C3A2B]/[0.04] px-5 py-4"
    >
      <p className="text-[13.5px] font-medium text-[#1B3A2D]">{label} could not be loaded</p>
      <p className="mt-1 text-[13px] leading-relaxed text-[#6B7A72]">{error}</p>
    </div>
  );
}

/** A labelled number in a list, with its own supporting line. */
export function StatLine({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#1B3A2D]/6 py-2.5 last:border-b-0">
      <div>
        <p className="text-[13.5px] text-[#1B3A2D]">{label}</p>
        {detail ? <p className="mt-0.5 text-[12px] text-[#6B7A72]">{detail}</p> : null}
      </div>
      <p className="shrink-0 font-[family-name:var(--font-cormorant-garamond)] text-[1.4rem] leading-none text-[#1B3A2D]">
        {value}
      </p>
    </div>
  );
}

export { formatCount };
