'use client';

/**
 * Fallback for the camera-setup reproducibility gate (lib/body-assessment/
 * cameraTilt.ts) when no DeviceOrientation sensor reading is available on
 * this device/browser — permission was denied, the API doesn't exist, or
 * (on a browser that never gates it behind a permission prompt at all) no
 * event ever actually arrived. There is no live orientation data to draw a
 * moving bubble from in that situation, so this is a static spirit-level
 * illustration: the member is asked to physically level the phone using an
 * external reference (a level surface, a wall, a real spirit-level app on
 * another device) and then explicitly attest it's level and steady.
 *
 * CameraCapture.tsx treats a confirmed attestation the same as a passing
 * evaluateCameraTilt() result for gating purposes, but records the capture's
 * orientation_source as 'manual_fallback' (migration 103) rather than
 * 'sensor', with roll_degrees/pitch_degrees left null — there is no real
 * number to store, only a member's attestation, and that distinction
 * matters to a coach reviewing the capture later.
 */

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function ManualLevelBubble({
  confirmed,
  onConfirm,
}: {
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (confirmed) {
    return (
      <div className="absolute inset-x-4 top-24 z-20 flex items-center gap-2 rounded-2xl bg-emerald-600/90 px-4 py-2.5 text-xs font-medium text-white">
        <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Phone leveling confirmed manually: screening confidence noted as reduced.
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="absolute inset-x-4 top-24 z-20 rounded-2xl bg-amber-500/90 px-4 py-2.5 text-center text-xs font-semibold text-white"
      >
        Confirm your phone is level to continue
      </button>
    );
  }

  return (
    <div className="absolute inset-x-4 top-20 z-20 rounded-2xl bg-black/75 p-4 text-center">
      <svg
        viewBox="0 0 80 80"
        className="mx-auto h-14 w-14"
        aria-hidden="true"
      >
        <circle cx="40" cy="40" r="36" fill="none" stroke="#FBBF24" strokeWidth="3" />
        <circle cx="40" cy="40" r="34" fill="none" stroke="#FBBF24" strokeWidth="1" strokeDasharray="2 4" />
        <circle cx="40" cy="40" r="10" fill="#FBBF24" fillOpacity="0.85" />
        <line x1="40" y1="4" x2="40" y2="14" stroke="#FBBF24" strokeWidth="2" />
        <line x1="40" y1="66" x2="40" y2="76" stroke="#FBBF24" strokeWidth="2" />
        <line x1="4" y1="40" x2="14" y2="40" stroke="#FBBF24" strokeWidth="2" />
        <line x1="66" y1="40" x2="76" y2="40" stroke="#FBBF24" strokeWidth="2" />
      </svg>
      <p className="mt-2 text-xs leading-relaxed text-white">
        We can&apos;t read your phone&apos;s motion sensors on this device or browser. Prop your
        phone against a level surface or wall, or use a real spirit-level app, so it&apos;s upright
        and steady (like centering this bubble), then confirm below.
      </p>
      <button
        type="button"
        onClick={onConfirm}
        className="mt-3 w-full rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
      >
        Confirm phone is level and steady
      </button>
    </div>
  );
}
