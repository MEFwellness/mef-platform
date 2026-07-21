'use client';

import { Moon } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

/**
 * The one-time "come back for Evening Reflection" message, shown right
 * after a member's first Morning Readiness save that hasn't already seen
 * it (see CheckinForm.tsx and profiles.evening_reflection_reminder_shown_at,
 * migration 87). Same overlay/dialog pattern as
 * components/wearables/WearableWelcomeModal.tsx, but with a single
 * acknowledgement action instead of two choices: there's nothing to
 * decline here, just a "got it."
 */
export function EveningReminderModal({ onAcknowledge }: { onAcknowledge: () => void }) {
  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-[#1B3A2D]/30 backdrop-blur-[2px]" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evening-reminder-title"
        className="relative w-full max-w-sm rounded-[28px] bg-white p-7 shadow-[0_24px_64px_-12px_rgba(27,58,45,0.35)]"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1B3A2D]/[0.06]">
          <Moon className="h-5 w-5 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h2
          id="evening-reminder-title"
          className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#1B3A2D]"
        >
          Great job completing your Morning Readiness.
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-[#6B7A72]">
          Before your day ends, come back and complete your Evening Reflection.
        </p>
        <p className="mt-2.5 text-sm leading-relaxed text-[#6B7A72]">
          Comparing how your day begins and ends helps us recognize patterns that would otherwise be
          missed.
        </p>
        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-6 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-5 py-3 text-sm font-medium text-white transition hover:brightness-110"
        >
          Got It
        </button>
      </div>
    </div>
  );
}
