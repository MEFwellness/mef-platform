'use client';

/**
 * Shared shell for both check-in wizards. Owns:
 * - the persistent exit control (top-left X) — leaves the check-in
 *   entirely, distinct from the back chevron below it (task requirement
 *   1: "both exist, both visually distinguishable" — the X sits in its
 *   own slot on every screen, a plain outline circle; the chevron is the
 *   solid tinted pill inline with the progress track, only once
 *   screenIndex > 0);
 * - the progress indicator: one continuous track whose fill travels
 *   smoothly to each screen's position (never jumps between
 *   independent per-dot bars), with tick marks at each screen boundary
 *   that are also tap targets, reachable up to the furthest screen this
 *   visit has gotten to;
 * - the back affordance;
 * - the persistent Continue control — always rendered, on every screen,
 *   never only the last one. Auto-advance (useScreenAutoAdvance) is a
 *   convenience layered on top by the caller; this button is the
 *   guaranteed manual path forward, since a screen whose required units
 *   are already satisfied on mount (a reopened check-in, or a screen
 *   with no required units at all) never fires the auto-advance
 *   false->true transition and would otherwise strand her there with no
 *   way to continue;
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
import { ChevronLeft, X } from 'lucide-react';

const EXIT_MS = 180;
const ENTER_MS = 320;

export function CheckinWizard({
  screenCount,
  screenIndex,
  furthestScreenIndex,
  onBack,
  onSelectScreen,
  onExit,
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
          aria-label="Exit check-in and save progress"
          className="mef-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#1B3A2D]/15 text-[#1B3A2D]/60"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
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

      <div
        key={displayIndex}
        className={`mt-6 ${phase === 'exiting' ? 'mef-screen-exit' : phase === 'entering' ? 'mef-screen-enter' : ''}`}
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
