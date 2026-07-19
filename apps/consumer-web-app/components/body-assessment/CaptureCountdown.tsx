'use client';

/**
 * The visible "the system is holding a measurement" moment — a radial
 * progress ring that fills smoothly as CameraCapture.tsx's stability
 * timer (REQUIRED_STABLE_MS) accumulates, replacing what used to be a
 * silent wait between "ready" and the shutter firing. Deliberately a
 * continuous fill rather than a numeral 3-2-1 countdown: the hold window
 * is under two seconds, too short for three discrete numbers to read as
 * anything but a flicker, and a smooth ring reads as "actively measuring
 * and confirming," which is the actual product goal — a countdown implies
 * a timer running out, a fill implies a measurement completing.
 *
 * Pure presentation — every input is already computed by the caller
 * (CameraCapture owns the timer and the pass/fail tone); this component
 * has no knowledge of pose validation, capture, or voice guidance.
 */

export function CaptureCountdown({
  progress,
  tone,
}: {
  /** 0 (just became stable) to 1 (about to fire). */
  progress: number;
  tone: 'neutral' | 'success';
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);
  const ringColor = tone === 'success' ? '#34D399' : 'rgba(255,255,255,0.85)';
  const nearComplete = clamped > 0.85;

  return (
    <div
      className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2"
      role="status"
      aria-label={nearComplete ? 'Holding — capturing shortly' : 'Holding position'}
    >
      <svg
        width="58"
        height="58"
        viewBox="0 0 58 58"
        className={nearComplete ? 'mef-ring-glow' : ''}
        style={{ transition: 'filter 300ms ease' }}
      >
        <circle
          cx="29"
          cy="29"
          r={radius}
          fill="rgba(0,0,0,0.32)"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="3"
        />
        <circle
          cx="29"
          cy="29"
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 29 29)"
          style={{ transition: 'stroke-dashoffset 120ms linear, stroke 200ms ease' }}
        />
      </svg>
    </div>
  );
}
