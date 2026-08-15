'use client';

/**
 * A live spirit level for the phone itself, drawn from the real
 * orientation reading so it moves as the member moves the phone.
 *
 * This replaces a generic "level your phone" message that gave no way to
 * tell whether an adjustment helped. The bubble drifts toward the middle
 * as the phone approaches level and the ring turns green the moment both
 * axes are inside tolerance, so the member can see themselves getting
 * closer rather than guessing.
 *
 * Horizontal position tracks side-to-side roll, vertical position tracks
 * forward/back lean, each scaled so the edge of the ring is roughly three
 * times its own tolerance. Offsets are clamped, so a wildly wrong phone
 * parks the bubble at the rim instead of drawing it outside the circle.
 *
 * ManualLevelBubble.tsx is the sibling of this for devices that report no
 * orientation at all: same idea, but a static illustration and an explicit
 * member attestation, since there is nothing live to draw.
 */

import {
  ROLL_TOLERANCE_DEGREES,
  PITCH_TOLERANCE_DEGREES,
  type DeviceTiltAngles,
} from '@/lib/body-assessment/cameraTilt';

/** The rim of the ring sits at this multiple of a tolerance, so being just outside tolerance is a visible nudge off centre rather than an instant jump to the edge. */
const RIM_TOLERANCE_MULTIPLE = 3;

const RADIUS = 34;
const BUBBLE_RADIUS = 9;
/** How far the bubble's centre may travel before it would overhang the ring. */
const MAX_TRAVEL = RADIUS - BUBBLE_RADIUS - 2;

function offsetFor(degrees: number, toleranceDegrees: number): number {
  const fraction = degrees / (toleranceDegrees * RIM_TOLERANCE_MULTIPLE);
  return Math.max(-1, Math.min(1, fraction)) * MAX_TRAVEL;
}

export function TiltLevelIndicator({
  angles,
  level,
}: {
  angles: DeviceTiltAngles;
  /** Whether both axes are currently inside tolerance. Drives the colour only; the position is always the live reading. */
  level: boolean;
}) {
  // Roll positive means the phone's right side is high, so the bubble
  // rides toward the high side, the way a real spirit level behaves. For
  // lean there is no marble that would actually roll (a near-vertical
  // phone always slopes the same way in its own plane), so the convention
  // is simply that the bubble moves the way the top of the phone is
  // leaning: toward the member reads as down, away reads as up.
  const bubbleX = offsetFor(angles.rollDegrees, ROLL_TOLERANCE_DEGREES);
  const bubbleY = offsetFor(angles.pitchDegrees, PITCH_TOLERANCE_DEGREES);
  const stroke = level ? '#34D399' : '#FBBF24';

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1">
      <svg viewBox="-40 -40 80 80" className="h-16 w-16" aria-hidden="true">
        <circle cx="0" cy="0" r={RADIUS} fill="rgba(0,0,0,0.45)" stroke={stroke} strokeWidth="2" />
        {/* The target zone: inside this and the phone is within tolerance. */}
        <circle
          cx="0"
          cy="0"
          r={MAX_TRAVEL / RIM_TOLERANCE_MULTIPLE + BUBBLE_RADIUS}
          fill="none"
          stroke={stroke}
          strokeOpacity="0.45"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
        <line x1={-RADIUS} y1="0" x2={-RADIUS + 8} y2="0" stroke={stroke} strokeWidth="1.5" />
        <line x1={RADIUS - 8} y1="0" x2={RADIUS} y2="0" stroke={stroke} strokeWidth="1.5" />
        <line x1="0" y1={-RADIUS} x2="0" y2={-RADIUS + 8} stroke={stroke} strokeWidth="1.5" />
        <line x1="0" y1={RADIUS - 8} x2="0" y2={RADIUS} stroke={stroke} strokeWidth="1.5" />
        <circle
          cx={bubbleX}
          cy={bubbleY}
          r={BUBBLE_RADIUS}
          fill={stroke}
          fillOpacity={level ? 0.95 : 0.8}
          style={{ transition: 'cx 120ms linear, cy 120ms linear' }}
        />
      </svg>
      <p className="text-[10px] font-medium tabular-nums text-white/90">
        {level
          ? 'Phone is level'
          : `${Math.round(angles.rollDegrees)}° turn, ${Math.round(angles.pitchDegrees)}° lean`}
      </p>
    </div>
  );
}
