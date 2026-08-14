import Link from 'next/link';
import type { Route } from 'next';
import { KeyRound } from 'lucide-react';

/**
 * Entry point into the one shared change-password screen
 * (app/account/password). Used by the coach and administrator home pages,
 * neither of which has a profile or settings area of its own, so without
 * this there would be no way into the flow for those roles short of sending
 * them through the member profile. The member entry point lives in the
 * Account card on app/profile/page.tsx and points at the same screen.
 */
export function ChangePasswordLink({ className = '' }: { className?: string }) {
  return (
    <Link
      href={'/account/password' as Route}
      className={`mef-press inline-flex items-center gap-2 rounded-full border border-[#1B3A2D]/10 bg-white px-4 py-2 text-sm font-medium text-[#1B3A2D] transition hover:border-[#1B3A2D]/30 ${className}`}
    >
      <KeyRound className="h-4 w-4 text-[#6B7A72]" strokeWidth={1.75} aria-hidden="true" />
      Change password
    </Link>
  );
}
