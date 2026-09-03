/**
 * THE ACQUISITION REPORT.
 *
 * WHAT IT ANSWERS. Which individual partner, campaign, creative, physical
 * card or town sends the people who actually finish, make an account and
 * pay. Six stages in the order somebody moves through them, with the
 * conversion from the stage before printed under each one, grouped by
 * whichever of the five dimensions is being asked about.
 *
 * IT REPLACED A SMALLER TABLE RATHER THAN SITTING BESIDE ONE. This screen
 * used to show a by-source count of seven steps. Leaving that in place
 * alongside a second table counting the same arrivals is exactly how two
 * screens end up disagreeing about one number, so the old table was
 * absorbed: every count it had is a column here, and the pattern spread it
 * carried moved to its own screen because a result pattern is not funnel
 * data and this report shows behavioural funnel data only.
 *
 * EVERY NUMBER HAS A QUERY UNDER IT. No model, no inference, no generated
 * commentary. Each figure is a count of rows in `acquisition_report_rows`
 * that satisfy one stated condition, and the definitions are printed
 * alongside rather than kept in somebody's head.
 *
 * WHAT IT NEVER SHOWS. A health answer, an assessment response, a result
 * pattern, an email address or a member's name. Geo stops at the city and
 * there is no column finer than that to show.
 *
 * TEST TRAFFIC IS EXCLUDED BY DEFAULT AND THE SCREEN SAYS HOW MUCH IT HID,
 * per the standing rule that a filtered admin list prints its own hidden
 * count instead of silently dropping rows.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { BackButton } from '@/components/BackButton';
import { AcquisitionChrome } from '@/components/admin/acquisition/AcquisitionChrome';
import { parseAcquisitionView } from '@/lib/acquisition/reportView';
import { readAcquisitionRows, readKnownGroups } from '@/lib/acquisition/reportData';
import {
  FUNNEL_STAGES,
  GROUP_BY_DEFINITION,
  GROUP_BY_LABEL,
  STAGE_DEFINITION,
  formatRate,
  ratesOf,
  rollUp,
  totalsOf,
  type AcquisitionGroupRow,
  type FunnelCounts,
} from '@/lib/acquisition/report';
import type { SearchParams } from '@/lib/analytics-dashboard/viewState';

export const dynamic = 'force-dynamic';

const HEAD = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]';
const CELL = 'px-3 py-2.5 text-sm text-[#1B3A2D] align-top';

function StageCell({ counts, stageKey }: { counts: FunnelCounts; stageKey: keyof FunnelCounts }) {
  const rates = ratesOf(counts);
  const rate = stageKey in rates ? formatRate(rates[stageKey] ?? null) : null;
  return (
    <td className={`${CELL} text-right`} data-stage={stageKey} data-stage-count={counts[stageKey]}>
      <span className="tabular-nums font-medium">{counts[stageKey]}</span>
      {rate ? (
        <span className="mt-0.5 block text-[11px] tabular-nums text-[#6B7A72]">{rate}</span>
      ) : null}
    </td>
  );
}

function GroupCell({ row }: { row: AcquisitionGroupRow }) {
  return (
    <td className={CELL} data-group-key={row.key} data-group-kind={row.kind}>
      <span className="font-medium">{row.label}</span>
      {row.kind === 'named' && row.key !== row.label ? (
        <span className="ml-2 font-mono text-[11px] text-[#6B7A72]">{row.key}</span>
      ) : null}
      {row.detail ? (
        <span className="mt-0.5 block text-[11px] text-[#6B7A72]">{row.detail}</span>
      ) : null}
      {row.retired ? (
        <span className="mt-1 inline-block rounded-full bg-[#1B3A2D]/8 px-2 py-0.5 text-[10.5px] font-semibold text-[#6B7A72]">
          retired, printed links still work
        </span>
      ) : null}
    </td>
  );
}

export default async function AcquisitionReportPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');

  const view = parseAcquisitionView(searchParams);

  const [read, known, sourcesResult] = await Promise.all([
    readAcquisitionRows(supabase, {
      start: view.start,
      end: view.end,
      includeTest: view.includeTestAccounts,
    }),
    readKnownGroups(supabase, { includeTest: view.includeTestAccounts }),
    supabase
      .from('public_entry_sources')
      .select('code, label, is_test, active')
      .eq('active', true)
      .order('channel')
      .order('code'),
  ]);

  const groups = rollUp(read.rows, view.groupBy, known[view.groupBy]);
  const totals = totalsOf(groups);
  const sources = (sourcesResult.data ?? []) as {
    code: string;
    label: string;
    is_test: boolean;
  }[];
  const producing = groups.filter((row) => row.kind === 'named' && row.visits > 0).length;
  const silent = groups.filter((row) => row.kind === 'named' && row.visits === 0).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-6xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/admin" label="Back to Admin" forceFallback />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
          Acquisition report
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-[#4F645A]">
          Every arrival at the public entry experience that landed inside this window, and
          everything those same people went on to do afterwards. Grouped by{' '}
          {GROUP_BY_LABEL[view.groupBy].toLowerCase()}. Nothing on this screen shows what any
          visitor answered.
        </p>

        <AcquisitionChrome view={view} />

        {read.error ? (
          <p className="mt-4 rounded-2xl border border-[#8C3A2B]/30 bg-[#8C3A2B]/8 px-4 py-3 text-[13px] text-[#8C3A2B]">
            {read.error}
          </p>
        ) : null}

        <p className="mt-4 text-[13px] leading-relaxed text-[#6B7A72]">
          {read.hiddenTestCount === 0
            ? 'No test traffic to hide in this window. Every row below is real.'
            : `${read.hiddenTestCount} test ${
                read.hiddenTestCount === 1 ? 'row is' : 'rows are'
              } hidden from these numbers.`}
        </p>

        <section className="mt-7">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Everything in this window
          </h2>
          <div className="mef-card mt-2 grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
            {FUNNEL_STAGES.map((stage) => {
              const rates = ratesOf(totals);
              const rate = stage.from ? formatRate(rates[stage.key] ?? null) : null;
              return (
                <div key={stage.key} data-total={stage.key} data-total-value={totals[stage.key]}>
                  <p className="text-2xl font-semibold tabular-nums text-[#1B3A2D]">
                    {totals[stage.key]}
                  </p>
                  <p className="text-xs text-[#6B7A72]">{stage.label}</p>
                  {rate ? (
                    <p className="mt-0.5 text-[11px] tabular-nums text-[#1B3A2D]/70">
                      {rate} of {FUNNEL_STAGES.find((s) => s.key === stage.from)?.label.toLowerCase()}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[#6B7A72]">
            Every column follows the same people. The window picks the arrivals that landed inside
            it, and each later column counts what those same arrivals went on to do, whenever they
            did it. An account created with no arrival at all has no landing time, so it is placed
            by the day the account was created and can only ever reach the last two columns.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            By {GROUP_BY_LABEL[view.groupBy].toLowerCase()}
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[#6B7A72]">
            {GROUP_BY_DEFINITION[view.groupBy]}
          </p>
          <div className="mef-card mt-2 overflow-x-auto p-2">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-b border-[#1B3A2D]/10">
                  <th className={HEAD}>{GROUP_BY_LABEL[view.groupBy]}</th>
                  {FUNNEL_STAGES.map((stage) => (
                    <th key={stage.key} className={`${HEAD} text-right`} scope="col">
                      {stage.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((row) => (
                  <tr
                    key={row.key}
                    data-row-kind={row.kind}
                    className={`border-b border-[#1B3A2D]/5 last:border-0 ${
                      row.kind === 'named' ? '' : 'bg-[#1B3A2D]/[0.02]'
                    }`}
                  >
                    <GroupCell row={row} />
                    {FUNNEL_STAGES.map((stage) => (
                      <StageCell key={stage.key} counts={row} stageKey={stage.key} />
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-[#1B3A2D]/15">
                  <td className={`${CELL} font-semibold`}>Total</td>
                  {FUNNEL_STAGES.map((stage) => (
                    <td
                      key={stage.key}
                      className={`${CELL} text-right font-semibold tabular-nums`}
                      data-total-row={stage.key}
                    >
                      {totals[stage.key]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[#6B7A72]">
            {producing} {producing === 1 ? 'row has' : 'rows have'} produced an arrival in this
            window and {silent} {silent === 1 ? 'has' : 'have'} produced none. A row at zero is a
            real answer: the code exists, the card is out there, and nobody has used it.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#6B7A72]">
            <span className="font-medium text-[#1B3A2D]">Untracked</span> holds arrivals that
            carried nothing identifying at all, and accounts created without ever coming through the
            public entry experience. It is here so the totals are reality rather than only the part
            of reality that was tracked.{' '}
            <span className="font-medium text-[#1B3A2D]">Tracked, nothing for this grouping</span>{' '}
            is different: those arrivals do carry a source, they just carry nothing for the
            dimension being asked about.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            What each column counts
          </h2>
          <ul className="mef-card mt-2 divide-y divide-[#1B3A2D]/5 p-2">
            {FUNNEL_STAGES.map((stage) => (
              <li key={stage.key} className="px-3 py-2.5">
                <p className="text-sm font-medium text-[#1B3A2D]">{stage.label}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#6B7A72]">
                  {STAGE_DEFINITION[stage.key]}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-relaxed text-[#6B7A72]">
            A percentage under a number is the conversion from the column to its left. A stage that
            nobody has reached shows no percentage at all, rather than nought per cent, because
            those two say completely different things.
          </p>
        </section>

        <section className="mt-8 pb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            The links, and the rest of the picture
          </h2>
          <Link
            href={'/admin/acquisition/links' as Route}
            className="mef-focus-ring mt-3 block rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
          >
            <p className="text-[15px] font-medium text-[#1B3A2D]">Build a tracking link</p>
            <p className="mt-1 text-sm text-[#6B7A72]">
              Make a full link with its campaign and creative, and record who its code stands for
              and where they are, from one form. Never type one by hand.
            </p>
          </Link>
          <Link
            href={'/admin/acquisition/patterns' as Route}
            className="mef-focus-ring mt-3 block rounded-[28px] bg-white p-5 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition hover:bg-[#FAFAF8]"
          >
            <p className="text-[15px] font-medium text-[#1B3A2D]">Which patterns are coming back</p>
            <p className="mt-1 text-sm text-[#6B7A72]">
              Whether the rules are producing a spread or funnelling everybody into one answer. Kept
              off this report on purpose: a result pattern is not funnel data.
            </p>
          </Link>

          <p className="mt-5 text-[13px] leading-relaxed text-[#6B7A72]">
            Every registered code, and the plain link that carries it. A code is permanent once a
            link is printed or handed out, so relabel a slot rather than renaming its code.
          </p>
          <ul className="mef-card mt-2 divide-y divide-[#1B3A2D]/5 p-2">
            {sources.map((source) => (
              <li key={source.code} className="px-3 py-2.5">
                <p className="text-sm font-medium text-[#1B3A2D]">
                  {source.label}
                  {source.is_test && (
                    <span className="ml-2 rounded-full bg-[#1B3A2D]/8 px-2 py-0.5 text-[11px] font-semibold text-[#6B7A72]">
                      test
                    </span>
                  )}
                </p>
                <p className="mt-0.5 break-all font-mono text-xs text-[#6B7A72]">
                  /energy/{source.code}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
