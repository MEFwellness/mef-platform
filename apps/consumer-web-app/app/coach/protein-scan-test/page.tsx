/**
 * THROWAWAY TEST PAGE — Protein Phase 1b scouting only. Not linked from any
 * navigation; coach-only (also gated by middleware.ts's blanket /coach/*
 * coach-role check). Proves camera → barcode → Your Move nutrition lookup →
 * protein grams works on a real device. Delete this page,
 * components/protein-scan-test/, and app/actions/proteinScanTest.ts once
 * the real protein ledger is built.
 */

import { redirect } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { hasActiveRole } from '@/lib/auth/guards';
import { BackButton } from '@/components/BackButton';
import { ProteinScanTestClient } from '@/components/protein-scan-test/ProteinScanTestClient';

export default async function ProteinScanTestPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const isCoach = await hasActiveRole(supabase, user.id, 'coach');
  if (!isCoach) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-16 pt-safe-header sm:px-6">
        <BackButton fallbackHref="/coach" label="Coach Dashboard" />

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#B45309]/10 px-3 py-2 text-[#B45309]">
          <FlaskConical className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-wider">
            Test page — not part of the product, deleted once the protein ledger ships
          </p>
        </div>

        <h1 className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Protein scan scouting
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Point the camera at a packaged food&apos;s barcode. This calls Your Move&apos;s food
          lookup directly and shows protein grams per serving — nothing is saved.
        </p>

        <div className="mt-5">
          <ProteinScanTestClient />
        </div>
      </main>
    </div>
  );
}
