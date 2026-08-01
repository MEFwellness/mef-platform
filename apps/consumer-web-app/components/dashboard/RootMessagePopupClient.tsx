'use client';

/**
 * Root's pop-up message — the day-3/day-7 Weekly Experiment follow-ups
 * shown as a modal right after login instead of only sitting as a card
 * (components/dashboard/CvsCheckinCard.tsx / LscCheckinCard.tsx, both
 * unchanged and still the fallback home for these same messages). Reuses
 * the exact same copy functions and per-experience server actions as
 * those cards (lib/core-values-snapshot/copy.ts,
 * app/actions/coreValuesSnapshot.ts, app/actions/lifeSignalCheck.ts) so
 * "answer here" and "answer on the card" are one real system, not two,
 * for either experience.
 *
 * Deliberately has no backdrop-click/Escape dismissal — the whole point is
 * that nobody misses this message, so the only ways out are answering it,
 * or one of the two explicit escape buttons below.
 *
 * router.refresh() after every action (answer, Maybe later, Ignore)
 * re-fetches the Server Components on this page — including
 * CvsCheckinCard's own independent fetch of the same message — so the
 * on-page card picks up the new state (gone once answered, badged once
 * snoozed) without a full page reload.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CVS_DAY3_OPTIONS, cvsDay3FollowUpText, cvsDay3ReflectionText, cvsDay7FollowUpText } from '@/lib/core-values-snapshot/copy';
import { lscDay3FollowUpText, lscDay3ReflectionText, lscDay7FollowUpText } from '@/lib/life-signal-check/copy';
import { acknowledgeCvsDay7Action, submitCvsDay3ResponseAction } from '@/app/actions/coreValuesSnapshot';
import { acknowledgeLscDay7Action, submitLscDay3ResponseAction } from '@/app/actions/lifeSignalCheck';
import { snoozeRootPopupMessageAction, ignoreRootPopupMessageAction, type RootPopupMessage } from '@/app/actions/rootPopupMessages';
import { classifyDay7Pattern, type Day3Response } from '@/lib/core-values-snapshot/experiment';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

/** Dispatches both which copy functions and which server action to call per message.kind — Core Values Snapshot and Life Signal Check's day-3 question/reflection text happen to read the same (both fully generic, never Core-Values-Snapshot-specific), but their day-7 bridge line differs, so this never assumes the two are interchangeable. */
export function RootMessagePopupClient({ message }: { message: RootPopupMessage }) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const [day3Response, setDay3Response] = useState<Day3Response | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(!closed);

  if (closed) return null;

  const isDay3 = message.kind === 'cvs_day3' || message.kind === 'lsc_day3';

  function handleMaybeLater() {
    setClosed(true);
    startTransition(() => {
      snoozeRootPopupMessageAction(message.messageKey).then(() => router.refresh());
    });
  }

  function handleIgnore() {
    setClosed(true);
    startTransition(() => {
      ignoreRootPopupMessageAction(message.messageKey).then(() => router.refresh());
    });
  }

  function handleDay3Pick(value: Day3Response) {
    setError(null);
    startTransition(async () => {
      const result =
        message.kind === 'cvs_day3'
          ? await submitCvsDay3ResponseAction(message.experimentId, value)
          : await submitLscDay3ResponseAction(message.experimentId, value);
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
      const result =
        message.kind === 'cvs_day7'
          ? await acknowledgeCvsDay7Action(message.experimentId)
          : await acknowledgeLscDay7Action(message.experimentId);
      if (!result.ok) {
        setError(result.error ?? 'Could not save that.');
        return;
      }
      setClosed(true);
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
        aria-labelledby="root-popup-title"
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/10"
          aria-hidden="true"
        />

        <p
          id="root-popup-title"
          className="relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]"
        >
          From Root
        </p>

        {answered ? (
          <>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">
              {message.kind === 'cvs_day3'
                ? cvsDay3ReflectionText(day3Response as Day3Response)
                : lscDay3ReflectionText(day3Response as Day3Response)}
            </p>
            <button
              type="button"
              onClick={() => setClosed(true)}
              className="mef-focus-ring relative mt-6 inline-flex items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">
              {message.kind === 'cvs_day3'
                ? cvsDay3FollowUpText(message.topLabelText)
                : message.kind === 'lsc_day3'
                  ? lscDay3FollowUpText(message.topLabelText)
                  : message.kind === 'cvs_day7'
                    ? cvsDay7FollowUpText(message.topLabelText, classifyDay7Pattern(message.logs, message.durationDays).pattern)
                    : lscDay7FollowUpText(message.topLabelText, classifyDay7Pattern(message.logs, message.durationDays).pattern)}
            </p>

            {error && <p className="relative mt-3 text-sm text-[#F5B7A0]">{error}</p>}

            {message.kind === 'cvs_day3' || message.kind === 'lsc_day3' ? (
              <div className="relative mt-5 space-y-2">
                {CVS_DAY3_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDay3Pick(option.value as Day3Response)}
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
