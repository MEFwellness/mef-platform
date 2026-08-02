'use client';

/**
 * Root Motion System — low-power mode hook (Prompt 1), per
 * docs/motion-experience-bible.md §10 (Ambient Motion Rules). Returns
 * true when *ambient-only* decorative motion (Breathe, Float — never
 * core functional animation like a button press or a progress fill)
 * should be disabled. Three independent triggers, any one is enough:
 *
 * 1. `prefers-reduced-motion: reduce` — reuses useReducedMotion, the
 *    same accessibility signal every other animation in this app
 *    already respects.
 * 2. Low battery and not charging — the Battery Status API
 *    (`navigator.getBattery`), feature-detected: it's deprecated/
 *    removed in several browsers (notably Firefox and Safari never
 *    shipped it), so its absence is treated as "nothing to gate on,"
 *    never as an error or a false positive.
 * 3. A conservative low-end-device signal — `navigator.hardwareConcurrency`
 *    and `navigator.deviceMemory` (both non-standard, Chromium-only,
 *    feature-detected the same way), thresholded deliberately low
 *    (<=2) rather than a number like 4 that would misclassify a large
 *    share of ordinary mid-range phones as low-power. The Bible itself
 *    calls this the lowest-priority of the three triggers, since
 *    `prefers-reduced-motion` already covers the accessibility-critical
 *    case — this is a best-effort performance nicety on top of that,
 *    not load-bearing.
 */

import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

const LOW_BATTERY_THRESHOLD = 0.2;
const LOW_END_CORE_COUNT_THRESHOLD = 2;
const LOW_END_DEVICE_MEMORY_GB_THRESHOLD = 2;

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryManager>;
  deviceMemory?: number;
}

function readLowEndDeviceSignal(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as NavigatorWithBattery;
  const lowCoreCount =
    typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= LOW_END_CORE_COUNT_THRESHOLD;
  const lowDeviceMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= LOW_END_DEVICE_MEMORY_GB_THRESHOLD;
  return lowCoreCount || lowDeviceMemory;
}

export function useLowPowerMode(): boolean {
  const reducedMotion = useReducedMotion();
  const [batteryLow, setBatteryLow] = useState(false);
  const [lowEndDevice, setLowEndDevice] = useState(false);

  useEffect(() => {
    setLowEndDevice(readLowEndDeviceSignal());

    const nav = navigator as NavigatorWithBattery;
    if (!nav.getBattery) return;

    let battery: BatteryManager | undefined;
    let cancelled = false;

    const update = () => {
      if (battery && !cancelled) {
        setBatteryLow(battery.level <= LOW_BATTERY_THRESHOLD && !battery.charging);
      }
    };

    nav.getBattery().then((manager) => {
      if (cancelled) return;
      battery = manager;
      update();
      battery.addEventListener('levelchange', update);
      battery.addEventListener('chargingchange', update);
    });

    return () => {
      cancelled = true;
      battery?.removeEventListener('levelchange', update);
      battery?.removeEventListener('chargingchange', update);
    };
  }, []);

  return reducedMotion || batteryLow || lowEndDevice;
}
