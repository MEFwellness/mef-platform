'use client';

/**
 * Home dashboard redesign — the "Energy Trend line draws in" requirement,
 * without touching components/EnergyTrendChart.tsx's own line/dot/area
 * rendering (that component is also used by app/progress/page.tsx and
 * the coach client view, app/coach/clients/[id]/page.tsx — see its own
 * showBars doc comment). A left-to-right clip-path wipe around the
 * chart achieves the same "drawing in" feel as animating the SVG stroke
 * directly, entirely from the outside. Respects prefers-reduced-motion
 * by skipping straight to fully revealed.
 *
 * 2026-07-27 animation task: this used to draw in once, on mount,
 * regardless of scroll position (a plain requestAnimationFrame right
 * after first render) — if the chart was below the fold at page load,
 * its 1.1s wipe had already finished, unseen, before the member ever
 * scrolled to it. Replaced with this component's own dedicated
 * IntersectionObserver (deliberately NOT the shared
 * components/dashboard/RevealOnScroll.tsx — see below) so the wipe
 * plays for real, every time the card is actually looked at: reset to
 * the closed clip-path the moment the card scrolls fully out of view,
 * replayed the moment it scrolls back in.
 *
 * Why not just change RevealOnScroll.tsx: grepped every Home-dashboard
 * usage first (app/dashboard/page.tsx) — RevealOnScroll wraps six
 * different sections (the greeting/hero row, Today's Numbers, "What
 * Root Is Noticing," the Root's Daily Brief / Wellness Index pair, and
 * this Energy Trend section itself), and its own doc comment is explicit
 * that "reveals once and stays revealed... is a calm entrance, not a
 * scroll-driven toggle" is a deliberate design decision for all of them.
 * Making it replay would replay every one of those six sections' fade/
 * rise-in every time a member scrolls past and back to any of them —
 * not what was asked, and a much larger behavior change than "just the
 * chart." RevealOnScroll still wraps this card in app/dashboard/page.tsx
 * exactly as before, for that same one-time fade/rise entrance; this
 * component adds its own, separate, replay-capable animation for the
 * chart's line-draw specifically, nested inside it.
 *
 * A single fixed IntersectionObserver threshold (0.3, no threshold
 * array, no rootMargin games) is what keeps this from flickering or
 * restarting mid-scroll: the callback only fires when the card's
 * visibility crosses that one 30% line, in either direction — not
 * continuously as the user scrolls, and not again while already above
 * or below that line, since `setDrawn` is only ever called when the new
 * intersecting state actually differs from the current one.
 */

import { useEffect, useRef, useState } from 'react';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { EnergyTrendChart } from '@/components/EnergyTrendChart';

const REPLAY_THRESHOLD = 0.3;

export function AnimatedEnergyTrendChart({ checkins }: { checkins: DailyCheckin[] }) {
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
    // Observed element is deliberately unclipped — a real bug found while
    // verifying this live: observing the SAME element the clip-path is
    // applied to creates a deadlock. When closed, `inset(0 100% 0 0)`
    // clips the element to zero visible width, and Chromium's
    // IntersectionObserver reports a zero-area clipped target as
    // non-intersecting regardless of its actual scroll position — so the
    // clip-path could never open, because the observer that's supposed
    // to open it never fires while the element it's watching is clipped
    // to nothing. This outer div's geometry is always the chart's real,
    // unclipped bounding box; the clip-path lives on the inner div only.
    <div ref={containerRef}>
      <div
        style={
          reducedMotion
            ? undefined
            : {
                clipPath: drawn ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
                // Only transition on the way IN. Snapping the reset closed
                // instantly (no transition) when the card leaves the
                // viewport avoids a visible "wipe closed" right at the
                // scroll boundary — by the time it's worth animating
                // again, it's back below the 0.3 threshold and off-screen
                // anyway.
                transition: drawn ? 'clip-path 1.1s ease-out' : 'none',
              }
        }
      >
        <EnergyTrendChart checkins={checkins} showBars />
      </div>
    </div>
  );
}
