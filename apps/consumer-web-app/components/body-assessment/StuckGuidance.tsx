'use client';

/**
 * Shown once a standing-photo step has gone STUCK_THRESHOLD_MS (20s, see
 * CameraCapture.tsx) with no successful capture — replaces the normal
 * small on-screen cue with ONE large, plain-language statement of the
 * single condition currently blocking capture. A member testing this is
 * standing several feet away from the phone and cannot read the normal
 * small text; this is deliberately oversized and high-contrast, with
 * nothing else competing for attention.
 */

export function StuckGuidance({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6">
      <p
        className="text-center text-3xl font-semibold leading-tight text-white"
        role="status"
        aria-live="assertive"
      >
        {message}
      </p>
    </div>
  );
}
