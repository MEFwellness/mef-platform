'use client';

/**
 * Premium Dashboard Experience milestone: the one Sign Out control, used
 * from the member Profile sheet, the full member Profile page, the
 * trial-ended lock screen and (as the `nav` variant) the coach and admin
 * navigation bar, so there's a single confirmation experience instead of
 * each place inventing its own. Sign Out itself is destructive (ends the
 * session) and irreversible from the member's side, hence the confirmation
 * step before it fires.
 *
 * Variants, all four the same button and the same dialog:
 *   - `row`   a full-width list row, for a sheet or a settings list.
 *   - `block` a standalone pill, for the bottom of a page.
 *   - `nav`   one tab inside components/StaffNav.tsx, shaped exactly like
 *             the Coach and Admin tabs beside it. This is how a coach or
 *             an administrator signs out: it is the last tab of their own
 *             bar, on every staff screen, rather than a control they have
 *             to find on a member screen they are not allowed to open.
 *
 * WHY THE DIALOG IS PORTALLED, which is the whole fix here. On a real
 * iPhone the confirmation appeared inline at the bottom of the page with
 * its two buttons below the fold, so sign out could not be confirmed at
 * all. The dialog markup was already `position: fixed`, and that was the
 * problem: `fixed` is only positioned against the viewport when no
 * ancestor establishes a containing block for it, and BOTH places this
 * button lives do exactly that.
 *
 *   - components/ProfileSheet.tsx animates itself with `translate-y-0` /
 *     `translate-y-4`. A transform value other than `none` makes that
 *     element the containing block for every fixed descendant, at rest
 *     included, so `inset-0` meant "the profile sheet", not "the screen".
 *   - components/staffNavStyles.ts gives the staff bar `backdrop-blur`,
 *     and a backdrop filter does the same thing.
 *
 * So the dialog was being centered inside a bottom sheet, or inside a
 * ~64px tall navigation bar. components/dashboard/NoticingSheet.tsx hit
 * the identical class of bug and solved it the same way: render into
 * `document.body`, where no ancestor can capture it. That component is the
 * pattern this one now follows, mechanics and all (backdrop fade, Escape
 * to close, body scroll lock, safe-area aware padding).
 *
 * The second half of the same fix is `.mef-modal-viewport` in
 * app/globals.css: even a correctly portalled `inset-0` is the LARGE
 * viewport on iOS Safari, taller than the screen while the browser bar is
 * showing. See that rule's own comment.
 */

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { STAFF_NAV_ITEM_CLASS, STAFF_NAV_ITEM_IDLE_CLASS } from '@/components/staffNavStyles';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export type SignOutVariant = 'row' | 'block' | 'nav';

/**
 * Who is signing out, which is the only thing that changes in the dialog.
 * The body copy used to name check-ins, Root Score and coaching for
 * everyone, so a coach and an administrator were told they would lose
 * access to a member experience they never had. Kept to what each account
 * actually comes back to.
 */
export type SignOutAudience = 'member' | 'coach' | 'admin';

const AUDIENCE_COPY: Record<SignOutAudience, string> = {
  member: "You'll need to sign back in to see your check-ins, Root Score, and coaching.",
  coach: "You'll need to sign back in to manage your clients.",
  // An administrator who does not also coach has no clients of their own,
  // so it says what that account actually returns to.
  admin: "You'll need to sign back in to manage the platform.",
};

/**
 * Consequential, not alarming. This used to be Tailwind's red-600 on
 * red-50, which on the member's Profile was the only saturated colour
 * anywhere on the screen and pulled the eye straight past everything she
 * actually came for, reading like "delete my account" rather than "sign
 * out". The muted terracotta is the same one the poor band uses in
 * lib/wellness/status.ts, so the app has one warning colour rather than
 * two, and it still stands clearly apart from the greens around it.
 */
const VARIANT_CLASS: Record<SignOutVariant, string> = {
  row: 'mef-press flex w-full items-center gap-3 rounded-2xl px-5 py-3.5 text-left text-[15px] font-medium text-[#8C3B2E] transition hover:bg-[#F7ECE9]',
  block:
    'mef-press w-full rounded-full border border-[#8C3B2E]/25 px-4 py-2.5 text-sm font-medium text-[#8C3B2E] transition hover:border-[#8C3B2E]/45 hover:bg-[#F7ECE9]',
  nav: `mef-press ${STAFF_NAV_ITEM_CLASS} ${STAFF_NAV_ITEM_IDLE_CLASS}`,
};

export function SignOutButton({
  variant = 'row',
  audience = 'member',
}: {
  variant?: SignOutVariant;
  audience?: SignOutAudience;
}) {
  const [confirming, setConfirming] = useState(false);
  const [visible, setVisible] = useState(false);
  const [isPending, startTransition] = useTransition();

  useBodyScrollLock(confirming);

  useEffect(() => {
    if (!confirming) return;
    setVisible(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) setConfirming(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [confirming, isPending]);

  function handleConfirm() {
    startTransition(async () => {
      await signOut();
    });
  }

  // Rendered into document.body so no transformed or filtered ancestor can
  // turn `fixed` into "fixed inside me". See the module doc.
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
            {/*
             * The dismiss handler is on THIS element, the frame, not on the
             * dimmed layer above. The frame covers the whole screen and sits
             * on top of the dim, so the dim never receives a tap: it is
             * paint, and this is the hit area. Putting the handler on the dim
             * meant tapping outside the panel did nothing at all, which the
             * browser-driven check caught on its first run.
             */}
            <div
              className="mef-modal-viewport z-[71] flex items-center justify-center px-5"
              onClick={() => !isPending && setConfirming(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Confirm sign out"
                onClick={(e) => e.stopPropagation()}
                className={`flex max-h-full w-full max-w-sm flex-col overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0_24px_64px_-12px_rgba(27,58,45,0.35)] transition-[opacity,transform] duration-200 ease-out ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                }`}
              >
                <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
                  Sign out of Rooted Reset?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
                  {AUDIENCE_COPY[audience]}
                </p>
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={isPending}
                    className="mef-press flex-1 rounded-full border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isPending}
                    className="mef-press flex-1 rounded-full bg-[#9E4634] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#8C3B2E] disabled:opacity-50"
                  >
                    {isPending ? 'Signing out…' : 'Sign Out'}
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
      <button type="button" onClick={() => setConfirming(true)} className={VARIANT_CLASS[variant]}>
        {variant !== 'block' && (
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        )}
        {variant === 'nav' ? <span className="w-full truncate">Sign Out</span> : 'Sign Out'}
      </button>

      {dialog}
    </>
  );
}
