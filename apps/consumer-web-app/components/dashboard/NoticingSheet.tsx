'use client';

/**
 * Home dashboard redesign — "What Root Is Noticing" carousel. Shared
 * bottom-sheet shell for cards whose content has no dedicated destination
 * page (currently just "From Root") — tapping the card opens this instead
 * of navigating, per the redesign's requirement that every previously-
 * inline action stay fully reachable. Same bottom-sheet mechanics as
 * ProfileSheet.tsx/FloatingCoachPanel's wrapper (backdrop fade,
 * translate-up entrance, safe-area padding, Escape to close) so this
 * reads as the same system, not a new one.
 *
 * Rendered via a portal into `document.body`, not as a sibling of its
 * trigger — a previous version relied on being a plain DOM sibling
 * ("never nested inside anything with transform/filter/its own z-index"),
 * but its trigger (NoticingTile, inside the dashboard's "What Root Is
 * Noticing" zone) is itself wrapped in RevealOnScroll.tsx, whose entrance
 * animation sets `transform: translateY(...)` on that wrapper. A
 * `transform` value other than `none` establishes a new stacking context
 * per spec even at rest (`translate-y-0` is still a non-`none` transform)
 * — so this sheet's own z-50 was only ever being compared against
 * elements *inside* that wrapper, not page-wide. FloatingCoachLauncher's
 * "Ask Root" button (z-40, but never inside a transformed ancestor) then
 * painted and received taps on top of this sheet's content instead of
 * under it — confirmed live: tapping where the sheet visually showed
 * "Recommended For You" instead opened the Ask Root chat panel. A portal
 * sidesteps the whole class of bug (this or any future transformed
 * ancestor) by never being inside that subtree at all.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export function NoticingSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-40 bg-[#1B3A2D]/20 backdrop-blur-[1px] transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-12px_48px_-8px_rgba(27,58,45,0.35)] transition-[opacity,transform] duration-200 ease-out sm:inset-x-auto sm:bottom-8 sm:right-8 sm:w-[420px] sm:rounded-[28px] sm:shadow-[0_12px_48px_-8px_rgba(27,58,45,0.35)] ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-[#1B3A2D]/15" aria-hidden="true" />
        </div>

        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-2 sm:pt-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#1B3A2D]/50 transition hover:bg-[#1B3A2D]/[0.06] hover:text-[#1B3A2D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5B700]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* pb-safe-chat, not pb-5: this sheet can coexist on-screen with
            FloatingCoachLauncher's floating button (both live on the
            Dashboard) — see the module doc for the stacking bug this
            already caused once. */}
        <div className="overflow-y-auto px-5 pb-safe-chat">{children}</div>
      </div>
    </>,
    document.body
  );
}
