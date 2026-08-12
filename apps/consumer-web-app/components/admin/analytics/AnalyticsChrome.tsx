/**
 * The chrome every admin analytics view shares: the title, the four tabs,
 * the date range selector, and the test-account toggle.
 *
 * Server components, all of it. There is no client-side state here on
 * purpose: the date range and the test-account toggle are in the URL, so
 * changing either is a normal navigation and the numbers are re-aggregated
 * in Postgres. Nothing about these controls can cause raw event rows to be
 * loaded into a browser, because the browser never receives a row.
 *
 * The toggle is one control that sits above the tabs, so it applies to
 * whichever of the four views is open and stays applied when the admin
 * moves between them.
 */

import Link from 'next/link';
import type { Route } from 'next';
import {
  DASHBOARD_RANGE_KEYS,
  RANGE_LABELS,
  dashboardHref,
  rangeSummary,
} from '@/lib/analytics-dashboard/viewState';
import type { DashboardRangeKey, DashboardView } from '@/lib/analytics-dashboard/viewState';
import {
  TEST_ACCOUNTS_ON_DETAIL,
  TEST_ACCOUNTS_ON_LABEL,
} from '@/lib/analytics-dashboard/presentation';

export const ANALYTICS_TABS = [
  { href: '/admin/analytics', label: 'Overview' },
  { href: '/admin/analytics/funnel', label: 'Member funnel' },
  { href: '/admin/analytics/features', label: 'Feature usage' },
  { href: '/admin/analytics/drop-off', label: 'Drop-off' },
] as const;

export type AnalyticsTabHref = (typeof ANALYTICS_TABS)[number]['href'];

function Tabs({ current, view }: { current: AnalyticsTabHref; view: DashboardView }) {
  return (
    <nav aria-label="Analytics views" className="mt-6 border-b border-[#1B3A2D]/10">
      <ul className="flex flex-wrap items-end gap-x-6 gap-y-1">
        {ANALYTICS_TABS.map((tab) => {
          const active = tab.href === current;
          return (
            <li key={tab.href}>
              <Link
                href={dashboardHref(tab.href, view) as Route}
                aria-current={active ? 'page' : undefined}
                className={`mef-focus-ring -mb-px inline-block border-b-2 pb-2.5 pt-1 text-[14px] transition-colors ${
                  active
                    ? 'border-[#C4A050] font-medium text-[#1B3A2D]'
                    : 'border-transparent text-[#1B3A2D]/55 hover:text-[#1B3A2D]'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RangePills({ current, view }: { current: AnalyticsTabHref; view: DashboardView }) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex items-center gap-1 rounded-full bg-white/70 p-1 shadow-[0_1px_10px_-4px_rgba(27,58,45,0.18)]"
    >
      {DASHBOARD_RANGE_KEYS.map((key: DashboardRangeKey) => {
        const selected = key === view.rangeKey;
        return (
          <Link
            key={key}
            href={dashboardHref(current, view, { rangeKey: key }) as Route}
            aria-current={selected ? 'true' : undefined}
            data-range={key}
            data-selected={selected ? 'true' : 'false'}
            className={`mef-focus-ring rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${
              selected
                ? 'bg-[#1B3A2D] font-medium text-[#F5F0E4]'
                : 'text-[#1B3A2D]/60 hover:text-[#1B3A2D]'
            }`}
          >
            {RANGE_LABELS[key]}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * A plain GET form, so a custom range works with no client JavaScript at
 * all. The test-account toggle rides along as a hidden field so submitting
 * a date range never quietly switches it off.
 */
function CustomRangeForm({ current, view }: { current: AnalyticsTabHref; view: DashboardView }) {
  const field =
    'mef-focus-ring rounded-xl border border-[#1B3A2D]/15 bg-white px-2.5 py-1.5 text-[12.5px] text-[#1B3A2D]';
  return (
    <form action={current} method="get" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="range" value="custom" />
      {view.includeTestAccounts ? <input type="hidden" name="test" value="on" /> : null}
      <label className="text-[12px] text-[#1B3A2D]/55" htmlFor="analytics-from">
        From
      </label>
      <input
        id="analytics-from"
        type="date"
        name="from"
        max={view.end}
        defaultValue={view.start}
        className={field}
      />
      <label className="text-[12px] text-[#1B3A2D]/55" htmlFor="analytics-to">
        to
      </label>
      <input
        id="analytics-to"
        type="date"
        name="to"
        max={view.end}
        defaultValue={view.end}
        className={field}
      />
      <button
        type="submit"
        className="mef-focus-ring rounded-full border border-[#1B3A2D]/20 px-3.5 py-1.5 text-[12.5px] text-[#1B3A2D] transition-colors hover:bg-[#1B3A2D] hover:text-[#F5F0E4]"
      >
        Apply
      </button>
    </form>
  );
}

function TestAccountToggle({ current, view }: { current: AnalyticsTabHref; view: DashboardView }) {
  const on = view.includeTestAccounts;
  return (
    <Link
      href={dashboardHref(current, view, { includeTestAccounts: !on }) as Route}
      role="switch"
      aria-checked={on}
      data-test-accounts={on ? 'on' : 'off'}
      className="mef-focus-ring inline-flex items-center gap-2.5 rounded-full bg-white/70 py-1.5 pl-1.5 pr-4 shadow-[0_1px_10px_-4px_rgba(27,58,45,0.18)] transition-colors hover:bg-white"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-[22px] w-[38px] items-center rounded-full transition-colors ${
          on ? 'bg-[#C4A050]' : 'bg-[#1B3A2D]/15'
        }`}
      >
        <span
          className={`absolute h-[16px] w-[16px] rounded-full bg-white transition-all ${
            on ? 'left-[19px]' : 'left-[3px]'
          }`}
        />
      </span>
      <span className="text-[12.5px] text-[#1B3A2D]">
        {on ? TEST_ACCOUNTS_ON_LABEL : 'Test accounts excluded'}
      </span>
    </Link>
  );
}

export function AnalyticsChrome({
  current,
  view,
  title,
  intro,
  children,
}: {
  current: AnalyticsTabHref;
  view: DashboardView;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1B3A2D]/45">
            Rooted Reset, internal
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-cormorant-garamond)] text-[2.25rem] leading-[1.1] text-[#1B3A2D] md:text-[2.75rem]">
            {title}
          </h1>
        </div>
        <p className="text-[12.5px] text-[#1B3A2D]/55">{rangeSummary(view)}</p>
      </div>

      <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-[#6B7A72]">{intro}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <RangePills current={current} view={view} />
        <TestAccountToggle current={current} view={view} />
      </div>
      <div className="mt-3">
        <CustomRangeForm current={current} view={view} />
      </div>

      {view.rangeNotice ? (
        <p className="mt-3 rounded-2xl border border-[#C4A050]/35 bg-[#C4A050]/10 px-4 py-2.5 text-[13px] text-[#1B3A2D]">
          {view.rangeNotice}
        </p>
      ) : null}

      {view.includeTestAccounts ? (
        <p
          data-test-accounts-banner="on"
          className="mt-3 rounded-2xl border border-[#C4A050]/45 bg-[#C4A050]/12 px-4 py-2.5 text-[13px] text-[#1B3A2D]"
        >
          <span className="font-medium">{TEST_ACCOUNTS_ON_LABEL}.</span> {TEST_ACCOUNTS_ON_DETAIL}
        </p>
      ) : null}

      <Tabs current={current} view={view} />

      <div className="mt-7">{children}</div>
    </>
  );
}
