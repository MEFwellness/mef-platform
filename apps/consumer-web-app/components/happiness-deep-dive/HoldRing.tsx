'use client';

/**
 * A ring that fills over a named number of seconds, so a member sits inside
 * that length of time rather than reading a number about it.
 *
 * THE ONE PLACE IT IS USED TODAY is Being Seen's question six, which asks
 * her to trace what happens in the first five seconds after a compliment.
 * Five seconds is a short time to describe and a long time to sit through,
 * and the difference between those two is the entire question, so the
 * screen makes her sit through it before it gives her the writing box.
 *
 * IT IS A PACING DEVICE, NOT A LOCK. Nothing is being loaded, nothing is
 * being checked, and no answer is being withheld. It is built into
 * QuestionStage's own arrival for exactly that reason: it is part of how
 * the question arrives, not a gate placed in front of it.
 *
 * REDUCED MOTION GETS THE RING STILL AND FULL, AND NO WAIT AT ALL. A
 * member who has asked her device for less motion is asking not to be made
 * to watch something move; making her watch a still ring for five seconds
 * instead would be the same request answered backwards. The caller skips
 * the wait and this renders its finished state.
 *
 * Decorative. The label beside it is the accessible content; the ring
 * itself is aria-hidden, so nothing here is announced as a progress bar for
 * a task that does not exist.
 */

import { useEffect, useState } from 'react';

const SIZE = 72;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function HoldRing({
  seconds,
  label,
  still = false,
}: {
  seconds: number;
  label: string;
  /** Render the finished ring immediately, with nothing timed. Reduced motion, and a question she is landing back on. */
  still?: boolean;
}) {
  const [filled, setFilled] = useState(still);

  useEffect(() => {
    if (still) {
      setFilled(true);
      return undefined;
    }
    // One frame after mount, so the browser has painted the empty ring and
    // the transition has something to run from. Setting it synchronously
    // would land the ring full with no fill at all.
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [still]);

  return (
    <div className="mef-fade-in flex items-center gap-4">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
        className="shrink-0 -rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(245,240,228,0.16)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#C4A050"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={filled ? 0 : CIRCUMFERENCE}
          style={
            still ? undefined : { transition: `stroke-dashoffset ${seconds}s linear` }
          }
        />
      </svg>
      <p className="text-[15px] leading-relaxed text-[#F5F0E4]/70">{label}</p>
    </div>
  );
}
