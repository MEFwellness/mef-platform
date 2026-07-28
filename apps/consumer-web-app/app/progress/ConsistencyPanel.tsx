import { Flame } from 'lucide-react';

/**
 * Consistency — Progress page restructure. Collapses the three former
 * full-width cards (Current Streak, Check-Ins Logged, Average Energy)
 * into one horizontal three-up stat row. Same values, same underlying
 * queries (getRecentCheckins + the same streak calculation already used
 * on this page) — only the layout changed. Bordered rather than
 * shadowed, deliberately, so it reads differently from the shadowed
 * white cards above and below it (visual-variety requirement).
 */
export function ConsistencyPanel({
  streak,
  checkinCount,
  averageEnergy,
}: {
  streak: number;
  checkinCount: number;
  averageEnergy: number | null;
}) {
  return (
    <section className="mt-5 rounded-[28px] border border-[#1B3A2D]/10 bg-white p-6">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[#6B7A72]">
            <Flame className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-wider">Streak</p>
          </div>
          {streak > 0 ? (
            <p className="mt-2 text-2xl font-semibold text-[#1B3A2D]">
              {streak}
              <span className="text-sm font-normal text-[#6B7A72]">
                {' '}
                day{streak === 1 ? '' : 's'}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-[#6B7A72]">Check in to start</p>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
            Check-ins
          </p>
          <p className="mt-2 text-2xl font-semibold text-[#1B3A2D]">{checkinCount}</p>
          <p className="mt-0.5 text-xs text-[#6B7A72]">in the last 30 recorded days</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
            Avg energy
          </p>
          {averageEnergy !== null ? (
            <p className="mt-2 text-2xl font-semibold text-[#1B3A2D]">
              {averageEnergy.toFixed(1)}
              <span className="text-sm font-normal text-[#6B7A72]"> / 5</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-[#6B7A72]">Not enough data</p>
          )}
        </div>
      </div>
    </section>
  );
}
