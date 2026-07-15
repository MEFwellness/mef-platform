'use client';

/**
 * Live phone-roll and forward-tilt readings for the camera-tilt gate
 * (lib/body-assessment/cameraTilt.ts owns the actual threshold/decision;
 * this hook only supplies the raw `gamma`/`beta` readings). Each is
 * independently `null` when DeviceOrientationEvent isn't available,
 * permission hasn't been granted, or no reading has arrived yet —
 * evaluateCameraTilt() already treats `null` as "pass" for either axis,
 * so tilt gating degrades gracefully to "not enforced" rather than
 * blocking capture on browsers/devices that can't supply it.
 *
 * iOS Safari (13+) requires DeviceOrientationEvent.requestPermission() to
 * be called from within a user-gesture handler — a raw useEffect on
 * mount does not count and the call will silently do nothing there. See
 * requestDeviceTiltPermission(), called from the wizard's own "Begin"
 * button tap (a real user gesture) before the camera step is ever
 * reached; if that permission was never granted (or this isn't iOS),
 * this hook simply never receives events, which is the intended graceful
 * degradation, not an error state.
 */

import { useEffect, useState } from 'react';

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** Call from a user-gesture handler (a click) before the camera step — a no-op on browsers that don't need explicit permission. */
export async function requestDeviceTiltPermission(): Promise<void> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
  const ctor = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission;
  if (typeof ctor.requestPermission !== 'function') return;
  try {
    await ctor.requestPermission();
  } catch (err) {
    console.error('[device-tilt] permission request failed', err);
  }
}

export type DeviceTiltReading = { gamma: number | null; beta: number | null };

export function useDeviceTilt(active: boolean): DeviceTiltReading {
  const [reading, setReading] = useState<DeviceTiltReading>({ gamma: null, beta: null });

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;

    function handleOrientation(event: DeviceOrientationEvent) {
      if (typeof event.gamma !== 'number' && typeof event.beta !== 'number') return;
      setReading((prev) => ({
        gamma: typeof event.gamma === 'number' ? event.gamma : prev.gamma,
        beta: typeof event.beta === 'number' ? event.beta : prev.beta,
      }));
    }

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [active]);

  return reading;
}
