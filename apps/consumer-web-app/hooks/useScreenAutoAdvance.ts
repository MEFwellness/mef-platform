import { useEffect, useRef } from 'react';

/**
 * Daily Check-In redesign — "tapping an answer fills the selection
 * visibly (~250ms), then auto-advances" (task requirement 1). Fires
 * `onAdvance` once, ~250ms after `isComplete` flips from false to true —
 * never on every keystroke/tap while already complete (editing an answer
 * on a screen you've already finished re-arms the advance rather than
 * firing repeatedly), and never while incomplete. `onAdvance` is read
 * through a ref so a new function identity each render doesn't cancel an
 * already-scheduled advance.
 */
export function useScreenAutoAdvance(isComplete: boolean, onAdvance: () => void, delayMs = 250): void {
  const advanceRef = useRef(onAdvance);
  advanceRef.current = onAdvance;
  // Seeded with the CURRENT value, not `false` — reopening an
  // already-answered check-in (existingCheckin prefills every field, so
  // isComplete can be true on the very first render) must not read as a
  // false->true "just completed it" transition and auto-advance through
  // every screen the instant the page loads.
  const wasComplete = useRef(isComplete);

  useEffect(() => {
    if (isComplete && !wasComplete.current) {
      wasComplete.current = true;
      const timer = setTimeout(() => advanceRef.current(), delayMs);
      return () => clearTimeout(timer);
    }
    if (!isComplete) wasComplete.current = false;
    return undefined;
  }, [isComplete, delayMs]);
}
