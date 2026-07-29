'use client';

/**
 * Shared horizontal scroll-snap carousel shell — position indicator dots
 * below a row of snapped children, updating live as the member scrolls.
 * Built for the dashboard's "What Root Is Noticing" row (4 image-backed
 * tiles, only the first ~1.7 visible on a real phone with no signal that
 * two more cards existed), but written to take any children so a future
 * horizontal card row can reuse it rather than re-hand-roll the same
 * `overflow-x-auto snap-x` markup a second time.
 *
 * Cropping/"peek": intentionally NOT solved here by shrinking card width —
 * the existing `w-[196px]` tiles in a `max-w-md` (350px content column)
 * container already leave a real, well-known-visible slice of the next
 * card at rest (confirmed live: ~72% of card 2). The actual gap was purely
 * the missing "there's more / here's where you are" signal, which is what
 * this component adds.
 *
 * Dot count comes from the real DOM (a `MutationObserver` on the
 * scroll container), not from React's `children` count — each child here
 * is a `<Suspense>` wrapping an async card that can resolve to `null`
 * ("a card that has nothing to say just isn't in the row," per this
 * section's own existing convention in dashboard/page.tsx). Counting
 * `children` statically would show 4 dots even when only 2 cards actually
 * streamed in, and Suspense resolution happens asynchronously after this
 * component's own first render — a mutation observer is what actually
 * catches that, where a mount-time-only measurement would not.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function ScrollCarousel({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const children = Array.from(el.children) as HTMLElement[];
      setCount(children.length);

      const containerRect = el.getBoundingClientRect();
      const containerCenter = containerRect.left + containerRect.width / 2;
      let closestIndex = 0;
      let closestDistance = Infinity;
      children.forEach((child, index) => {
        const rect = child.getBoundingClientRect();
        const childCenter = rect.left + rect.width / 2;
        const distance = Math.abs(childCenter - containerCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      setActiveIndex(closestIndex);
    }

    measure();
    const observer = new MutationObserver(measure);
    observer.observe(container, { childList: true });
    container.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div>
      <div
        ref={containerRef}
        className="mef-scrollbar-hidden flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 pb-1"
      >
        {children}
      </div>

      {count > 1 && (
        <div
          role="tablist"
          aria-label={`Position ${activeIndex + 1} of ${count}`}
          className="mt-3 flex items-center justify-center gap-1.5"
        >
          {Array.from({ length: count }, (_, index) => (
            <span
              key={index}
              role="tab"
              aria-selected={index === activeIndex}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                index === activeIndex ? 'w-5 bg-[#1B3A2D]' : 'w-1.5 bg-[#1B3A2D]/25'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
