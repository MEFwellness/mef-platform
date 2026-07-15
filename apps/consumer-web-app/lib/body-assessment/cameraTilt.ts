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
 * for "the phone is tilted sideways in its stand," which is what "camera
 * not heavily tilted" means for a standing posture photo.
 *
 * `beta` is front-back tilt (0 = flat on a table screen-up, 90 = phone
 * standing perfectly vertical facing the member). This app DOES gate on
 * it, deliberately loosely: a phone propped noticeably forward or
 * backward introduces real perspective foreshortening (the top or bottom
 * of the body reads closer to the camera than it is), which quietly
 * corrupts every vertical-angle measurement poseMetrics.ts computes —
 * worse than a body simply being off-center, since nothing about the
 * photo itself looks obviously wrong. The threshold stays generous
 * (members prop phones at a range of reasonable angles) — this rejects
 * only a phone lying nearly flat or leaning hard in either direction, not
 * ordinary stand/case propping.
 */

export type TiltCheckResult = { ok: boolean; message: string };

/** Degrees of roll before we consider the phone meaningfully tilted sideways — a UX screening bound, not derived from any measurement standard. */
const MAX_ROLL_DEGREES = 12;
/** `beta` reads ~90 when the phone stands vertical; degrees of deviation from that before forward/backward lean is considered heavy enough to distort the shot. Deliberately generous — see docblock above. */
const MAX_FORWARD_TILT_DEVIATION_DEGREES = 40;

export function evaluateCameraTilt(gammaDegrees: number | null, betaDegrees: number | null = null): TiltCheckResult {
  if (gammaDegrees !== null && Math.abs(gammaDegrees) > MAX_ROLL_DEGREES) {
    return { ok: false, message: 'Please hold your phone upright and level.' };
  }
  if (betaDegrees !== null && Math.abs(betaDegrees - 90) > MAX_FORWARD_TILT_DEVIATION_DEGREES) {
    return { ok: false, message: 'Prop your phone more upright, facing you directly.' };
  }
  return { ok: true, message: '' };
}
