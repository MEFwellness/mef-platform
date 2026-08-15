'use client';

/**
 * "Start over" for a capture attempt: discard every photo taken so far and
 * go back to the first view.
 *
 * Resuming where you left off stays the default, and is the right default:
 * a member who closes the camera to answer the door should not lose three
 * good photos. But resume was the ONLY behaviour, so a member who wanted a
 * clean attempt had no way to ask for one, and a half-finished attempt with
 * one bad photo in it could only be escaped by retaking that photo, which
 * is not the same thing. This is the escape hatch.
 *
 * Destructive and irreversible, so it confirms first. The dialog is
 * portalled to document.body and framed in `.mef-modal-viewport`, exactly
 * as components/SignOutButton.tsx does, and for exactly the same reason: a
 * `fixed` element is positioned against the nearest transformed or
 * filtered ancestor rather than the viewport, and on iOS Safari even a
 * correctly portalled `inset-0` resolves against the large viewport, so
 * buttons end up underneath the browser's own bar. That was a real shipped
 * bug once already; see that file's docblock and the `.mef-modal-viewport`
 * rule in app/globals.css.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCcw } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export function StartOverControl({
  photoCount,
  busy,
  onStartOver,
}: {
  /** How many captures would be discarded, so the dialog can say it plainly. */
  photoCount: number;
  busy: boolean;
  onStartOver: () => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [visible, setVisible] = useState(false);
  const [working, setWorking] = useState(false);

  useBodyScrollLock(confirming);

  useEffect(() => {
    if (!confirming) {
      setVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [confirming]);

  useEffect(() => {
    if (!confirming) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !working) setConfirming(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, working]);

  async function handleConfirm() {
    setWorking(true);
    try {
      await onStartOver();
      setConfirming(false);
    } finally {
      setWorking(false);
    }
  }

  const dialog =
    confirming && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className={`fixed inset-0 z-[70] bg-[#1B3A2D]/35 backdrop-blur-[2px] transition-opacity duration-200 ${
                visible ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden="true"
            />
            {/* The dismiss handler belongs on the frame, not the dimmed
                layer: the frame covers the screen and paints on top, so the
                dim never receives a tap. */}
            <div
              className="mef-modal-viewport z-[71] flex items-center justify-center px-5"
              onClick={() => !working && setConfirming(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Confirm start over"
                onClick={(event) => event.stopPropagation()}
                className={`flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0_24px_64px_-12px_rgba(27,58,45,0.35)] transition-[opacity,transform] duration-200 ease-out ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                }`}
              >
                <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
                  Start this assessment over?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                  {photoCount === 0
                    ? 'You will go back to the first view and begin again.'
                    : `This deletes ${photoCount === 1 ? 'the photo' : `all ${photoCount} photos`} you have taken so far and takes you back to the first view. This cannot be undone.`}
                </p>
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={working}
                    className="mef-press flex-1 rounded-full border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={working}
                    className="mef-press flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {working ? 'Starting over…' : 'Start over'}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#1B3A2D]/10 px-3 py-1.5 text-xs font-medium text-[#6B7A72] transition hover:border-[#1B3A2D]/30 hover:text-[#1B3A2D] disabled:opacity-40"
      >
        <RefreshCcw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        Start over
      </button>
      {dialog}
    </>
  );
}
