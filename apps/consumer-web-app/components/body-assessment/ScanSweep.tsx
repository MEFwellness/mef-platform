'use client';

/**
 * A soft light band sweeping down the frame — shown only while the
 * system is still acquiring a confident subject (no pose locked on yet,
 * nothing to draw a skeleton from). Exists purely so the very first
 * moment a member opens the camera already communicates "an intelligent
 * system is actively scanning you," rather than a blank viewfinter
 * waiting for something to happen. Pure CSS animation (app/globals.css's
 * mef-scan-sweep) — no per-frame JS cost, safe to mount/unmount freely.
 */

export function ScanSweep() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="mef-scan-sweep absolute inset-x-0 h-1/3"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(52,211,153,0.28), rgba(52,211,153,0.05), transparent)',
        }}
      />
    </div>
  );
}
