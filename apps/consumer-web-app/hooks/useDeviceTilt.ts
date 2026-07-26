'use client';

/**
 * Live phone-roll and forward-tilt readings for the camera-tilt gate
 * (lib/body-assessment/cameraTilt.ts owns the actual threshold/decision;
 * this hook only supplies the raw `gamma`/`beta` readings). Each is
 * independently `null` when DeviceOrientationEvent isn't available,
 * permission hasn't been granted, or no reading has arrived yet —
 * evaluateCameraTilt() already treats `null` as "pass" for either axis,
 * so tilt gating degrades gracefully to "not enforced" at the pure-function
 * level. CameraCapture.tsx is what actually turns "no sensor data" into
 * the manual bubble-level fallback (ManualLevelBubble.tsx) rather than
 * silently skipping the reproducibility gate — see `hasReading` below,
 * which is what lets it tell "no reading yet" apart from "never going to
 * get one."
 *
 * iOS Safari (13+) requires DeviceOrientationEvent.requestPermission() to
 * be called from within a user-gesture handler — a raw useEffect on
 * mount does not count and the call will silently do nothing there.
 * requestDeviceTiltPermission() is called from a prep-screen button tap
 * (AssessmentWizard.tsx's camera_positioning step) — a real user gesture —
 * before the camera step is ever reached.
 */

import { useEffect, useState } from 'react';

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/**
 * The outcome of requesting orientation-sensor access — distinct from a
 * plain boolean so the caller (AssessmentWizard.tsx's prep screen) can show
 * accurate copy: 'not_required' means this browser never gated access
 * behind an explicit prompt at all (most non-iOS browsers), not that
 * access was "granted" by anyone.
 */
export type OrientationPermissionStatus =
  | 'pending'
  | 'granted'
  | 'denied'
  | 'not_required'
  | 'unavailable';

/** Call from a user-gesture handler (a click) before the camera step — resolves to 'not_required' on browsers that never gate this behind an explicit prompt. */
export async function requestDeviceTiltPermission(): Promise<OrientationPermissionStatus> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return 'unavailable';
  }
  const ctor = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission;
  if (typeof ctor.requestPermission !== 'function') return 'not_required';
  try {
    const result = await ctor.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    console.error('[device-tilt] permission request failed', err);
    return 'denied';
  }
}

export type DeviceTiltReading = {
  gamma: number | null;
  beta: number | null;
  /** True once a real DeviceOrientationEvent has actually arrived this session — the signal CameraCapture.tsx uses to decide "sensors are working" vs. "no reading is ever coming, fall back to manual." Sticky: once true, stays true for the rest of the session. */
  hasReading: boolean;
};

export function useDeviceTilt(active: boolean): DeviceTiltReading {
  const [reading, setReading] = useState<DeviceTiltReading>({
    gamma: null,
    beta: null,
    hasReading: false,
  });

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;

    function handleOrientation(event: DeviceOrientationEvent) {
      if (typeof event.gamma !== 'number' && typeof event.beta !== 'number') return;
      setReading((prev) => ({
        gamma: typeof event.gamma === 'number' ? event.gamma : prev.gamma,
        beta: typeof event.beta === 'number' ? event.beta : prev.beta,
        hasReading: true,
      }));
    }

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [active]);

  return reading;
}
