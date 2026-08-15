'use client';

/**
 * The way out when the automatic facing check will not settle.
 *
 * A capture step whose gate cannot be satisfied leaves the member with
 * nothing to do but give up, which is exactly what the back view did
 * before lib/body-assessment/facing.ts was fixed: it waited for a
 * turned-away member's face landmarks to stop being reported, which never
 * happens, and looped forever. That specific cause is gone, but the shape
 * of the failure is worth defending against generally, so when framing,
 * distance and tilt have all been passing for a while and ONLY facing is
 * still refusing, this offers the member a way through.
 *
 * Deliberately a fallback and not a shortcut: it appears only after the
 * timeout, it says plainly that the check is struggling rather than
 * implying the member did something wrong, and taking it flags the capture
 * (migration 162) so a coach can see the orientation rested on the
 * member's word. Same shape and placement as ManualLevelBubble.tsx, which
 * solves the equivalent problem for a device with no orientation sensor.
 */

import { CheckCircle2 } from 'lucide-react';

export function ManualFacingConfirm({
  confirmed,
  onConfirm,
}: {
  confirmed: boolean;
  onConfirm: () => void;
}) {
  if (confirmed) {
    return (
      <div className="absolute inset-x-4 top-24 z-20 flex items-center gap-2 rounded-2xl bg-emerald-600/90 px-4 py-2.5 text-xs font-medium text-white">
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Position confirmed by you. Hold still.
      </div>
    );
  }

  return (
    <div className="absolute inset-x-4 top-20 z-20 rounded-2xl bg-black/75 p-4 text-center">
      <p className="text-xs leading-relaxed text-white">
        Facing check is struggling. If you are in position, tap Confirm and hold still.
      </p>
      <button
        type="button"
        onClick={onConfirm}
        className="mt-3 w-full rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
      >
        Confirm my position
      </button>
    </div>
  );
}
