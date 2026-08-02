'use client';

/**
 * The Personal Reset Plan's own day-3/day-7 pop-up, matching
 * RootMessagePopupClient.tsx's exact modal chrome (dark card, "From
 * Root" label, Maybe later/Ignore footer) but with its own three-state-
 * aware content, since the plan's daily-log shape and copy don't fit that
 * component's CVS/LSC/RPL-specific ternary chains.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RESET_PLAN_DAY3_OPTIONS, type ResetPlanDay3Response } from '@/lib/reset-plan/constants';
import { buildResetPlanDay3Prompt, buildResetPlanDay3Reflection, buildResetPlanDay7Reflection } from '@/lib/reset-plan/copy';
import { acknowledgeResetPlanDay7Action, submitResetPlanDay3ResponseAction } from '@/app/actions/resetPlan';
import { snoozeRootPopupMessageAction, ignoreRootPopupMessageAction, type RootPopupMessage } from '@/app/actions/rootPopupMessages';

type ResetPlanMessage = Extract<RootPopupMessage, { kind: 'reset_plan_day3' | 'reset_plan_day7' }>;

export function ResetPlanPopup({ message, onClose, closed }: { message: ResetPlanMessage; onClose: () => void; closed: boolean }) {
  const router = useRouter();
  const [day3Response, setDay3Response] = useState<ResetPlanDay3Response | null>(null);
  const [day7Acknowledged, setDay7Acknowledged] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (closed || day7Acknowledged) return null;

  const isDay3 = message.kind === 'reset_plan_day3';

  function handleMaybeLater() {
    onClose();
    startTransition(() => {
      snoozeRootPopupMessageAction(message.messageKey).then(() => router.refresh());
    });
  }

  function handleIgnore() {
    onClose();
    startTransition(() => {
      ignoreRootPopupMessageAction(message.messageKey).then(() => router.refresh());
    });
  }

  function handleDay3Pick(value: ResetPlanDay3Response) {
    setError(null);
    startTransition(async () => {
      const result = await submitResetPlanDay3ResponseAction(message.planId, value);
      if (!result.ok) {
        setError(result.error ?? 'Could not save that.');
        return;
      }
      setDay3Response(value);
      router.refresh();
    });
  }

  function handleDay7Acknowledge() {
    setError(null);
    startTransition(async () => {
      const result = await acknowledgeResetPlanDay7Action(message.planId);
      if (!result.ok) {
        setError(result.error ?? 'Could not save that.');
        return;
      }
      setDay7Acknowledged(true);
      router.refresh();
    });
  }

  const answered = isDay3 && day3Response !== null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-[#0E1F17]/55 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-plan-popup-title"
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/10" aria-hidden="true" />

        <p id="reset-plan-popup-title" className="relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
          From Root
        </p>

        {answered ? (
          <>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">{buildResetPlanDay3Reflection(day3Response as ResetPlanDay3Response)}</p>
            <button
              type="button"
              onClick={onClose}
              className="mef-focus-ring relative mt-6 inline-flex items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">
              {isDay3 ? buildResetPlanDay3Prompt(message.focusSignal) : buildResetPlanDay7Reflection(message.logs, message.focusSignal)}
            </p>

            {error && <p className="relative mt-3 text-sm text-[#F5B7A0]">{error}</p>}

            {isDay3 ? (
              <div className="relative mt-5 space-y-2">
                {RESET_PLAN_DAY3_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDay3Pick(option.value)}
                    className="mef-focus-ring block w-full rounded-2xl border border-[#F5F0E4]/20 px-5 py-3 text-left text-sm font-medium text-[#F5F0E4] transition hover:border-[#C4A050]/70 hover:bg-[#F5F0E4]/[0.06] disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={handleDay7Acknowledge}
                className="mef-focus-ring relative mt-5 inline-flex items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50"
              >
                Got it
              </button>
            )}

            <div className="relative mt-6 flex items-center justify-center gap-6 border-t border-[#F5F0E4]/10 pt-4">
              <button
                type="button"
                disabled={isPending}
                onClick={handleMaybeLater}
                className="text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
              >
                Maybe later
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleIgnore}
                className="text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
              >
                Ignore
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
