/**
 * Camera-tilt gating — a device-orientation signal, deliberately kept
 * separate from poseValidation.ts (which is landmark-only) since "is the
 * phone itself level" is a completely different kind of measurement than
 * "is the person's body aligned." hooks/useDeviceTilt.ts is the only
 * caller that ever has real `beta`/`gamma` readings; this stays pure so
 * both the geometry and the thresholds are unit-testable without a
 * DeviceOrientationEvent.
 *
 * ============================================================
 * THE BUG THIS FILE USED TO HAVE (real-phone testing, 2026-08-15)
 * ============================================================
 * This file used to treat `gamma` AS the phone's side-to-side roll and
 * `beta - 90` as its forward/back lean. The second was right. The first was
 * wrong, and it was wrong in the exact orientation the capture screen uses,
 * which is why a level, stationary phone was told it was tilted and the
 * guidance looped.
 *
 * DeviceOrientationEvent reports intrinsic Z-X'-Y'' Tait-Bryan angles: the
 * device's rotation is Rz(alpha) then Rx(beta) then Ry(gamma). That
 * decomposition is only well behaved away from beta = 90 degrees, and
 * beta = 90 degrees is precisely a phone standing upright in portrait,
 * which is what this assessment asks for. At that attitude the convention
 * is in gimbal lock: the alpha and gamma rotations act about the same
 * physical (vertical) axis, so `gamma` stops describing roll at all and
 * starts describing which way the phone is AIMED horizontally.
 *
 * Two consequences, both of which were observed:
 *   - A perfectly level phone simply pointed 20 degrees off dead ahead
 *     reports gamma = -20 and was told "Level your phone."
 *   - A phone genuinely rolled by even 1 degree reports gamma = 90 (and
 *     beta = 89). The old check saw a 90 degree tilt for a 1 degree
 *     problem, and both readings jump discontinuously near the
 *     singularity, so tiny hand movements swung the verdict wildly.
 *
 * The fix is to stop reading a single Euler angle and instead work out
 * where gravity actually points relative to the device, which is well
 * defined everywhere. See deviceTiltAngles() below.
 *
 * ============================================================
 * TOLERANCES
 * ============================================================
 * Every angle postureMeasurements.ts computes assumes the camera was in
 * the same physical position each time a member is captured, so this is a
 * repeatability requirement rather than a coarse usability screen. It was
 * previously +/-1 degree roll and +/-2 degrees pitch, which was not
 * achievable by a person propping a real phone against a real object, and
 * combined with the broken roll math above made the gate unpassable. It is
 * now +/-3 degrees roll and +/-5 degrees pitch: still tight enough to keep
 * two assessments comparable, loose enough that a phone leaning back
 * slightly in a stand passes.
 *
 * These remain UX/engineering screening bounds chosen for repeatability,
 * not derived from any measurement standard, the same caveat as every
 * threshold in poseValidation.ts and postureMeasurements.ts.
 */

/** Degrees of side-to-side roll tolerated from level before capture is blocked. */
export const ROLL_TOLERANCE_DEGREES = 3;
/** Degrees of forward/back lean tolerated from vertical before capture is blocked. */
export const PITCH_TOLERANCE_DEGREES = 5;

/**
 * Extra degrees past the tolerance before an already-satisfied tilt check
 * counts as GENUINELY broken rather than jitter. Used by
 * lib/body-assessment/captureGate.ts to decide whether to interrupt a
 * later step and send the member back here.
 */
export const TILT_RELEASE_MARGIN_DEGREES = 2;

/** Past this much lean, naming a direction and a number is less useful than just saying to stand the phone up. */
const GROSS_PITCH_DEGREES = 20;

export type DeviceTiltAngles = {
  /**
   * Side-to-side roll in degrees, 0 when the top of the phone points
   * straight up. Positive means world-up leans toward the screen's right,
   * that is, the phone's right side is high and its top has fallen to the
   * left.
   */
  rollDegrees: number;
  /**
   * Forward/back lean in degrees, 0 when the phone stands perfectly
   * vertical. Positive means the top of the phone has tipped toward the
   * member (the screen tilts to face downward); negative means the top has
   * tipped away (a phone leaning back in a stand). This matches the
   * `beta - 90` convention migration 103 already stores, and is exactly
   * equal to it whenever the phone is not also panned, so previously
   * stored pitch values remain comparable.
   */
  pitchDegrees: number;
};

/**
 * Turns a raw DeviceOrientationEvent reading into the two angles a person
 * would actually recognize as tilt.
 *
 * The method: `beta` and `gamma` together fix where world "up" points in
 * the device's own axes (+x screen-right, +y screen-top, +z out of the
 * screen). That gravity vector is well defined at every attitude,
 * including the upright-portrait one where the Euler angles themselves
 * degenerate. Roll is then how far that vector leans from the screen's up
 * direction, and pitch is how far it leans out of the screen plane.
 * `alpha` is deliberately unused: it is compass heading, which has no
 * bearing on whether the phone is level.
 *
 * `screenAngleDegrees` is `screen.orientation.angle`, so roll stays
 * measured against whatever edge is currently the top of the interface.
 * The assessment runs in portrait (angle 0), where this reduces to
 * measuring against the phone's own top edge.
 *
 * Returns null when either reading is missing, which callers treat as
 * "tilt not enforced" rather than "tilt failed", the same graceful
 * degradation this module has always had.
 */
