import Link from 'next/link';
import type { Route } from 'next';
import type { ProteinSetupState } from '@/app/actions/protein';
import { resolveLedgerTargetDisplay } from '@/lib/protein/ledger';

const CARD = 'rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/**
 * Today's running total vs. target — mirrors ProteinProfileForm's
 * SummaryCard states (Phase 1a), since this reads the same
 * getMyProteinSetupState. The actual branching lives in
 * lib/protein/ledger.ts's resolveLedgerTargetDisplay (unit-tested there)
 * so the task's two hard rules — a pending-review target must never
 * render as active, and a safety-blocked member gets no setup nudge — are
 * provable without a browser.
 */
export function ProteinLedgerProgress({
  targetState,
  totalGrams,
}: {
  targetState: ProteinSetupState | null;
  totalGrams: number;
}) {
  const display = resolveLedgerTargetDisplay(targetState);

  return (
    <div className={CARD}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Today&apos;s protein
      </p>

      {display.mode !== 'active' ? (
        <p className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-4xl text-[#1B3A2D]">
          {totalGrams}g
        </p>
      ) : (
        <>
          <p className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-4xl text-[#1B3A2D]">
            {totalGrams}g
            <span className="ml-2 text-lg font-[family-name:var(--font-dm-sans)] font-medium text-[#6B7A72]">
              of {display.targetGrams}g
            </span>
          </p>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/[0.08]">
            <div
              className="h-full rounded-full bg-[#1B3A2D] transition-[width]"
              style={{
                width: `${display.targetGrams > 0 ? Math.min(100, Math.round((totalGrams / display.targetGrams) * 100)) : 0}%`,
              }}
            />
          </div>
          {display.suggestedRange && (
            <p className="mt-2 text-xs text-[#9AA79F]">
              Guidance range: {display.suggestedRange.low}–{display.suggestedRange.high}g
            </p>
          )}
        </>
      )}

      {display.mode === 'pending_review' && (
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Your coach is still setting up your target — your daily total will show progress against
          it once that&apos;s ready.
        </p>
      )}

      {display.showSetupNudge && (
        <Link
          href={'/food-lens/protein' as Route}
          className="mt-4 inline-block text-sm font-medium text-[#1B3A2D] underline underline-offset-2"
        >
          Set up your protein target
        </Link>
      )}
    </div>
  );
}
