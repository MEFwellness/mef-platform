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
import type { Route } from 'next';
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
import { PriorityCardPopup } from '@/components/priority/PriorityCardPopup';
import { TrackPriorityShown } from '@/components/priority/TrackPriorityShown';
import { WeeklyReviewPopup } from '@/components/weekly-review/WeeklyReviewPopup';
import { TrackWeeklyReviewViewed } from '@/components/weekly-review/TrackWeeklyReviewViewed';
import { HydrationFocusPopup } from '@/components/hydration/HydrationFocusPopup';
import { WEEKLY_REFLECTION_COPY } from '@/lib/weekly-reflection/copy';

type OfferMessage = Extract<RootPopupMessage, { kind: 'cvs_offer' | 'lsc_offer' | 'rpl_offer' }>;
type ResetPlanMessage = Extract<RootPopupMessage, { kind: 'reset_plan_day3' | 'reset_plan_day7' }>;
type QuestionnaireAssignedMessage = Extract<RootPopupMessage, { kind: 'questionnaire_assigned' }>;
type FreeArcMessage = Extract<RootPopupMessage, { kind: 'free_arc_available' }>;
type PriorityCardMessage = Extract<RootPopupMessage, { kind: 'priority_card' }>;
type WeeklyReviewMessage = Extract<RootPopupMessage, { kind: 'weekly_review' }>;
type WeeklyReflectionMessage = Extract<RootPopupMessage, { kind: 'weekly_reflection' }>;
type HydrationFocusMessage = Extract<RootPopupMessage, { kind: 'hydration_focus' }>;

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
  // The Priority Card pops once per calendar day. Its message key already
  // carries the member's own local date, so marking it dismissed the
  // instant it is shown makes "once per day" true regardless of whether
  // she taps a button, closes the tab, or navigates away. Tomorrow's key is
  // a different message and pops again. Same mechanism the one-time offers
  // already use, applied to a date-scoped key.
  const isPriorityCard = message.kind === 'priority_card';
  // The Weekly Root Review pops once per the member's own local week, by the
  // same mechanism: its message key carries her week start, so marking it
  // dismissed the instant it is shown makes "once per week" true regardless
  // of whether she acknowledges, closes the tab, or navigates away. Next
  // Monday's key is a different message. The review stays reachable on Home
  // for the rest of the week either way, which is what makes one showing the
  // right number.
  const isWeeklyReview = message.kind === 'weekly_review';
  const isQuestionnaireAssigned = message.kind === 'questionnaire_assigned';
  const isFreeArcAvailable = message.kind === 'free_arc_available';
  // The Weekly Reflection is an invitation with real "Maybe later" and
  // "Ignore" buttons, so it is deliberately NOT in the auto-dismiss-on-
  // mount group below, exactly like the two invite kinds above it. A
  // member who closes the tab before reading it gets it again on her next
  // login inside the Friday-to-Sunday window, which is what the brief's
  // fallback rules ask for.
  const isWeeklyReflection = message.kind === 'weekly_reflection';

  // The offer pops up at most once ever (unlike day3/day7, which return on
  // every login until answered or explicitly ignored) — marking it
  // 'ignored' the instant it's shown, rather than only on an explicit
  // dismiss, is what makes that true regardless of whether the member acts
  // on it, closes the tab, or navigates away. A no-op for every other
  // kind, including the plan's own — every hook in this component must run
  // unconditionally regardless of message.kind (rules of hooks), so this
  // can't be skipped by an earlier return. `questionnaire_assigned` and
  // `free_arc_available` are deliberately NOT in this auto-dismiss-on-mount
  // group (FIX 5, 2026-08-03) — both now use the same real "Maybe
  // later"/"Ignore" button choice as day3/day7 (handleMaybeLater/
  // handleIgnore below), not an automatic one-time-ever dismissal.
  useEffect(() => {
    if (isOffer || isPriorityCard || isWeeklyReview) {
      ignoreRootPopupMessageAction(message.messageKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only depend on message.messageKey, so these are safe to call from
  // every branch below (the day3/day7 modal, and the shared invite popup
  // for questionnaire_assigned/free_arc_available) without re-deriving
  // them per branch.
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

  // The plan's daily-log shape (three explicit states, not a boolean) and
  // its own day-3/day-7 copy don't fit this component's CVS/LSC/RPL-
  // specific ternary chains below, so it gets its own small component
  // rather than being shoehorned in — same modal chrome, real separate
  // implementation. Placed after every hook above so this early return
  // never changes hook call order between renders.
  // Placed after every hook above so this early return never changes hook
  // call order between renders, same rule the Reset Plan branch below
  // follows. TrackPriorityShown records the 'popup' presentation; the
  // server side guarantees only one priority_shown event per day survives,
  // so this can never double-count against the inline card's own tracker.
  if (message.kind === 'priority_card') {
    return (
      <>
        <TrackPriorityShown
          rule={message.view.selected.rule}
          isReEntry={message.view.isReEntry}
          presentation="popup"
        />
        <PriorityCardPopup
          view={message.view}
          closed={closed}
          onClose={() => {
            setClosed(true);
            router.refresh();
          }}
        />
      </>
    );
  }

  // The Weekly Root Review. Placed after every hook above so this early
  // return never changes hook call order between renders, same rule the
  // Priority Card branch above and the Reset Plan branch below follow.
  // TrackWeeklyReviewViewed records that it reached her; the server side
  // guarantees only one weekly_review_viewed event per week survives, so
  // this can never double-count against Home's persistent entry.
  if (message.kind === 'weekly_review') {
    return (
      <>
        <TrackWeeklyReviewViewed weekStart={message.weekStart} />
        <WeeklyReviewPopup
          review={message.review}
          label={message.label}
          closed={closed}
          onClose={() => {
            setClosed(true);
            router.refresh();
          }}
        />
      </>
    );
  }

  if (message.kind === 'reset_plan_day3' || message.kind === 'reset_plan_day7') {
    return <ResetPlanPopup message={message} onClose={() => setClosed(true)} closed={closed} />;
  }

  // Conditional water tracking's one-time question (migration 163). Its own
  // component for the same reason the Reset Plan has one: its answers write
  // a profile flag, not an experiment response, so none of the CVS/LSC/RPL
  // ternary chains below fit it. Deliberately NOT in the
  // auto-dismiss-on-mount group above — this is a real question with a real
  // "Maybe later" (ask again next login) and "Ignore" (never again), same
  // as day3/day7, and it must not be silently retired by a member who
  // simply closed the tab before reading it.
  // Placed after every hook above so this early return never changes hook
  // call order between renders.
  if (message.kind === 'hydration_focus') {
    if (closed) return null;
    return (
      <HydrationFocusPopup
        isPending={isPending}
        onMaybeLater={handleMaybeLater}
        onIgnore={handleIgnore}
        onClose={() => {
          setClosed(true);
          router.refresh();
        }}
      />
    );
  }

  if (closed) return null;

  if (isQuestionnaireAssigned) {
    const m = message as QuestionnaireAssignedMessage;
    return (
      <RootInvitePopup
        eyebrow="From your coach"
        title="Something new from your coach"
        body={`Your coach has assigned you the ${m.displayName} questionnaire. It helps Root understand you more deeply, and your answers go straight to your coach.`}
        ctaLabel="Start now"
        href={m.primaryHref}
        isPending={isPending}
        onMaybeLater={handleMaybeLater}
        onIgnore={handleIgnore}
      />
    );
  }

  if (isFreeArcAvailable) {
    const m = message as FreeArcMessage;
    return (
      <RootInvitePopup
        eyebrow="From Root"
        title={m.displayName}
        body={m.description}
        ctaLabel="Start now"
        href={m.primaryHref}
        isPending={isPending}
        onMaybeLater={handleMaybeLater}
        onIgnore={handleIgnore}
      />
    );
  }

  // The Weekly Reflection. Same invite chrome as the two above, on
  // purpose: this is Root offering her a thing to open, and the experience
  // itself lives on its own route where there is room for it.
  if (isWeeklyReflection) {
    const m = message as WeeklyReflectionMessage;
    return (
      <RootInvitePopup
        eyebrow={WEEKLY_REFLECTION_COPY.popupEyebrow}
        title={m.title}
        body={m.body}
        ctaLabel={WEEKLY_REFLECTION_COPY.popupCta}
        href={m.primaryHref}
        isPending={isPending}
        onMaybeLater={handleMaybeLater}
        onIgnore={handleIgnore}
      />
    );
  }

  if (isOffer) {
    return <RootOfferPopup message={message as OfferMessage} onClose={() => setClosed(true)} />;
  }

  // Narrowed once, right after the offer early-return above, so every
  // reference below (including inside the closures further down, which TS
  // can't narrow on its own from an outer `if`) can safely use
  // day3Or7Message.experimentId/topLabelText/logs/durationDays — real
  // fields on all four remaining variants, never on the offer kinds or the
  // two invite kinds (coach-assigned-questionnaire, free-arc-available).
  const day3Or7Message = message as Exclude<
    RootPopupMessage,
    | OfferMessage
    | ResetPlanMessage
    | QuestionnaireAssignedMessage
    | FreeArcMessage
    | PriorityCardMessage
    | WeeklyReviewMessage
    | WeeklyReflectionMessage
    | HydrationFocusMessage
  >;

  const isDay3 = day3Or7Message.kind === 'cvs_day3' || day3Or7Message.kind === 'lsc_day3' || day3Or7Message.kind === 'rpl_day3';

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
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
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
              className="mef-focus-ring mef-press relative mt-6 inline-flex items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95"
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
                    className="mef-focus-ring mef-press block w-full rounded-2xl border border-[#F5F0E4]/20 px-5 py-3 text-left text-sm font-medium text-[#F5F0E4] transition hover:border-[#C4A050]/70 hover:bg-[#F5F0E4]/[0.06] disabled:opacity-50"
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
                className="mef-focus-ring mef-press relative mt-5 inline-flex items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50"
              >
                Got it
              </button>
            )}

            <div className="relative mt-6 flex items-center justify-center gap-6 border-t border-[#F5F0E4]/10 pt-4">
              <button
                type="button"
                disabled={isPending}
                onClick={handleMaybeLater}
                className="mef-press text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
              >
                Maybe later
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleIgnore}
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
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
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
          className="mef-focus-ring mef-press relative mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50"
        >
          {theory.button}
        </button>

        <div className="relative mt-6 flex items-center justify-center border-t border-[#F5F0E4]/10 pt-4">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="mef-press text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The shared "Root has something waiting for you" invite pop-up (FIX 5,
 * 2026-08-03) — used by both `questionnaire_assigned` (a coach's
 * assignment) and `free_arc_available` (the next unstarted Core Values
 * Snapshot / Life Signal Check / Readiness Pulse conversation). Same modal
 * chrome as the day3/day7 pop-up above, and the same real "Maybe later"
 * (snoozes — the dashboard card gets the gold "Waiting on you" badge, pops
 * again next login) / "Ignore" (never pops again, card stays) choice,
 * instead of the old one-time-ever auto-dismiss-on-mount shape this
 * replaced. "Start now" just navigates straight into the destination
 * route — neither kind needs a separate start action (assessment_assignments
 * already marks itself completed on finish via migration 144's trigger;
 * a free-arc conversation's own take flow already handles begin-vs-resume
 * on its own).
 */
