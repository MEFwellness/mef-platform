'use client';

/**
 * Live movement logging — "log it when it happens" rather than trying to
 * reconstruct the whole day's activity from memory during a later
 * check-in. Every log writes one movement_logged event through
 * app/actions/events.ts (lib/events/service.ts is the one place that
 * inserts into member_wellness_events). The "When" selector lets a member
 * log something that already happened a bit ago — occurred_at is
 * backdated accordingly, never just "now."
 */

import { useState, useTransition } from 'react';
import { Footprints, Check } from 'lucide-react';
import { logMovementEvent, type MovementType } from '@/app/actions/events';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  walk: 'Walk',
  stretch: 'Stretch',
  workout: 'Workout',
  other: 'Other',
};

const MOVEMENT_TYPES: MovementType[] = ['walk', 'stretch', 'workout', 'other'];
const WHEN_OPTIONS = [
  { label: 'Just now', minutesAgo: 0 },
  { label: '30 min ago', minutesAgo: 30 },
  { label: '1 hour ago', minutesAgo: 60 },
  { label: '2 hours ago', minutesAgo: 120 },
];

export function MovementLogger({ todaysCount }: { todaysCount: number }) {
  const [open, setOpen] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>('walk');
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [justLogged, setJustLogged] = useState(false);

  function handleLog() {
    startTransition(async () => {
      const result = await logMovementEvent(movementType, null, minutesAgo);
      if (!result.error) {
        setJustLogged(true);
        setOpen(false);
        setTimeout(() => setJustLogged(false), 2500);
      }
    });
  }

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Footprints className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Movement</p>
        </div>
        <p className="text-xs text-[#6B7A72]">
          {todaysCount > 0 ? `${todaysCount} logged today` : 'None logged yet'}
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30"
        >
          {justLogged ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" /> Logged
            </>
          ) : (
            'Log movement'
          )}
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {MOVEMENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setMovementType(type)}
                aria-pressed={movementType === type}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                  movementType === type
                    ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                    : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/25'
                }`}
              >
                {MOVEMENT_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {WHEN_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setMinutesAgo(option.minutesAgo)}
                aria-pressed={minutesAgo === option.minutesAgo}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  minutesAgo === option.minutesAgo
                    ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                    : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:border-[#1B3A2D]/25'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleLog}
              disabled={isPending}
              className="flex-1 rounded-2xl bg-[#1B3A2D] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-2xl border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/30"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
