'use client';

/**
 * Shared shell for both check-in wizards (Morning Readiness's 4 screens,
 * Evening Reflection's own 3) — "one section per screen" (task
 * requirement 1). Owns the progress dots and the back affordance; each
 * screen's own content (heading + questions, built by the caller) is
 * passed as `children` and remounted (via the caller keying its screen
 * component) so its own StaggerItem entrance replays on every screen
 * change.
 */

import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export function CheckinWizard({
  screenCount,
  screenIndex,
  furthestScreenIndex,
  onBack,
  onSelectScreen,
  children,
}: {
  screenCount: number;
  screenIndex: number;
  /** The furthest screen this visit has reached — a dot beyond this point is a screen not yet seen today, so it's inert rather than a jump-ahead shortcut. */
  furthestScreenIndex: number;
  onBack: () => void;
  onSelectScreen: (index: number) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        {screenIndex > 0 ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to previous screen"
            className="mef-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B3A2D]/[0.06] text-[#1B3A2D]"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <div className="h-9 w-9 shrink-0" aria-hidden="true" />
        )}
        <div className="flex flex-1 gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={screenCount} aria-valuenow={screenIndex + 1}>
          {Array.from({ length: screenCount }).map((_, index) => {
            const reachable = index <= furthestScreenIndex;
            return (
              <button
                key={index}
                type="button"
                disabled={!reachable}
                onClick={() => onSelectScreen(index)}
                aria-label={`Go to screen ${index + 1} of ${screenCount}`}
                aria-current={index === screenIndex ? 'step' : undefined}
                className={`h-1.5 flex-1 overflow-hidden rounded-full bg-[#1B3A2D]/[0.08] ${reachable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div
                  className={`h-full rounded-full bg-[#1B3A2D] transition-all duration-500 ease-out ${
                    index <= screenIndex ? 'w-full' : 'w-0'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Applies the "heading, then questions, ~400ms each, 80ms apart, ease-out" entrance to one child of a screen — `index` 0 is the heading, 1+ are the questions in order. Degrades to a plain opacity fade under prefers-reduced-motion (see globals.css). */
export function StaggerItem({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="mef-checkin-stagger" style={{ animationDelay: `${index * 80}ms` }}>
      {children}
    </div>
  );
}
