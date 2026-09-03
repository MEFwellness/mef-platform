/**
 * Which observational patterns the public experience is producing.
 *
 * WHY IT IS ITS OWN SCREEN NOW. It used to sit under the by-source funnel
 * on /admin/acquisition. That screen is now the acquisition report, and the
 * report shows behavioural funnel data only: never an answer, never a
 * response, never a result pattern. A pattern spread is a legitimate
 * question about whether the rules are working, and it is a DIFFERENT
 * question from where clicks came from, so it moved here rather than being
 * deleted or left to blur the report's own boundary.
 *
 * IT SHOWS COUNTS AND NOTHING ELSE. How many arrivals landed on each
 * pattern. Not who, not what anybody answered, and not a single visitor's
 * result. The one question it answers is whether the rules produce a spread
 * or funnel everybody into one answer.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { BackButton } from '@/components/BackButton';
import { listFunnelRows, patternSpread } from '@/lib/public-entry/funnel';
import { ENERGY_PATTERN_COPY } from '@/lib/public-entry/copy';
import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';

export const dynamic = 'force-dynamic';

export default async function AcquisitionPatternsPage() {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) redirect('/login');

  const isAdmin = await hasActiveRole(supabase, user.id, 'platform_administrator');
  if (!isAdmin) redirect('/dashboard');

  const rows = await listFunnelRows(supabase, { includeTest: false });
  const patterns = patternSpread(rows);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-4xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/admin/acquisition" label="Back to Acquisition" forceFallback />

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
          Which patterns are coming back
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#4F645A]">
          One question only: whether the rules are producing a spread, or funnelling everybody into
          one answer. Counts across every real arrival, with our own test traffic left out. Nothing
          here shows what any visitor answered.
        </p>

        {patterns.length === 0 ? (
          <p className="mef-card mt-6 p-5 text-sm text-[#6B7A72]">
            Nobody has finished the nine questions yet.
          </p>
        ) : (
          <ul className="mef-card mt-6 divide-y divide-[#1B3A2D]/5 p-2">
            {patterns.map((entry) => (
              <li key={entry.patternKey} className="flex justify-between px-3 py-2.5 text-sm">
                <span className="text-[#1B3A2D]">
                  {ENERGY_PATTERN_COPY[entry.patternKey as PublicEntryPatternKey]?.title ??
                    entry.patternKey}
                </span>
                <span className="tabular-nums font-medium text-[#1B3A2D]">{entry.count}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
