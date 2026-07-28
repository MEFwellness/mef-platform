'use client';

/**
 * The scroll-triggered "draws in, replays on every scroll into view" wipe
 * originally built for Home's Energy Trend chart
 * (components/dashboard/AnimatedEnergyTrendChart.tsx, animation task
 * 2026-07-27) — lifted out here, unchanged in behavior, so the Progress
 * page's Root Score chart can reuse the exact same scroll-watcher instead
 * of a second implementation (2026-07-27 follow-up task). Deliberately
 * NOT the shared components/dashboard/RevealOnScroll.tsx: that component
 * reveals once and stays revealed (a calm, one-shot entrance for six
 * different Home sections), and changing it to replay would replay every
 * one of those sections' fade/rise-in on every scroll past-and-back —
 * a much bigger behavior change than "just these two charts." This stays
 * a separate, purpose-built mechanism, used only where a chart specifically
 * wants a replayable draw-in.
 *
 * AnimatedEnergyTrendChart.tsx now delegates to this component instead of
 * carrying its own copy of the observer logic; its own behavior on Home is
 * unchanged — same threshold, same reset-on-exit, same one-time-per-visit
 * mount logic, still not wired into RevealOnScroll.
 *
 * KNOWN TRAP, fixed here the same way it was fixed on Home: the observed
 * element must NOT be the same element the clip-path is applied to. When
 * closed, `inset(0 100% 0 0)` clips its target to zero visible width, and
 * Chromium's IntersectionObserver reports a zero-area clipped target as
 * non-intersecting regardless of its actual scroll position — so the
 * observer that's supposed to open the clip-path can never fire while the
 * element it's watching is clipped to nothing. The outer `containerRef`
 * div is always the chart's real, unclipped bounding box; the clip-path
 * lives on the inner div only, which wraps whatever `children` is passed.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

const REPLAY_THRESHOLD = 0.3;

export function ScrollDrawIn({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(reduced);
    if (reduced) {
      setDrawn(true);
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Reducer-style: only ever change state on a genuine crossing of
        // the threshold, in either direction. Never fires on a continuous
        // scroll while already above/below it, so a small scroll nudge
        // while fully on screen (or fully off screen) is a no-op, not a
        // restart.
        setDrawn((current) => {
          if (entry.isIntersecting && !current) return true;
          if (!entry.isIntersecting && current) return false;
          return current;
        });
      },
      { threshold: REPLAY_THRESHOLD }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      <div
        style={
          reducedMotion
            ? undefined
            : {
                clipPath: drawn ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
                // Only transition on the way IN — snapping the reset closed
                // instantly when the card leaves the viewport avoids a
                // visible "wipe closed" right at the scroll boundary.
                transition: drawn ? 'clip-path 1.1s ease-out' : 'none',
              }
        }
      >
        {children}
      </div>
    </div>
  );
}
