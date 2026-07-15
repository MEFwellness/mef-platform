'use client';

/**
 * The final, calm 3-2-1 shown once a stable hold has already satisfied
 * REQUIRED_STABLE_MS — CameraCapture.tsx drives `remainingMs` from real
 * elapsed time (COUNTDOWN_MS minus time since the countdown started), not
 * a fixed animation duration, so this always reflects the actual
 * countdown state, including if it's interrupted and resumes. The `key`
 * on the numeral forces a fresh mount each time the displayed second
 * changes, retriggering the pop-in animation for that one tick only.
 */

export function CaptureCountdownNumeral({ remainingMs }: { remainingMs: number }) {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span
        key={seconds}
        className="mef-countdown-pop flex h-20 w-20 items-center justify-center rounded-full bg-black/45 font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-white backdrop-blur-sm"
        role="status"
        aria-live="off"
      >
        {seconds}
      </span>
    </div>
  );
}
