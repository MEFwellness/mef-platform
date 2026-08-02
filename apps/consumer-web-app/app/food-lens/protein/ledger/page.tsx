import Link from 'next/link';
import type { Route } from 'next';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  getProteinLedgerTodayAction,
  getProteinLedgerHistoryAction,
} from '@/app/actions/protein-ledger';
import { ProteinLedgerProgress } from '@/components/protein-ledger/ProteinLedgerProgress';
import { ProteinEntryLanes } from '@/components/protein-ledger/ProteinEntryLanes';
import { ProteinLedgerEntries, type LedgerEntryRow } from '@/components/protein-ledger/ProteinLedgerEntries';
import { ProteinLedgerHistory } from '@/components/protein-ledger/ProteinLedgerHistory';
import { resolveLedgerTargetDisplay } from '@/lib/protein/ledger';
import { Fade } from '@/components/motion';

export default async function ProteinLedgerPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [today, history] = await Promise.all([
    getProteinLedgerTodayAction(),
    getProteinLedgerHistoryAction(),
  ]);
  if (!today) redirect('/login');

  const entryRows: LedgerEntryRow[] = today.entries.map((e) => ({
    id: e.id,
    productName: e.productName,
    manualLabel: e.manual_label,
    servings: e.servings,
    consumedAt: e.consumed_at,
    proteinGrams: e.proteinGrams,
    source: e.source,
  }));

  const targetDisplay = resolveLedgerTargetDisplay(today.targetState);
  const targetGrams = targetDisplay.mode === 'active' ? targetDisplay.targetGrams : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pl-28">
        {/* Root Motion System proof-of-concept (Prompt 1): a plain page-level
            fade-in via the new shared <Fade> component, replacing what was
            previously an unanimated static mount. Deliberate tier (450ms
            ease-out), respects prefers-reduced-motion automatically. */}
        <Fade>
          <Link
            href={'/food-lens' as Route}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#6B7A72] hover:text-[#1B3A2D]"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Back to Food Lens
          </Link>

          <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D]">
            Protein ledger
          </h1>

          <div className="mt-4 space-y-4">
            <ProteinLedgerProgress targetState={today.targetState} totalGrams={today.totalGrams} />
            <ProteinEntryLanes />
            <ProteinLedgerEntries entries={entryRows} />
            <ProteinLedgerHistory days={history} targetGrams={targetGrams} />
          </div>
        </Fade>
      </main>
    </div>
  );
}
