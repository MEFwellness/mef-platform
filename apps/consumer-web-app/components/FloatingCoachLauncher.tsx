'use client';

/**
 * The restrained, platform-wide "Ask Your MEF Coach" launcher (part 3).
 * A single floating pill button — never a robot icon, never a flashing
 * badge, never a popup that appears on its own — that opens
 * FloatingCoachPanel, a compact surface reusing the exact same
 * Conversation Coach session/actions as the full /conversation page
 * (part 5's "avoid duplicate conversation logic").
 *
 * Each of the 7 member pages that render this component passes its own
 * `entryPoint` + a short, real-data-derived `entryContext` string (see
 * lib/conversation-coach/entryContext.ts) — this component itself has no
 * page-awareness beyond what's handed to it as props, and is never
 * rendered on /login, /coach/*, /admin/*, or /conversation itself (see
 * each page file for why).
 */

import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { ConversationEntryPoint } from '@mef/shared-types-contracts';
import { FloatingCoachPanel } from './FloatingCoachPanel';

export function FloatingCoachLauncher({
  entryPoint,
  entryContext,
  starterPrompts,
  label = 'Ask Your MEF Coach',
}: {
  entryPoint: ConversationEntryPoint;
  entryContext: string;
  starterPrompts?: string[] | undefined;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const launcherButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    launcherButtonRef.current?.focus();
  }

  return (
    <>
      {!isOpen && (
        <button
          ref={launcherButtonRef}
          type="button"
          onClick={() => setIsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className="fixed bottom-20 right-5 z-40 flex items-center gap-2 rounded-full bg-[#1B3A2D] px-5 py-3 text-sm font-medium text-white shadow-[0_8px_24px_-6px_rgba(27,58,45,0.45)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700] md:bottom-8 md:right-8"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span>{label}</span>
        </button>
      )}

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[#1B3A2D]/20 backdrop-blur-[1px] md:bg-transparent md:backdrop-blur-none"
            onClick={close}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="fixed inset-x-3 bottom-3 z-50 max-h-[75vh] overflow-hidden rounded-[28px] bg-white shadow-[0_12px_48px_-8px_rgba(27,58,45,0.35)] sm:inset-x-4 sm:bottom-4 md:inset-x-auto md:bottom-8 md:right-8 md:w-[400px]"
          >
            <FloatingCoachPanel
              entryPoint={entryPoint}
              entryContext={entryContext}
              starterPrompts={starterPrompts}
              onClose={close}
            />
          </div>
        </>
      )}
    </>
  );
}
