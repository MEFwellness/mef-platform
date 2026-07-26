import { useEffect, useRef } from 'react';

/**
 * Daily Check-In redesign — "tapping an answer fills the selection
 * visibly (~250ms), then auto-advances." Fires `onAdvance` once, ~250ms
 * after the CURRENT screen's completeness flips from false to true —
 * never on mount (reopening/landing on an already-complete screen must
 * not read as "just completed it"), never while already complete when
 * the screen was first shown, and never for a screen other than the one
 * currently displayed.
 *
 * Takes `screenIndex` explicitly (rather than being called once per
 * screen) because the number of wizard screens varies — cinematic mode
 * has one screen per question, section mode groups several — and the
 * Rules of Hooks forbid a variable number of hook calls. Every time
 * `screenIndex` itself changes, the "was it already complete" baseline
 * is reseeded to whatever the new screen's current completeness is,
 * rather than carried over from the previous screen.
 */
export function useScreenAutoAdvance(
  isComplete: boolean,
  screenIndex: number,
  onAdvance: () => void,
  delayMs = 250
): void {
  const advanceRef = useRef(onAdvance);
  advanceRef.current = onAdvance;
  const baseline = useRef({ index: screenIndex, wasComplete: isComplete });

  useEffect(() => {
    if (baseline.current.index !== screenIndex) {
      baseline.current = { index: screenIndex, wasComplete: isComplete };
      return undefined;
    }
    if (isComplete && !baseline.current.wasComplete) {
      baseline.current.wasComplete = true;
      const timer = setTimeout(() => advanceRef.current(), delayMs);
      return () => clearTimeout(timer);
    }
    if (!isComplete) baseline.current.wasComplete = false;
    return undefined;
  }, [isComplete, screenIndex, delayMs]);
}