export function deviceTiltAngles(
  betaDegrees: number | null,
  gammaDegrees: number | null,
  screenAngleDegrees = 0
): DeviceTiltAngles | null {
  if (betaDegrees === null || gammaDegrees === null) return null;
  if (!Number.isFinite(betaDegrees) || !Number.isFinite(gammaDegrees)) return null;

  const toRad = Math.PI / 180;
  const beta = betaDegrees * toRad;
  const gamma = gammaDegrees * toRad;
  const screen = screenAngleDegrees * toRad;

  // World "up" expressed in device axes: the third column of the inverse
  // of Rz(alpha) Rx(beta) Ry(gamma), which alpha drops out of entirely.
  const upX = -Math.sin(gamma) * Math.cos(beta);
  const upY = Math.sin(beta);
  const upZ = Math.cos(gamma) * Math.cos(beta);

  // The interface's own up and right directions, in the same device axes.
  const screenUpX = -Math.sin(screen);
  const screenUpY = Math.cos(screen);
  const screenRightX = Math.cos(screen);
  const screenRightY = Math.sin(screen);

  const alongRight = upX * screenRightX + upY * screenRightY;
  const alongUp = upX * screenUpX + upY * screenUpY;

  const rollDegrees = Math.atan2(alongRight, alongUp) / toRad;
  const pitchDegrees = Math.asin(Math.max(-1, Math.min(1, -upZ))) / toRad;

  return { rollDegrees, pitchDegrees };
}

/** Which specific tilt check is failing, so the caller can show one instruction rather than a generic complaint. */
export type TiltFailure = 'roll' | 'pitch';

export type TiltCheckResult = {
  ok: boolean;
  /** Member-facing correction naming the direction to move and roughly how far. Empty when passing. */
  message: string;
  /** The failing axis, or null when passing. */
  failing: TiltFailure | null;
  /** Signed degrees the failing axis is off target by, 0 when passing. */
  offByDegrees: number;
  /** True when the failure is large enough to interrupt a later gate step rather than being absorbed as jitter. */
  brokenBadly: boolean;
};

const PASSING: TiltCheckResult = {
  ok: true,
  message: '',
  failing: null,
  offByDegrees: 0,
  brokenBadly: false,
};

function describeRoll(rollDegrees: number): string {
  const amount = Math.round(Math.abs(rollDegrees));
  // Positive roll means the phone's right side is high, so its top has
  // fallen to the left and needs bringing back to the right.
  const direction = rollDegrees > 0 ? 'right' : 'left';
  return `Turn the top of the phone to the ${direction}, about ${amount} degrees.`;
}

function describePitch(pitchDegrees: number): string {
  if (Math.abs(pitchDegrees) > GROSS_PITCH_DEGREES) {
    return 'Stand the phone upright so it faces you straight on.';
  }
  const amount = Math.round(Math.abs(pitchDegrees));
  // Positive pitch means the top has tipped toward the member, so it needs
  // tipping back the other way.
  return pitchDegrees > 0
    ? `Tilt the top of the phone back, about ${amount} degrees.`
    : `Tilt the top of the phone forward, about ${amount} degrees.`;
}

/**
 * The gate decision for one frame. Roll is reported before pitch when both
 * are out, since a rolled phone tips the whole image and is the more
 * consequential of the two for measurement.
 */
export function evaluateCameraTilt(
  angles: DeviceTiltAngles | null,
  /**
   * Whether the tilt check was already satisfied on the previous frame. A
   * phone that has been set down and accepted still drifts by a fraction
   * of a degree, and re-raising a correction the member has already acted
   * on for that reads as the app changing its mind, so an ALREADY-PASSING
   * check has to break by TILT_RELEASE_MARGIN_DEGREES before it speaks up
   * again. A check that has not been satisfied yet gets no such grace.
   */
  wasPassing = false
): TiltCheckResult {
  if (!angles) return PASSING;

  const { rollDegrees, pitchDegrees } = angles;
  const grace = wasPassing ? TILT_RELEASE_MARGIN_DEGREES : 0;

  if (Math.abs(rollDegrees) > ROLL_TOLERANCE_DEGREES + grace) {
    return {
      ok: false,
      message: describeRoll(rollDegrees),
      failing: 'roll',
      offByDegrees: rollDegrees,
      brokenBadly: Math.abs(rollDegrees) > ROLL_TOLERANCE_DEGREES + TILT_RELEASE_MARGIN_DEGREES,
    };
  }

  if (Math.abs(pitchDegrees) > PITCH_TOLERANCE_DEGREES + grace) {
    return {
      ok: false,
      message: describePitch(pitchDegrees),
      failing: 'pitch',
      offByDegrees: pitchDegrees,
      brokenBadly: Math.abs(pitchDegrees) > PITCH_TOLERANCE_DEGREES + TILT_RELEASE_MARGIN_DEGREES,
    };
  }

  return PASSING;
}
