import { Gauge, Target } from 'lucide-react';
import type { MovementWeeklyGoal } from '@mef/shared-types-contracts';
import { movementScoreLabel } from '@/lib/movement/score';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const TRACKER_CARD = `${CARD} flex min-h-[172px] flex-col p-5`;

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

  return (
    <div className="grid grid-cols-2 gap-5">
      <div className={TRACKER_CARD}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Gauge className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Movement Score</p>
        </div>
        {movementScore != null ? (
          <>
            <p className="mt-3 text-2xl font-semibold text-[#1B3A2D]">
              {movementScore}
              <span className="text-sm font-normal text-[#6B7A72]"> / 100</span>
            </p>
            <p className="mt-auto pt-3 text-xs text-[#6B7A72]">
              {movementScoreLabel(movementScore)}
            </p>
          </>
        ) : (
          <p className="mt-auto text-sm text-[#6B7A72]">Building your score</p>
        )}
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[#1B3A2D]/35">
          Early version, more depth coming
        </p>
      </div>

      <div className={TRACKER_CARD}>
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
