'use client';

/**
 * Premium Dashboard Experience milestone — the one Sign Out control, used
 * both inside ProfileSheet.tsx and on the full Profile page, so there's a
 * single confirmation experience instead of each place inventing its own.
 * Sign Out itself is destructive (ends the session) and irreversible from
 * the member's side, hence the confirmation step before it fires.
 */

import { useState, useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { signOut } from '@/app/actions/auth';

export function SignOutButton({ variant = 'row' }: { variant?: 'row' | 'block' }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      await signOut();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={
          variant === 'row'
            ? 'flex w-full items-center gap-3 rounded-2xl px-5 py-3.5 text-left text-[15px] font-medium text-red-600 transition hover:bg-red-50'
            : 'w-full rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50'
        }
      >
        {variant === 'row' && (
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        )}
        Sign Out
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm sign out"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#1B3A2D]/30 backdrop-blur-[2px] p-5"
          onClick={() => !isPending && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-[24px] bg-white p-6 shadow-[0_24px_64px_-12px_rgba(27,58,45,0.35)] animate-[mef-pop-in_0.2s_ease-out_both]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]">
              Sign out of Rooted Reset?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
              You&apos;ll need to sign back in to see your check-ins, Root Score, and coaching.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isPending}
                className="flex-1 rounded-full border border-[#1B3A2D]/10 px-4 py-2.5 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? 'Signing out…' : 'Sign Out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
