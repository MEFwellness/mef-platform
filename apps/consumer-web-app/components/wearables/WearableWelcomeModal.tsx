'use client';

/**
 * One-time premium welcome modal steering a new member toward connecting
 * a wearable, the first time they land on the Dashboard. Dismissal
 * (either button) is remembered in localStorage — same "client-only,
 * per-browser, never shown again" precedent as MessageInput.tsx's
 * PRIVACY_ACK_KEY — rather than a new profiles column, since this is a
 * one-off UI nudge, not durable account state worth a migration.
 *
 * Only ever rendered by the Dashboard when the server already knows no
 * wearable is connected yet; this component's only job is the "have we
 * already shown it in this browser" check, never the connection check
 * itself.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

const DISMISSED_KEY = 'mef_wearable_welcome_dismissed';

export function WearableWelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem(DISMISSED_KEY)) setVisible(true);
  }, []);

  useBodyScrollLock(visible);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div
        className="absolute inset-0 bg-[#1B3A2D]/30 backdrop-blur-[2px]"
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wearable-welcome-title"
        className="relative w-full max-w-sm rounded-[28px] bg-white p-7 shadow-[0_24px_64px_-12px_rgba(27,58,45,0.35)]"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F5B700]/15">
          <Sparkles className="h-5 w-5 text-[#854D0E]" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h2
          id="wearable-welcome-title"
          className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]"
        >
          Get the Most From Root
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-[#6B7A72]">
          Connect your wearable to unlock personalized recovery insights, adaptive coaching, sleep
          recommendations, and smarter daily guidance.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/connections"
            onClick={dismiss}
            className="flex items-center justify-center rounded-full bg-[#1B3A2D] px-5 py-3 text-sm font-medium text-white transition hover:brightness-110"
          >
            Connect Device
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-5 py-3 text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D]"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
