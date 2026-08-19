'use client';

/**
 * Home dashboard redesign — the "sections fade and rise slightly as they
 * scroll into view, staggered" requirement. A single generic wrapper
 * rather than one bespoke effect per zone, since every zone needs the
 * exact same enter transition, just with a different delay. Reveals once
 * and stays revealed (no re-hide on scroll-out) — this is a calm entrance,
 * not a scroll-driven toggle. Respects prefers-reduced-motion by skipping
 * straight to the visible state.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function RevealOnScroll({
  children,
  delayMs = 0,
  className = '',
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      setVisible(true);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) reveal();
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );

    /**
     * The safety net, and it is not redundant with the observer.
     *
     * IntersectionObserver only calls back when the intersection state
     * CHANGES across a threshold, judged at the frames it samples, not at
     * every position the page passed through. A zone can therefore travel
     * from below the fold to above the fold in one movement (a fast flick,
     * a jump to the bottom, a restored scroll position) with the ratio
     * measured as zero at both ends. No threshold is crossed, so the
     * callback never runs at all, and the zone stays at opacity 0 forever
     * while still occupying its full height. Confirmed directly on Home:
     * scrolling to the bottom in one movement left two of the three zones
     * permanently invisible, which is a screen and a half of empty cream
     * where Quick Actions and Today should be.
     *
     * So: a zone the member has already scrolled past has had its moment,
     * and should simply be there. Passive, removed the instant it fires,
     * and it never fights the observer because whichever arrives first
     * disconnects the other.
     */
    function onScroll() {
      const rect = ref.current?.getBoundingClientRect();
      if (rect && rect.top < 0) reveal();
    }

    observer.observe(node);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
