/**
 * Distribution card task (2026-07-28): the old three-up Streak/Check-ins/
 * Avg Energy stat row directly below Trends was removed per that task's
 * instruction, after confirming each of the three numbers elsewhere in
 * the app first:
 *  - Streak: a real, literal streak count (same definition — see
 *    lib/ai/agents/accountability.ts's currentStreakLength, algorithmically
 *    identical to this file's former calculateStreak) appears in real
 *    narrative messages on the Today page (lib/feed/streakIntelligence.ts's
 *    buildStreakMessage, e.g. "You've checked in 3 days in a row.").
 *  - Check-ins: a real cumulative check-in count (totalCheckins, all-time
 *    rather than this card's own 30-day window) appears on the Today
 *    page's Accomplished zone. Framed differently (all-time vs. last 30
 *    days), but a real, query-backed number, not absent from the app.
 *  - Avg Energy: found NO other display of an average-energy figure
 *    anywhere in the app (Root's energy forecast averages internally but
 *    never surfaces "your average is X" as a stat). Per the task's own
 *    instruction ("if any one of them does not [appear elsewhere], leave
 *    that number out of the deletion"), Avg Energy is kept — just as its
 *    own small stat, not a three-up row anymore, since the other two are
 *    gone.
 *
 * app/progress/streak.ts (calculateStreak) is deleted outright along with
 * this — it had exactly one consumer (this page) and no longer has any.
 */
export function ConsistencyPanel({ averageEnergy }: { averageEnergy: number | null }) {
  return (
    <section className="mt-5 rounded-[28px] border border-[#1B3A2D]/10 bg-white p-6">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
        Avg energy
      </p>
      {averageEnergy !== null ? (
        <p className="mt-2 text-2xl font-semibold text-[#1B3A2D]">
          {averageEnergy.toFixed(1)}
          <span className="text-sm font-normal text-[#6B7A72]"> / 5</span>
          <span className="ml-2 text-xs font-normal text-[#6B7A72]">
            in the last 30 recorded days
          </span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-[#6B7A72]">Not enough data</p>
      )}
    </section>
  );
}
