/**
 * The acquisition funnel, for the one experiment currently running.
 *
 * WHY THIS SCREEN EXISTS. The goal is a hundred real people through one
 * path, and the only question worth asking of a hundred people is which
 * individual source sends the ones who finish. That question is a join
 * across four tables, and nobody is going to write it by hand every week.
 *
 * WHAT IT SHOWS AND WHAT IT DOES NOT. Seven counts per source, plus the
 * spread of patterns, plus the ready-made links to hand out. It does not
 * show a single visitor's answers, a single visitor's email, or anything
 * that would turn a funnel screen into a place to read what strangers said
 * about their sleep. A coach who needs to reach a lead already has the
 * leads surface for that.
 *
 * TEST TRAFFIC IS EXCLUDED, AND THE SCREEN SAYS SO. Excluded by default,
 * with the hidden count printed rather than silently dropped, per the rule
 * a filtered admin list says how much it filtered.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { BackButton } from '@/components/BackButton';
import {
  engagedSessionIds,
  listFunnelRows,
  patternSpread,
  rollUpBySource,
  totalsOf,
} from '@/lib/public-entry/funnel';
import { ENERGY_PATTERN_COPY } from '@/lib/public-entry/copy';
import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';

export const dynamic = 'force-dynamic';

const HEAD = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7A72]';
const CELL = 'px-3 py-2 text-sm text-[#1B3A2D] whitespace-nowrap';

const STEPS = [
  { key: 'reached', label: 'Reached' },
  { key: 'started', label: 'Started' },
  { key: 'completed', label: 'Finished' },
  { key: 'engagedResult', label: 'Read result' },
  { key: 'leads', label: 'Left email' },
  { key: 'clickedToApp', label: 'Clicked in' },
  { key: 'accounts', label: 'Account' },
] as const;

export default async function AcquisitionFunnelPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');

  const [allRows, engaged, sourcesResult] = await Promise.all([
    listFunnelRows(supabase, { includeTest: true }),
    engagedSessionIds(supabase),
    supabase
      .from('public_entry_sources')
      .select('code, label, channel, is_test, active')
      .eq('active', true)
      .order('channel')
      .order('code'),
  ]);

  const realRows = allRows.filter((row) => !row.isTest);
  const hiddenCount = allRows.length - realRows.length;
  const bySource = rollUpBySource(realRows, engaged);
  const totals = totalsOf(bySource);
  const patterns = patternSpread(realRows);
  const sources = (sourcesResult.data ?? []) as {
    code: string;
    label: string;
    channel: string;
    is_test: boolean;
  }[];

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-4xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/admin" label="Back to Admin" forceFallback />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
          Acquisition: Where Your Energy Goes
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">
          Every arrival at the public entry experience, by the individual source that sent it.
          Seven steps, in the order somebody moves through them. Nothing on this screen shows what
          any visitor answered.
        </p>
        <p className="mt-2 text-[13px] text-[#6B7A72]">
          {hiddenCount === 0
            ? 'No test traffic to hide. Every arrival below is real.'
            : `${hiddenCount} test ${hiddenCount === 1 ? 'arrival is' : 'arrivals are'} hidden from these numbers.`}
        </p>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Everything, together
          </h2>
          <div className="mef-card mt-2 grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.key}>
                <p className="text-2xl font-semibold text-[#1B3A2D]">{totals[step.key]}</p>
                <p className="text-xs text-[#6B7A72]">{step.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            By source
          </h2>
          {bySource.length === 0 ? (
            <p className="mef-card mt-2 p-5 text-sm text-[#6B7A72]">
              Nobody has arrived yet. The links are below.
            </p>
          ) : (
            <div className="mef-card mt-2 overflow-x-auto p-2">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr className="border-b border-[#1B3A2D]/10">
                    <th className={HEAD}>Source</th>
                    {STEPS.map((step) => (
                      <th key={step.key} className={`${HEAD} text-right`}>
                        {step.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bySource.map((row) => (
                    <tr key={row.sourceCode} className="border-b border-[#1B3A2D]/5 last:border-0">
                      <td className={CELL}>
                        <span className="font-medium">{row.sourceLabel}</span>
                        <span className="ml-2 text-xs text-[#6B7A72]">{row.sourceCode}</span>
                      </td>
                      {STEPS.map((step) => (
                        <td key={step.key} className={`${CELL} text-right tabular-nums`}>
                          {row[step.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Which patterns are coming back
          </h2>
          <p className="mt-1 text-[13px] text-[#6B7A72]">
            One question only: whether the rules are producing a spread, or funnelling everybody
            into one answer.
          </p>
          {patterns.length === 0 ? (
            <p className="mef-card mt-2 p-5 text-sm text-[#6B7A72]">
              Nobody has finished the nine questions yet.
            </p>
          ) : (
            <ul className="mef-card mt-2 divide-y divide-[#1B3A2D]/5 p-2">
              {patterns.map((entry) => (
                <li key={entry.patternKey} className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-[#1B3A2D]">
                    {ENERGY_PATTERN_COPY[entry.patternKey as PublicEntryPatternKey]?.title ??
                      entry.patternKey}
                  </span>
                  <span className="tabular-nums font-medium text-[#1B3A2D]">{entry.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8 pb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            The links
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6B7A72]">
            One per source. A code is permanent once a link is printed or handed out, so relabel a
            slot rather than renaming its code.
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
