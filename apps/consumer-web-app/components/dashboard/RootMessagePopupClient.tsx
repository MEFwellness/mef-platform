'use client';

/**
 * Root's pop-up message — the day-3/day-7 Weekly Experiment follow-ups,
 * plus each experience's own "start it later" offer, shown as a modal
 * right after login instead of only sitting as a card
 * (components/dashboard/ActiveExperimentsSection.tsx, both
 * unchanged and still the permanent, unlimited fallback home for these
 * same messages). Reuses the exact same copy functions and per-experience
 * server actions as those cards (lib/core-values-snapshot/copy.ts,
 * app/actions/coreValuesSnapshot.ts, app/actions/lifeSignalCheck.ts) so
 * "answer/start here" and "answer/start on the card" are one real system,
 * not two, for either experience.
 *
 * Deliberately has no backdrop-click/Escape dismissal — the whole point is
 * that nobody misses this message, so the only ways out are answering it,
 * or one of the two explicit escape buttons below.
 *
 * router.refresh() after every action (answer, Maybe later, Ignore, Start,
 * Not now) re-fetches the Server Components on this page — including
 * CvsCheckinCard's/LscCheckinCard's own independent fetch of the same
 * message — so the on-page card picks up the new state (gone once
 * answered, badged once snoozed, showing "Day 1 of 7" once started)
 * without a full page reload.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CVS_DAY3_OPTIONS, cvsDay3FollowUpText, cvsDay3ReflectionText, cvsDay7FollowUpText, buildExperimentTheoryCopy } from '@/lib/core-values-snapshot/copy';
import { lscDay3FollowUpText, lscDay3ReflectionText, lscDay7FollowUpText, buildLscExperimentTheoryCopy } from '@/lib/life-signal-check/copy';
import { rplDay3FollowUpText, rplDay3ReflectionText, rplDay7FollowUpText, rplNoticingDay7Text, rplExperimentIntroCopy } from '@/lib/readiness-pulse/copy';
import { acknowledgeCvsDay7Action, submitCvsDay3ResponseAction, startCvsExperimentAction } from '@/app/actions/coreValuesSnapshot';
import { acknowledgeLscDay7Action, submitLscDay3ResponseAction, startLscExperimentAction } from '@/app/actions/lifeSignalCheck';
import { acknowledgeRplDay7Action, submitRplDay3ResponseAction, startRplExperimentAction } from '@/app/actions/readinessPulse';
import { snoozeRootPopupMessageAction, ignoreRootPopupMessageAction, type RootPopupMessage } from '@/app/actions/rootPopupMessages';
import { classifyDay7Pattern, type Day3Response } from '@/lib/core-values-snapshot/experiment';
import { appendCallback } from '@/lib/memory-callback/copy';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { ResetPlanPopup } from '@/components/reset-plan/ResetPlanPopup';

type OfferMessage = Extract<RootPopupMessage, { kind: 'cvs_offer' | 'lsc_offer' | 'rpl_offer' }>;
type ResetPlanMessage = Extract<RootPopupMessage, { kind: 'reset_plan_day3' | 'reset_plan_day7' }>;

/** Dispatches both which copy functions and which server action to call per message.kind — Core Values Snapshot and Life Signal Check's day-3 question/reflection text happen to read the same (both fully generic, never Core-Values-Snapshot-specific), but their day-7 bridge line differs, so this never assumes the two are interchangeable. */
export function RootMessagePopupClient({ message }: { message: RootPopupMessage }) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const [day3Response, setDay3Response] = useState<Day3Response | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(!closed);

  // Real, pre-existing bug found while building the Personal Reset Plan:
  // this check was never updated for 'rpl_offer' when Readiness Pulse
  // introduced it (migration 141) — an rpl_offer message fell through
  // into the day3/day7 branch below instead, which unconditionally reads
  // .logs (a field only day3/day7 messages have), crashing the entire
  // dashboard for any member who ever reached that specific case (which
  // requires cvs_offer and lsc_offer to already be resolved — a
  // combination the separate offer-starvation bug fixed alongside this
  // one, in app/actions/rootPopupMessages.ts, had been making
  // effectively unreachable until now).
  const isOffer = message.kind === 'cvs_offer' || message.kind === 'lsc_offer' || message.kind === 'rpl_offer';

  // The offer pops up at most once ever (unlike day3/day7, which return on
  // every login until answered or explicitly ignored) — marking it
  // 'ignored' the instant it's shown, rather than only on an explicit
  // dismiss, is what makes that true regardless of whether the member acts
  // on it, closes the tab, or navigates away. The dashboard card stays the
  // permanent, un-timed way to start it later either way. A no-op for
  // every other kind, including the plan's own — every hook in this
  // component must run unconditionally regardless of message.kind (rules
  // of hooks), so this can't be skipped by an earlier return.
  useEffect(() => {
    if (isOffer) {
      ignoreRootPopupMessageAction(message.messageKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The plan's daily-log shape (three explicit states, not a boolean) and
  // its own day-3/day-7 copy don't fit this component's CVS/LSC/RPL-
  // specific ternary chains below, so it gets its own small component
  // rather than being shoehorned in — same modal chrome, real separate
  // implementation. Placed after every hook above so this early return
  // never changes hook call order between renders.
  if (message.kind === 'reset_plan_day3' || message.kind === 'reset_plan_day7') {
    return <ResetPlanPopup message={message} onClose={() => setClosed(true)} closed={closed} />;
  }

  if (closed) return null;

  if (isOffer) {
    return <RootOfferPopup message={message as OfferMessage} onClose={() => setClosed(true)} />;
  }

  // Narrowed once, right after the offer early-return above, so every
  // reference below (including inside the closures further down, which TS
  // can't narrow on its own from an outer `if`) can safely use
  // day3Or7Message.experimentId/topLabelText/logs/durationDays — real
  // fields on all four remaining variants, never on the two offer kinds.
  const day3Or7Message = message as Exclude<RootPopupMessage, OfferMessage | ResetPlanMessage>;

  const isDay3 = day3Or7Message.kind === 'cvs_day3' || day3Or7Message.kind === 'lsc_day3' || day3Or7Message.kind === 'rpl_day3';

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
        day3Or7Message.kind === 'cvs_day3'
          ? await submitCvsDay3ResponseAction(day3Or7Message.experimentId, value)
          : day3Or7Message.kind === 'lsc_day3'
            ? await submitLscDay3ResponseAction(day3Or7Message.experimentId, value)
            : await submitRplDay3ResponseAction(day3Or7Message.experimentId, value);
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
        day3Or7Message.kind === 'cvs_day7'
          ? await acknowledgeCvsDay7Action(day3Or7Message.experimentId)
          : day3Or7Message.kind === 'lsc_day7'
            ? await acknowledgeLscDay7Action(day3Or7Message.experimentId)
            : await acknowledgeRplDay7Action(day3Or7Message.experimentId);
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
              {day3Or7Message.kind === 'cvs_day3'
                ? cvsDay3ReflectionText(day3Response as Day3Response)
                : day3Or7Message.kind === 'lsc_day3'
                  ? lscDay3ReflectionText(day3Response as Day3Response)
                  : rplDay3ReflectionText(day3Response as Day3Response)}
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
              {day3Or7Message.kind === 'cvs_day3'
                ? cvsDay3FollowUpText(day3Or7Message.topLabelText)
                : day3Or7Message.kind === 'lsc_day3'
                  ? lscDay3FollowUpText(day3Or7Message.topLabelText)
                  : day3Or7Message.kind === 'rpl_day3'
                    ? rplDay3FollowUpText(day3Or7Message.topLabelText)
                    : day3Or7Message.kind === 'cvs_day7'
                      ? appendCallback(
                          cvsDay7FollowUpText(day3Or7Message.topLabelText, classifyDay7Pattern(day3Or7Message.logs, day3Or7Message.durationDays).pattern),
                          day3Or7Message.goalCallback
                        )
                      : day3Or7Message.kind === 'lsc_day7'
                        ? appendCallback(
                            lscDay7FollowUpText(day3Or7Message.topLabelText, classifyDay7Pattern(day3Or7Message.logs, day3Or7Message.durationDays).pattern),
                            day3Or7Message.goalCallback
                          )
                        : day3Or7Message.topLabelText === 'The Noticing'
                          ? rplNoticingDay7Text(day3Or7Message.logs.filter((l) => l.completed === true).length)
                          : appendCallback(
                              rplDay7FollowUpText(day3Or7Message.topLabelText, classifyDay7Pattern(day3Or7Message.logs, day3Or7Message.durationDays).pattern),
                              day3Or7Message.goalCallback
                            )}
            </p>

            {error && <p className="relative mt-3 text-sm text-[#F5B7A0]">{error}</p>}

            {isDay3 ? (
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

/**
 * The one-time "start it later" offer pop-up — Root's theory in one line
 * plus a button to start the 7 days, exactly the same theory copy and
 * start action CvsExperimentPanel.tsx/LscExperimentPanel.tsx's own offer
 * screen already use (buildExperimentTheoryCopy/buildLscExperimentTheoryCopy,
 * startCvsExperimentAction/startLscExperimentAction), so a member starting
 * here is the same real system as starting from the card. "Not now" just
 * closes — RootMessagePopupClient already recorded the one-time dismissal
 * the instant this mounted, so there's nothing left to do but hide it. If
 * starting fails (most likely the two-active-experiment cap), the real
 * error the action already returns is shown in place — the full close-out
 * flow for that case lives on the card (Life Signal Check's own), not
 * duplicated here.
 */
function RootOfferPopup({ message, onClose }: { message: OfferMessage; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const theory =
    message.kind === 'cvs_offer'
      ? buildExperimentTheoryCopy(message.scoring)
      : message.kind === 'lsc_offer'
        ? buildLscExperimentTheoryCopy(message.scoring)
        : (() => {
            const intro = rplExperimentIntroCopy(message.scoring);
            return { theory: intro.heading, body: intro.body, button: intro.button, followUpNote: intro.followUpNote };
          })();

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result =
        message.kind === 'cvs_offer'
          ? await startCvsExperimentAction(message.sessionId, message.scoring.topValue)
          : message.kind === 'lsc_offer'
            ? await startLscExperimentAction(message.sessionId, message.scoring.chosenSignal)
            : await startRplExperimentAction(message.sessionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-[#0E1F17]/55 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="root-offer-popup-title"
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/10"
          aria-hidden="true"
        />

        <p
          id="root-offer-popup-title"
          className="relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]"
        >
          From Root
        </p>

        <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">{theory.theory}</p>

        {error && <p className="relative mt-3 text-sm text-[#F5B7A0]">{error}</p>}

        <button
          type="button"
          disabled={isPending}
          onClick={handleStart}
          className="mef-focus-ring relative mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50"
        >
          {theory.button}
        </button>

        <div className="relative mt-6 flex items-center justify-center border-t border-[#F5F0E4]/10 pt-4">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
