'use client';

/**
 * Water and movement leave the check-in entirely (task requirement 4) —
 * "How much did you move your body today overall?" is now a Today-screen
 * quick tap, matching HydrationTracker's own treatment for water. Writes
 * through app/actions/events.ts's logMovementLevel, which resubmits
 * today's daily_checkins row with only movement_today overridden
 * (submitEveningBodyCheckin) — the same real column this question always
 * wrote to, never a new/parallel field.
 */

import { useEffect, useState, useTransition } from 'react';
import { Footprints, Check } from 'lucide-react';
import { logMovementLevel } from '@/app/actions/events';
import type { DailyCheckinInput } from '@mef/shared-types-contracts';

const TRACKER_CARD =
  'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] flex min-h-[172px] flex-col p-5';

export type MovementLevel = NonNullable<DailyCheckinInput['movement_today']>;

const LEVELS: { value: MovementLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'full_session', label: 'Full session' },
];

export function MovementLevelTracker({
  initialLevel,
  onLevelChange,
}: {
  initialLevel: MovementLevel | null;
  /** Today page redesign — same notification-only pattern as HydrationTracker's onTotalChange; never gates the tap handlers below. */
  onLevelChange?: (level: MovementLevel | null) => void;
}) {
  const [level, setLevel] = useState<MovementLevel | null>(initialLevel);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  useEffect(() => {
    onLevelChange?.(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  function pick(next: MovementLevel) {
    const previous = level;
    setLevel(next); // optimistic
    setError(false);
    startTransition(async () => {
      const result = await logMovementLevel(next);
      if (result.error) {
        setLevel(previous); // reconcile — a failed write shouldn't claim it saved
        setError(true);
      }
    });
  }

  return (
    <div className={TRACKER_CARD}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Footprints className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Movement</p>
      </div>
      <p className="mt-3 text-sm text-[#1B3A2D]">
        {level ? 'How much did you move today?' : 'Log how much you moved today, any time.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {LEVELS.map((option) => {
          const isSelected = level === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => pick(option.value)}
              disabled={isPending}
              aria-pressed={isSelected}
              className={`mef-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 ease-out disabled:opacity-60 ${
                isSelected
                  ? 'border-transparent bg-[#1B3A2D] text-white'
                  : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D]/75 hover:border-[#1B3A2D]/25'
              }`}
            >
              {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />}
              {option.label}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">Didn&apos;t save — try again.</p>}
      <div className="mt-auto pt-3 text-xs text-[#6B7A72]">
        {level ? 'Logged for today. Tap another level any time to update it.' : 'Nothing logged yet today.'}
      </div>
    </div>
  );
}
