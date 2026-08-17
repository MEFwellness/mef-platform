'use client';

/**
 * Root's one-time hydration question (conditional water tracking,
 * migration 163) — the same question new members are asked at intake
 * (baseline_hydration), put to members who finished intake before it
 * existed, in Root's voice.
 *
 * Same modal chrome, same "Maybe later" / "Ignore" escape pair, and the
 * same answer-then-reflect-then-Done shape as the day-3 follow-up in
 * RootMessagePopupClient, which is what this is modelled on. It is a
 * separate component rather than another branch in that file's ternary
 * chains for the same reason ResetPlanPopup is: its answers write a
 * profile flag rather than an experiment response, and nothing in those
 * chains fits.
 *
 * Nothing here is destructive. Answering "I drink plenty" turns water off
 * everywhere, but every cup she has ever logged stays exactly where it is,
 * and a coach (or a later change of heart, via her coach) can turn it back
 * on and find the history intact.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setMyHydrationFocusAction } from '@/app/actions/hydration';
import {
  HYDRATION_ANSWER_LABELS,
  HYDRATION_ANSWER_VALUES,
  HYDRATION_PROMPT,
  hydrationFocusFromAnswer,
  type HydrationAnswerValue,
} from '@/lib/hydration/constants';

/** No em dashes, per the app copy rule. */
const INTRO =
  'One quick thing, so I only ask you to track what actually matters for you.';

const REFLECTION_TRACKED =
  "Good to know. I'll keep water where you can log it, and we'll watch it together.";

const REFLECTION_NOT_TRACKED =
  "Good to know. I'll leave water out of your tracking from here, and nothing will count against you for it.";

export function HydrationFocusPopup({
  isPending: parentPending,
  onMaybeLater,
  onIgnore,
  onClose,
}: {
  isPending: boolean;
  onMaybeLater: () => void;
  onIgnore: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [answered, setAnswered] = useState<HydrationAnswerValue | null>(null);
  const [isSaving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const busy = isSaving || parentPending;

  function handlePick(value: HydrationAnswerValue) {
    setError(null);
    const focus = hydrationFocusFromAnswer(value);
    if (focus === null) return;

    startTransition(async () => {
      const result = await setMyHydrationFocusAction(focus);
      if (result.error) {
        setError(result.error);
        return;
      }
      setAnswered(value);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-[#0E1F17]/55 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="root-hydration-popup-title"
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/10"
          aria-hidden="true"
        />

        <p
          id="root-hydration-popup-title"
          className="relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]"
        >
          From Root
        </p>

        {answered ? (
          <>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">
              {hydrationFocusFromAnswer(answered) ? REFLECTION_TRACKED : REFLECTION_NOT_TRACKED}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mef-focus-ring mef-press relative mt-6 inline-flex items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">{INTRO}</p>
            <p className="relative mt-3 text-[16px] font-medium leading-relaxed text-[#F5F0E4]">
              {HYDRATION_PROMPT}
            </p>

            {error && <p className="relative mt-3 text-sm text-[#F5B7A0]">{error}</p>}

            <div className="relative mt-5 space-y-2">
              {HYDRATION_ANSWER_VALUES.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  onClick={() => handlePick(value)}
                  className="mef-focus-ring mef-press block w-full rounded-2xl border border-[#F5F0E4]/20 px-5 py-3 text-left text-sm font-medium text-[#F5F0E4] transition hover:border-[#C4A050]/70 hover:bg-[#F5F0E4]/[0.06] disabled:opacity-50"
                >
                  {HYDRATION_ANSWER_LABELS[value]}
                </button>
              ))}
            </div>

            <div className="relative mt-6 flex items-center justify-center gap-6 border-t border-[#F5F0E4]/10 pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={onMaybeLater}
                className="mef-press text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
              >
                Maybe later
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onIgnore}
                className="mef-press text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
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
