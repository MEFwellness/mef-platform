'use client';

/**
 * The camera-opening sequence — shown only while real system readiness is
 * still catching up: camera permission/stream acquisition, the MediaPipe
 * WASM model downloading, and the brief window before a first confident
 * pose lock. Every stage below corresponds to an actual state
 * CameraCapture.tsx already tracks (phase/poseLoading/poseLoadError/
 * validation.core) — nothing here is a fixed-duration fake delay; the
 * overlay simply unmounts the instant the next real signal arrives (see
 * CameraCapture's `initializationStage` derivation).
 */

import { Loader2 } from 'lucide-react';

export type InitializationStage = 'preparing' | 'calibrating' | 'locating';

const STAGE_COPY: Record<InitializationStage, string> = {
  preparing: 'Preparing Body Intelligence Engine',
  calibrating: 'Calibrating camera',
  locating: 'Locating body landmarks',
};

export function InitializationOverlay({ stage }: { stage: InitializationStage }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#0B120E]/90">
      <Loader2
        className="h-6 w-6 animate-spin text-white/85"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <p
        className="text-center text-sm font-medium tracking-wide text-white"
        role="status"
        aria-live="polite"
      >
        {STAGE_COPY[stage]}
      </p>
    </div>
  );
}