function RootInvitePopup({
  eyebrow,
  title,
  body,
  ctaLabel,
  href,
  isPending,
  onMaybeLater,
  onIgnore,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  isPending: boolean;
  onMaybeLater: () => void;
  onIgnore: () => void;
}) {
  const router = useRouter();

  function handleStart() {
    router.push(href as Route);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-[#0E1F17]/55 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="root-invite-popup-title"
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#C4A050]/16 blur-3xl"
          aria-hidden="true"
        />

        <p className="relative text-xs font-semibold uppercase tracking-wider text-[#C4A050]">
          {eyebrow}
        </p>

        <h2
          id="root-invite-popup-title"
          className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-2xl leading-tight text-[#F5F0E4]"
        >
          {title}
        </h2>

        <p className="relative mt-3 text-[16px] leading-relaxed text-[#F5F0E4]">{body}</p>

        <button
          type="button"
          disabled={isPending}
          onClick={handleStart}
          className="mef-focus-ring mef-press relative mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:opacity-50"
        >
          {ctaLabel}
        </button>

        <div className="relative mt-6 flex items-center justify-center gap-6 border-t border-[#F5F0E4]/10 pt-4">
          <button
            type="button"
            disabled={isPending}
            onClick={onMaybeLater}
            className="mef-press text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
          >
            Maybe later
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onIgnore}
            className="mef-press text-xs font-medium text-[#F5F0E4]/60 underline underline-offset-2 transition hover:text-[#F5F0E4] disabled:opacity-50"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}
