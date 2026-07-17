'use client';

/**
 * The restrained, platform-wide "Ask Root" launcher. A single
 * floating pill button — never a robot icon, never a flashing badge,
 * never a popup that appears on its own — that opens FloatingCoachPanel
 * as a responsive bottom sheet on mobile (full-width, anchored to the
 * bottom of the viewport, collapsed/half/expanded height states) and a
 * floating card on desktop (unchanged from before).
 *
 * The mobile-usability bug this rewrite fixes: the panel used to be a
 * small fixed-size card sized in `vh`, with no body-scroll lock and no
 * keyboard/safe-area awareness — on a phone, the header and input could
 * end up outside the visible viewport (behind the address bar or the
 * keyboard), forcing the member to pinch/zoom/scroll the whole page to
 * reach parts of it. useBodyScrollLock + useVisualViewportInset +
 * the `dvh`-based sheet-height classes in globals.css are the three
 * pieces that fix that; each is described where it's used below.
 *
 * Premium UX Milestone 1: this is now the page's ONE Root entry point.
 * It still opens with the page's own default entryPoint/entryContext when
 * the floating button itself is tapped, but it also listens on
 * root-launcher-bus for RootQuickLink taps elsewhere on the page (e.g.
 * Today's "I need an easier option") and opens with THAT entry point
 * instead — those used to be separate buttons that navigated to a whole
 * second page (/conversation) for the same conversation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { ConversationEntryPoint } from '@mef/shared-types-contracts';
import { FloatingCoachPanel } from './FloatingCoachPanel';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useVisualViewportInset } from '@/hooks/useVisualViewportInset';
import { useRootOpenRequests, type RootOpenRequest } from '@/lib/root-launcher-bus';

export type CoachSheetState = 'half' | 'expanded';

export function FloatingCoachLauncher({
  entryPoint,
  entryContext,
  starterPrompts,
  label = 'Ask Root',
}: {
  entryPoint: ConversationEntryPoint;
  entryContext: string;
  starterPrompts?: string[] | undefined;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // Separate from `isOpen` so the sheet mounts in its "entering" state
  // first, then flips to visible a frame later — that one-frame gap is
  // what turns the open into a real transition (opacity/translate below)
  // instead of the panel simply appearing, per part 7's "smooth open
  // animation."
  const [visible, setVisible] = useState(false);
  const [sheetState, setSheetState] = useState<CoachSheetState>('half');
  const [active, setActive] = useState<RootOpenRequest>({ entryPoint, entryContext, starterPrompts });
  const launcherButtonRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock(isOpen);
  const keyboardInset = useVisualViewportInset();

  // A RootQuickLink elsewhere on the page (e.g. Today's "Ask your coach
  // why") asking this launcher to open with its own, more specific entry
  // point instead of the page's default one.
  useRootOpenRequests(
    useCallback((request: RootOpenRequest) => {
      setActive(request);
      setSheetState('half');
      setIsOpen(true);
    }, [])
  );

  function openWithDefault() {
    setActive({ entryPoint, entryContext, starterPrompts });
    setIsOpen(true);
  }

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Every time the sheet opens, start collapsed to "half" — an "expanded"
  // state left over from a previous open would otherwise persist and feel
  // like the panel is stuck open large.
  useEffect(() => {
    if (isOpen) setSheetState('half');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  function close() {
    setVisible(false);
    // Let the closing transition play before actually unmounting, rather
    // than cutting it off instantly — matches the open side's animation.
    window.setTimeout(() => setIsOpen(false), 150);
    launcherButtonRef.current?.focus();
  }

  return (
    <>
      {!isOpen && (
        <button
          ref={launcherButtonRef}
          type="button"
          onClick={openWithDefault}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          // bottom-20 alone (a fixed 80px) sat behind the bottom nav on
          // devices with a tall safe-area inset (e.g. the ~34px home-
          // indicator inset on notched iPhones), since the nav's own
          // height grows by that same inset but this button's offset
          // didn't — env(safe-area-inset-bottom) keeps the gap constant
          // above the nav on every device instead of just some.
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 z-40 flex items-center gap-2 rounded-full bg-[#1B3A2D] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_24px_-6px_rgba(27,58,45,0.45)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] md:bottom-8 md:right-8"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>{label}</span>
        </button>
      )}

      {isOpen && (
        <>
          <div
            className={`fixed inset-0 z-40 bg-[#1B3A2D]/20 backdrop-blur-[1px] transition-opacity duration-200 md:bg-transparent md:backdrop-blur-none ${
              visible ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            // Shrinks the sheet's height by the keyboard's height (rather
            // than translating the whole box up) so the bottom edge rises
            // above the keyboard while the top/header stays anchored in
            // place — translating the whole box instead would have
            // pushed the header above the top of the screen once the
            // sheet was tall (the 'expanded' state) and the keyboard was
            // large, hiding it entirely.
            style={
              keyboardInset > 0
                ? {
                    bottom: keyboardInset,
                    height: `calc(${sheetState === 'expanded' ? '88dvh' : '81dvh'} - ${keyboardInset}px)`,
                    maxHeight: `calc(${sheetState === 'expanded' ? '88dvh' : '81dvh'} - ${keyboardInset}px)`,
                  }
                : undefined
            }
            className={`fixed inset-x-0 bottom-0 z-50 flex w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-12px_48px_-8px_rgba(27,58,45,0.35)] transition-[max-height,opacity,transform] duration-200 ease-out md:inset-x-auto md:bottom-8 md:right-8 md:min-h-[500px] md:max-h-[75vh] md:w-[400px] md:rounded-[28px] md:shadow-[0_12px_48px_-8px_rgba(27,58,45,0.35)] ${
              sheetState === 'expanded' ? 'mef-coach-sheet-height' : 'mef-coach-sheet-height-half'
            } ${visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 md:translate-y-2'}`}
          >
            <FloatingCoachPanel
              entryPoint={active.entryPoint}
              entryContext={active.entryContext}
              starterPrompts={active.starterPrompts}
              onClose={close}
              sheetState={sheetState}
              onToggleSheetState={() => setSheetState((s) => (s === 'half' ? 'expanded' : 'half'))}
            />
          </div>
        </>
      )}
    </>
  );
}
