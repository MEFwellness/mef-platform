'use client';

/**
 * The "beautiful capture confirmation" moment — a brief white flash (a
 * shutter, not an error state) immediately settled by a checkmark badge,
 * shown for CameraCapture.tsx's existing ANALYZING_DISPLAY_MS window over
 * the just-captured frame. Mounted only for that one short window by the
 * caller; this component owns no timing of its own beyond its CSS
 * animations (see app/globals.css's mef-capture-* keyframes), which both
 * naturally finish well within that window.
 */

import { Check } from 'lucide-react';

export function CaptureFlash() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className="mef-capture-flash absolute inset-0 bg-white" aria-hidden="true" />
      <div className="mef-capture-check relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-[0_4px_24px_-2px_rgba(16,185,129,0.6)]">
        <Check className="h-8 w-8 text-white" strokeWidth={2.75} aria-hidden="true" />
      </div>
    </div>
  );
}
