'use client';

/**
 * Shared shell for both check-in wizards. Owns:
 * - the persistent Home control (top-left) — leaves the check-in
 *   entirely, distinct from the back chevron next to it. Reads as the
 *   word "Home", not an icon-only glyph, per the 2026-07-27 fix: the
 *   prior icon-only X required several taps before it registered — see
 *   this file's `onExit` doc below for the actual diagnosed cause and
 *   the fix (a synchronous, single-fire guard owned by the caller).
 *   Distinct tap target from the back chevron at every width: fixed
 *   height (44pt, `h-11`), never overlapping since both sit in a flex
 *   row with the progress track absorbing the remaining space;
 * - the progress indicator: one continuous track whose fill travels
 *   smoothly to each screen's position (never jumps between
 *   independent per-dot bars), with tick marks at each screen boundary
 *   that are also tap targets, reachable up to the furthest screen this
 *   visit has gotten to;
 * - the back affordance;
 * - the persistent Continue control — always rendered, on every screen,
 *   never only the last one, and the ONLY way a screen ever advances.
 *   There is no auto-advance: answering a question, completing a
 *   screen's required fields, or revealing a follow-up never moves the
 *   screen on its own. A prior auto-advance mechanism
 *   (useScreenAutoAdvance) was removed entirely — two systems racing to
 *   control the same transition was what caused screens to jump and
 *   controls to stop responding;
 * - the screen-to-screen transition: outgoing content fades up and out,
 *   then incoming content fades in from below — never a hard swap, no
 *   flash of white, since the exiting/entering screen is rendered via
 *   the same shell rather than the page reloading or the two screens'
 *   DOM briefly coexisting unstyled.
 *
 * Screen content is a render-prop (`renderScreen`) rather than plain
 * children so the wizard can keep showing the OUTGOING screen's real
 * content for the short exit animation even after the caller's own
 * `screenIndex` has already moved on.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Home } from 'lucide-react';

const EXIT_MS = 180;
const ENTER_MS = 320;

export function CheckinWizard({
  screenCount,
  screenIndex,
  furthestScreenIndex,
  onBack,
  onSelectScreen,
  onExit,
  exitDisabled,
  exitLabel = 'Home',
  onContinue,
  continueLabel,
  continueDisabled,
  renderScreen,
}: {
  screenCount: number;
  screenIndex: number;
  furthestScreenIndex: number;
  onBack: () => void;
  onSelectScreen: (index: number) => void;
  /** Leaves the check-in entirely (saving whatever's been answered so far) — always present, distinct from onBack. */
  onExit: () => void;
  /**
   * True while a save-and-exit is already in flight. The caller (not this
   * component) owns the guard: `onExit` must synchronously flip a ref/state
   * to true on the very first invocation and ignore every call after, since
   * that's what actually fixes "several taps before it registers" — see
   * `saveProgressAndExit` in CheckinForm.tsx/EveningReflectionForm.tsx. This
   * component only reflects that state visually (disabled + label change)
   * so a second, third, fourth tap looks and feels like nothing rather than
   * silently queuing up more work.
   */
  exitDisabled?: boolean;
  exitLabel?: string;
  /** The persistent Continue control's action — advances a screen, or performs the real submit on the last one. */
  onContinue: () => void;
  continueLabel: string;
  continueDisabled: boolean;
  renderScreen: (index: number) => ReactNode;
}) {
  const [displayIndex, setDisplayIndex] = useState(screenIndex);
  const [phase, setPhase] = useState<'idle' | 'exiting' | 'entering'>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (screenIndex === displayIndex) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase('exiting');
    const exitTimer = setTimeout(() => {
      setDisplayIndex(screenIndex);
      setPhase('entering');
      const enterTimer = setTimeout(() => setPhase('idle'), ENTER_MS);
      timers.current.push(enterTimer);
    }, EXIT_MS);
    timers.current.push(exitTimer);
    return () => {
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenIndex]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const fillPercent = ((screenIndex + 1) / screenCount) * 100;

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExit}
          disabled={exitDisabled}
          aria-label="Save progress and return to Home"
          className="mef-press flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#1B3A2D]/20 px-4 text-[13px] font-semibold text-[#1B3A2D] transition-opacity duration-150 disabled:opacity-50"
        >
          <Home className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          {exitLabel}
        </button>
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
        <div
          className="relative h-1.5 flex-1"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={screenCount}
          aria-valuenow={screenIndex + 1}
        >
          <div className="absolute inset-0 rounded-full bg-[#1B3A2D]/[0.08]" />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[#1B3A2D] transition-all duration-500 ease-out"
            style={{ width: `${fillPercent}%` }}
          />
          <div className="relative flex h-full items-center justify-between">
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
                  className={`h-2.5 w-2.5 rounded-full border-2 border-[#FAFAF8] transition-colors ${
                    index <= screenIndex ? 'bg-[#1B3A2D]' : 'bg-[#1B3A2D]/20'
                  } ${reachable ? 'cursor-pointer' : 'cursor-default'}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/*
       * `pb-[...]` below reserves real scroll room after the last question
       * so the sticky Continue button can never end up sitting on top of
       * unread/untappable content. Once a screen's content is taller than
       * the viewport, the button sticks at `bottom-4` for the entire
       * remaining scroll range — and since it's the last element with
       * nothing after it, without this padding max scroll would land
       * exactly where the button covers the tail end of the real content,
       * with no further scrolling possible to reveal it (confirmed via
       * screenshots on every section-mode screen and the pain-location
       * screen — see docs/UX_AUDIT_DAILY_LOOP.md). Sized generously:
       * button height (~52px for `py-3.5` + `text-base`) + its own
       * `bottom-4` (16px) offset + breathing room, plus
       * `env(safe-area-inset-bottom)` for the home indicator on notched
       * phones, since the button's own 16px offset doesn't already
       * account for that. On screens short enough to already fit above
       * the fold, this just adds a little extra space below the last
       * question — the button was never at risk there and stays exactly
       * as reachable as before.
       */}
      <div
        key={displayIndex}
        className={`mt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] ${phase === 'exiting' ? 'mef-screen-exit' : phase === 'entering' ? 'mef-screen-enter' : ''}`}
      >
        {renderScreen(displayIndex)}
      </div>

      {/*
       * The persistent Continue control (task requirement 1) — present on
       * every screen, not just the last. Sticky rather than static so a
       * screen with a lot of content (e.g. the habits list) never pushes
       * it below the fold; nothing else needs to reserve room for a fixed
       * bottom nav here, since both check-in pages already hide BottomNav
       * for the duration of the flow.
       */}
      <div className="sticky bottom-4 z-10 mt-6">
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          className="mef-press flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white shadow-[0_8px_24px_-8px_rgba(27,58,45,0.5)] transition-all duration-200 ease-out hover:brightness-110 disabled:opacity-40"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}
