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

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
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
