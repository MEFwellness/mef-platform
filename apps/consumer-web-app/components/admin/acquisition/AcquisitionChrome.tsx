/**
 * The controls above the acquisition report: the window, the test-account
 * toggle, and what the rows are grouped by.
 *
 * SERVER COMPONENTS, NO CLIENT STATE. Every control is a link or a plain
 * GET form, so the window, the toggle and the grouping live in the URL and
 * changing any of them is an ordinary navigation that re-aggregates on the
 * server. The browser never receives a row.
 *
 * THE SAME RULES THE ANALYTICS DASHBOARD USES. The range presets, the
 * custom range validation and the toggle all come from
 * lib/analytics-dashboard/viewState.ts, unchanged, so this screen and the
 * analytics screens cannot disagree about what a window is. What is added
 * here is the grouping, which nothing else has.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { DASHBOARD_RANGE_KEYS, RANGE_LABELS, rangeSummary } from '@/lib/analytics-dashboard/viewState';
import type { DashboardRangeKey } from '@/lib/analytics-dashboard/viewState';
import { ACQUISITION_GROUP_BY, GROUP_BY_LABEL } from '@/lib/acquisition/report';
import type { AcquisitionGroupBy } from '@/lib/acquisition/report';
import {
  ACQUISITION_REPORT_PATH,
  acquisitionHref,
  type AcquisitionReportView,
} from '@/lib/acquisition/reportView';

const PILL_ON = 'bg-[#1B3A2D] font-medium text-[#F5F0E4]';
const PILL_OFF = 'text-[#1B3A2D]/60 hover:text-[#1B3A2D]';

function PillGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full bg-white/70 p-1 shadow-[0_1px_10px_-4px_rgba(27,58,45,0.18)]"
    >
      {children}
    </div>
  );
}

function RangePills({ view }: { view: AcquisitionReportView }) {
  return (
    <PillGroup label="Date range">
      {DASHBOARD_RANGE_KEYS.map((key: DashboardRangeKey) => {
        const selected = key === view.rangeKey;
        return (
          <Link
            key={key}
            href={acquisitionHref(view, { rangeKey: key }) as Route}
            aria-current={selected ? 'true' : undefined}
            data-range={key}
            data-selected={selected ? 'true' : 'false'}
            className={`mef-focus-ring rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${
              selected ? PILL_ON : PILL_OFF
            }`}
          >
            {RANGE_LABELS[key]}
          </Link>
        );
      })}
    </PillGroup>
  );
}

function GroupPills({ view }: { view: AcquisitionReportView }) {
  return (
    <PillGroup label="Group by">
      {ACQUISITION_GROUP_BY.map((key: AcquisitionGroupBy) => {
        const selected = key === view.groupBy;
        return (
          <Link
            key={key}
            href={acquisitionHref(view, { groupBy: key }) as Route}
            aria-current={selected ? 'true' : undefined}
            data-group={key}
            data-selected={selected ? 'true' : 'false'}
            className={`mef-focus-ring rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors ${
              selected ? PILL_ON : PILL_OFF
            }`}
          >
            {GROUP_BY_LABEL[key]}
          </Link>
        );
      })}
    </PillGroup>
  );
}

function TestToggle({ view }: { view: AcquisitionReportView }) {
  const on = view.includeTestAccounts;
  return (
    <Link
      href={acquisitionHref(view, { includeTestAccounts: !on }) as Route}
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
        {on ? 'Test traffic included' : 'Test traffic excluded'}
      </span>
    </Link>
  );
}

/** A plain GET form, so a custom window works with no client JavaScript at all. The toggle and the grouping ride along as hidden fields so applying a date never quietly resets either. */
function CustomRangeForm({ view }: { view: AcquisitionReportView }) {
  const field =
    'mef-focus-ring rounded-xl border border-[#1B3A2D]/15 bg-white px-2.5 py-1.5 text-[12.5px] text-[#1B3A2D]';
  return (
    <form action={ACQUISITION_REPORT_PATH} method="get" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="range" value="custom" />
      <input type="hidden" name="group" value={view.groupBy} />
      {view.includeTestAccounts ? <input type="hidden" name="test" value="on" /> : null}
      <label className="text-[12px] text-[#1B3A2D]/55" htmlFor="acquisition-from">
        From
      </label>
      <input
        id="acquisition-from"
        type="date"
        name="from"
        max={view.end}
        defaultValue={view.start}
        className={field}
      />
      <label className="text-[12px] text-[#1B3A2D]/55" htmlFor="acquisition-to">
        to
      </label>
      <input
        id="acquisition-to"
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

export function AcquisitionChrome({ view }: { view: AcquisitionReportView }) {
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <RangePills view={view} />
        <TestToggle view={view} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <GroupPills view={view} />
      </div>
      <div className="mt-3">
        <CustomRangeForm view={view} />
      </div>

      <p className="mt-3 text-[12.5px] text-[#1B3A2D]/55">{rangeSummary(view)}</p>

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
          <span className="font-medium">Test traffic is included in every number below.</span> Our
          own testing links and every account flagged as a test account are counted here. Turn this
          off before acting on anything.
        </p>
      ) : null}
    </>
  );
}
