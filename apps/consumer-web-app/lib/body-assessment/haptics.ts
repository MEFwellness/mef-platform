/**
 * Subtle haptic feedback for the guided capture flow — a pure
 * progressive-enhancement layer, not a signal anything else depends on.
 * `navigator.vibrate` is Android-Chrome-family only (no iOS Safari
 * support as of this writing); every call here is feature-detected and
 * silently a no-op everywhere else, exactly like cameraTilt.ts's `null`
 * degradation. Deliberately generic (not posture-specific) so any future
 * Body Intelligence Engine module's capture flow can reuse the same
 * three-moment vocabulary (lock, confirm, capture) rather than each
 * module inventing its own vibration pattern.
 */

export function triggerHaptic(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Vibration is a progressive enhancement only — never let a platform
    // quirk (e.g. a permissions-policy block in an iframe) surface as an error.
  }
}

/** A single short, light tick — used the moment posture/alignment is first confidently locked. */
const LOCK_ACQUIRED_PATTERN = 12;
/** A soft double-tap — used when a correction is resolved (e.g. "off_center" clears). */
const CORRECTION_RESOLVED_PATTERN = [10, 60, 10];
/** A firmer double-pulse — the capture itself, distinct enough to feel like a shutter. */
const CAPTURED_PATTERN = [16, 45, 24];

export const HAPTIC_PATTERNS = {
  lockAcquired: LOCK_ACQUIRED_PATTERN,
  correctionResolved: CORRECTION_RESOLVED_PATTERN,
  captured: CAPTURED_PATTERN,
} as const;
