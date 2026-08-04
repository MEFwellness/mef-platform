'use client';

/**
 * "Sign in with Face ID" — sits alongside password login on
 * app/(auth)/login/page.tsx, never replacing it. Hidden entirely rather
 * than shown-disabled when this browser has no platform authenticator
 * (lib/passkey/support.ts): an inert Face ID button next to a working
 * password form would read as broken, not merely unavailable, and there is
 * nothing useful to explain here the way the profile enrollment screen
 * explains it — a member on this screen hasn't signed in yet, so there is
 * no account this browser could offer to unlock.
 *
 * The WebAuthn ceremony (`signInWithPasskey()`) only runs in the browser —
 * it has no server-side equivalent — so this calls it directly against the
 * client from lib/supabase/client.ts, then hands off to the
 * completePasskeyLogin() Server Action to do the same role/onboarding
 * routing and entry-animation handoff signIn() does for a password login.
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isPasskeySupported } from '@/lib/passkey/support';
import { getFriendlyPasskeyError, isPasskeyCancelled } from '@/lib/passkey/errors';
import { completePasskeyLogin } from '@/app/actions/auth';

export function PasskeyLoginButton({
  redirectedFrom,
  onError,
}: {
  redirectedFrom: string | null;
  onError: (message: string | null) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isPasskeySupported().then((result) => {
      if (!cancelled) setSupported(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!supported) return null;

  const handlePress = async () => {
    if (busy) return;
    onError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) {
        // A cancelled/timed-out ceremony is not a member-facing error —
        // land back on normal login calmly, no error drama.
        if (!isPasskeyCancelled(error)) onError(getFriendlyPasskeyError(error));
        return;
      }
      if (!data.session) {
        // Not expected when error is null, but never leave the member
        // stuck on a busy button with no explanation.
        onError('Face ID sign-in did not go through. Please try again or use your password.');
        return;
      }
      const result = await completePasskeyLogin(redirectedFrom);
      if (result?.error) onError(result.error);
      // Success redirects server-side inside completePasskeyLogin(); this
      // component unmounts before reaching here in the happy path.
    } catch {
      onError('Face ID sign-in did not go through. Please try again or use your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-[#6B7A72]">
        <span className="h-px flex-1 bg-[#1B3A2D]/10" />
        or
        <span className="h-px flex-1 bg-[#1B3A2D]/10" />
      </div>
      <button
        type="button"
        onClick={handlePress}
        disabled={busy}
        className="mef-press flex w-full items-center justify-center gap-2 rounded-full border border-[#1B3A2D]/15 bg-white px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#EFF6F1] disabled:opacity-60"
      >
        {busy ? 'Checking Face ID…' : 'Sign in with Face ID'}
      </button>
    </>
  );
}
