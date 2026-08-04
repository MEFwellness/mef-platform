'use client';

/**
 * "Enable Face ID Login" — lives in Profile's Account card. A member must
 * already be signed in to reach this (registerPasskey() requires an active
 * session), which this page already guarantees. Browser support
 * (lib/passkey/support.ts) is checked once on mount; an unsupported browser
 * gets a short, plain explanation instead of a dead button, per this
 * feature's own requirement, rather than being hidden outright — unlike
 * components/auth/PasskeyLoginButton.tsx on the signed-out login screen,
 * a member is already looking at their own Profile page here, so there is
 * something real to explain ("not this browser") rather than nothing to
 * say.
 */

import { useEffect, useState } from 'react';
import { Fingerprint, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isPasskeySupported } from '@/lib/passkey/support';
import { getFriendlyPasskeyError, isPasskeyCancelled } from '@/lib/passkey/errors';

interface PasskeyRow {
  id: string;
  friendly_name: string | undefined;
}

type Status = 'checking' | 'unsupported' | 'ready';

export function PasskeyEnrollment() {
  const [status, setStatus] = useState<Status>('checking');
  const [passkeys, setPasskeys] = useState<PasskeyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = await isPasskeySupported();
      if (cancelled) return;
      if (!supported) {
        setStatus('unsupported');
        return;
      }
      // Best-effort — if this project hasn't enabled passkeys yet, or the
      // request fails for any other reason, this just shows the "off"
      // state (an empty list). Tapping "Enable Face ID Login" will hit the
      // same condition and surface a real, specific explanation then.
      const supabase = createClient();
      const { data } = await supabase.auth.passkey.list();
      if (cancelled) return;
      setPasskeys((data ?? []).map((item) => ({ id: item.id, friendly_name: item.friendly_name })));
      setStatus('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = async () => {
    if (busy) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: registerError } = await supabase.auth.registerPasskey();
      if (registerError) {
        if (!isPasskeyCancelled(registerError)) setError(getFriendlyPasskeyError(registerError));
        return;
      }
      setPasskeys((prev) => [...prev, { id: data.id, friendly_name: data.friendly_name }]);
      setMessage('Face ID Login is on.');
    } catch {
      setError('Something went wrong turning on Face ID Login. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (passkeyId: string) => {
    if (busy) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase.auth.passkey.delete({ passkeyId });
      if (deleteError) {
        setError(getFriendlyPasskeyError(deleteError));
        return;
      }
      setPasskeys((prev) => prev.filter((passkey) => passkey.id !== passkeyId));
      setMessage('Face ID Login turned off for that device.');
    } catch {
      setError('Something went wrong turning that off. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'checking') {
    return <div className="h-5 w-40 animate-pulse rounded-full bg-[#1B3A2D]/[0.06]" />;
  }

  if (status === 'unsupported') {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6B7A72]">
        <Fingerprint className="h-4 w-4 shrink-0 opacity-40" strokeWidth={1.75} aria-hidden="true" />
        <p>Face ID Login isn&apos;t available in this browser.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-[#1B3A2D]">
        <Fingerprint className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-medium">Face ID Login</p>
      </div>

      {passkeys.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="flex items-center justify-between text-sm text-[#6B7A72]">
              <span>{passkey.friendly_name || 'This device'}</span>
              <button
                type="button"
                onClick={() => handleRemove(passkey.id)}
                disabled={busy}
                className="flex items-center gap-1 text-xs font-medium text-[#6B7A72] underline underline-offset-2 disabled:opacity-60"
              >
                <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={handleEnable}
        disabled={busy}
        className="mef-press mt-2.5 flex items-center justify-center rounded-full border border-[#1B3A2D]/15 bg-white px-4 py-2 text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#EFF6F1] disabled:opacity-60"
      >
        {busy
          ? 'Checking Face ID…'
          : passkeys.length > 0
            ? 'Add Face ID on this device'
            : 'Enable Face ID Login'}
      </button>

      {error && (
        <p role="alert" className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {message && !error && (
        <p role="status" className="mt-2 text-xs text-[#6B7A72]">
          {message}
        </p>
      )}
    </div>
  );
}
