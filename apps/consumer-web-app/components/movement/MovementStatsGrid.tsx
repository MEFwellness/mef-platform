import { Gauge, Target } from 'lucide-react';
import type { MovementWeeklyGoal } from '@mef/shared-types-contracts';
import { movementScoreDisplay } from '@/lib/movement/scoreDisplay';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
/**
 * The floor exists so two tiles side by side are the same height. On its
 * own, across the full width, it is 172px of card holding two short lines
 * and a 2px bar — and because the bar is pushed down by `mt-auto`, it ends
 * up parked on the card's bottom edge with a hand's width of nothing above
 * it. Photographed on /movement, where the score tile is usually absent
 * and Weekly Goal is usually alone.
 */
const TRACKER_CARD = `${CARD} flex flex-col p-5`;
const PAIRED_TRACKER_CARD = `${TRACKER_CARD} min-h-[172px]`;

export function MovementStatsGrid({
  movementScore,
  weeklyGoal,
}: {
  movementScore: number | null;
  weeklyGoal: MovementWeeklyGoal;
}) {
  const weeklyPercent = Math.min(
    100,
    Math.round((weeklyGoal.completedThisWeek / weeklyGoal.targetSessionsPerWeek) * 100)
  );

  // One place decides whether this tile exists and what it says. The
  // development-status caveat that used to sit under the number is gone:
  // how finished a feature is, is not something a member should be reading
  // on her own screen.
  const scoreTile = movementScoreDisplay(movementScore);
  const tileClass = scoreTile ? PAIRED_TRACKER_CARD : TRACKER_CARD;

  return (
    <div className={`grid gap-5 ${scoreTile ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {scoreTile && (
        <div className={tileClass}>
          <div className="flex items-center gap-2 text-[#6B7A72]">
            <Gauge className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            <p className="text-sm font-semibold uppercase tracking-wider">{scoreTile.heading}</p>
          </div>
          {scoreTile.value !== null ? (
            <>
              <p className="mt-3 text-2xl font-semibold text-[#1B3A2D]">
                {scoreTile.value}
                <span className="text-sm font-normal text-[#6B7A72]"> / 100</span>
              </p>
              {scoreTile.caption && (
                <p className="mt-auto pt-3 text-xs text-[#6B7A72]">{scoreTile.caption}</p>
              )}
            </>
          ) : (
            <p className="mt-auto text-sm text-[#6B7A72]">{scoreTile.emptyStatement}</p>
          )}
        </div>
      )}

      <div className={tileClass}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Target className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Weekly Goal</p>
        </div>
        <p className="mt-3 text-2xl font-semibold text-[#1B3A2D]">
          {weeklyGoal.completedThisWeek}
          <span className="text-sm font-normal text-[#6B7A72]">
            {' '}
            of {weeklyGoal.targetSessionsPerWeek} sessions
          </span>
        </p>
        <div className="mt-auto pt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFE9DB]">
            <div
              className="h-full rounded-full bg-[#1B3A2D]"
              style={{ width: `${weeklyPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
