/**
 * Camera-tilt gating — a device-orientation signal, deliberately kept
 * separate from poseValidation.ts (which is landmark-only) since "is the
 * phone itself level" is a completely different kind of measurement than
 * "is the person's body aligned." hooks/useDeviceTilt.ts is the only
 * caller that ever has real `gamma`/`beta` readings; this stays pure so
 * both thresholds are unit-testable without DeviceOrientationEvent.
 *
 * DeviceOrientationEvent's `gamma` is left-right roll (-90..90, 0 =
 * level) when the phone is held upright in portrait — the natural signal
 * for "the phone is tilted sideways in its stand."
 *
 * `beta` is front-back tilt (0 = flat on a table screen-up, 90 = phone
 * standing perfectly vertical facing the member).
 *
 * ============================================================
 * REPRODUCIBILITY GATE (tightened from the original coarse screening bound)
 * ============================================================
 * This used to be a loose "reject only an obviously unusable shot" check
 * (+/-12 degrees roll, +/-40 degrees pitch). Every angle
 * postureMeasurements.ts computes assumes the camera was in the SAME
 * physical position every time a member is captured — a phone tilted even
 * a few degrees differently between two assessments introduces real
 * perspective distortion that has nothing to do with the member's actual
 * posture changing, and silently corrupts before/after comparison. So this
 * is now a precise repeatability requirement, not a coarse usability
 * screen: capture is blocked unless the phone reads within +/-1 degree of
 * level (roll) and +/-2 degrees of vertical (pitch). This is deliberately
 * strict — members are expected to prop the phone on a stand rather than
 * hand-hold it for a standing-photo capture.
 *
 * These are still UX/engineering screening bounds chosen for repeatability
 * purposes, not derived from any measurement standard — same caveat as
 * every threshold in poseValidation.ts and postureMeasurements.ts.
 */

export type TiltCheckResult = { ok: boolean; message: string };

/** Degrees of roll (gamma) tolerated from perfectly level before capture is blocked. */
export const ROLL_TOLERANCE_DEGREES = 1;
/** Degrees `beta` may deviate from 90 (perfectly vertical) before capture is blocked. */
export const PITCH_TOLERANCE_DEGREES = 2;

export function evaluateCameraTilt(
  gammaDegrees: number | null,
  betaDegrees: number | null = null
): TiltCheckResult {
  if (gammaDegrees !== null && Math.abs(gammaDegrees) > ROLL_TOLERANCE_DEGREES) {
    return {
      ok: false,
      message: 'Level your phone — even a slight tilt affects the measurement.',
    };
  }
  if (
    betaDegrees !== null &&
    Math.abs(betaDegrees - 90) > PITCH_TOLERANCE_DEGREES
  ) {
    return {
      ok: false,
      message: 'Aim your phone straight ahead — not tilted up or down.',
    };
  }
  return { ok: true, message: '' };
}
