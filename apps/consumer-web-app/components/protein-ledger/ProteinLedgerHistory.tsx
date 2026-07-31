import type { DailyProteinTotal } from '@/lib/protein/ledger';

const CARD = 'rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDay(localDate: string): string {
  // Parsed as UTC-midnight-of-that-date, matching how the date string was
  // produced (lib/time/localDate.ts) — never re-interpreted in the
  // server's own timezone, which could otherwise shift the label a day.
  return new Date(`${localDate}T00:00:00.000Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
  });
}

/** Simple last-7-days view — each day's total vs. target, no trends or streaks yet (later phase). */
export function ProteinLedgerHistory({
  days,
  targetGrams,
}: {
  days: DailyProteinTotal[];
  targetGrams: number | null;
}) {
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Last 7 days</p>
      <div className="mt-4 space-y-2.5">
        {days.map((day) => {
          const pct =
            targetGrams && targetGrams > 0 ? Math.min(100, Math.round((day.totalGrams / targetGrams) * 100)) : 0;
          return (
            <div key={day.localDate} className="flex items-center gap-3">
              <span className="w-9 shrink-0 text-xs font-medium text-[#6B7A72]">
                {formatDay(day.localDate)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#1B3A2D]/[0.08]">
                {targetGrams ? (
                  <div className="h-full rounded-full bg-[#1B3A2D]" style={{ width: `${pct}%` }} />
                ) : null}
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-medium text-[#1B3A2D]">
                {day.totalGrams}g{targetGrams ? ` / ${targetGrams}g` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
