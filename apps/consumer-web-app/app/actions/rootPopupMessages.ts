/**
 * apps/consumer-web-app/app/actions/rootPopupMessages.ts
 *
 * Root's pop-up messages — proactive Root coaching messages that expect a
 * response or acknowledgment, surfaced as a modal right after login
 * instead of only sitting as a card. Today these are the Core Values
 * Snapshot and Life Signal Check Weekly Experiment day-3/day-7 follow-ups
 * (components/core-values-snapshot/CvsFollowUpCards.tsx), plus each
 * experience's "start it later" offer (CvsExperimentPanel.tsx /
 * LscExperimentPanel.tsx via components/dashboard/ActiveExperimentsSection.tsx) —
 * everything here is written so a future message of the same shape (a
 * real answer/acknowledge/act affordance, not just an observation) only
 * needs a new case in getMyRootPopupMessageAction, not a new
 * dismissal/eligibility system.
 *
 * The offer message pops up at most once ever, unlike day3/day7 (which
 * keep returning on every new login until answered or explicitly
 * ignored) — see getMyRootPopupMessageAction's offer branch. The
 * dashboard card is the permanent, unlimited home for starting the
 * experiment either way; the pop-up is just a one-time spotlight on it.
 *
 * No parallel data store for "is there a message" — this thinly wraps the
 * existing getMyCvsExperimentStatusAction/getMyLscExperimentStatusAction
 * (plus getMyCvsOfferAction/getMyLscOfferAction for the offer case) and
 * the shared resolveCvsCheckinPending rule
 * (lib/core-values-snapshot/experiment.ts), same discipline as every other
 * file in app/actions. When more than one of a member's messages (across
 * both experiences, and now including each experience's own offer) are
 * pending at once, Core Values Snapshot (the older experience) wins the
 * pop-up slot first, and within an experience day 3 beats day 7 beats the
 * offer — the loser simply waits as its own dashboard card until the
 * winner is resolved, same "one at a time" rule already used between day
 * 3 and day 7 within a single experience.
 *
 * Questionnaires-and-Experiences-as-Pop-ups (2026-08-03) added one new
 * message kind, `free_arc_available` (the next unstarted Core Values
 * Snapshot / Life Signal Check / Readiness Pulse conversation — see
 * lib/root-popup-messages/freeArc.ts), lowest priority of everything here:
 * an invitation to start something new always yields to continuing
 * something already active. The same task also switched
 * `questionnaire_assigned` from a one-time-ever pop-up to the same
 * recurring snoozed/ignored semantics as day3/day7 ("Maybe later" actually
 * means "ask again next login" now, not "never again"), and removed the
 * `hasCheckins` gate that used to keep every message here (including this
 * one) from ever reaching a member with zero check-ins —
 * app/dashboard/page.tsx's own comment on `HomeScreenPopups` explains why.
 *
 * THE ONE RULE EVERY BRANCH IN THIS FILE OBEYS (2026-08-27)
 *
 * Every branch of findMyPendingRootPopupMessage checks its own due-ness
 * before returning, and falls through to the next candidate when its
 * message is already dismissed. No branch returns a candidate and leaves
 * the filtering to getMyRootPopupMessageAction's outer check, because a
 * branch that does starves everything below it: the outer check turns the
 * whole call into null instead of moving on. That failure has now been
 * found live three separate times (offers 2026-08-02, day3/day7
 * 2026-08-12, both priority_card branches 2026-08-27), which is why this
 * is written as a rule with no exceptions rather than a habit.
 *
 * The audit, kind by kind, in chain order. Two due-check lifetimes exist
 * and each kind uses exactly one of them:
 *
 *   kind                   inner guard              lifetime
 *   public_entry_welcome    isRecurringMessageDue    snoozed returns next login
 *     ...with a Baseline    isOfferStillDue          once ever (it is a
 *                                                    greeting, not an
 *                                                    invitation)
 *   trial_arc_day           isOfferStillDue          once per trial day (day-scoped key)
 *   questionnaire_assigned  isRecurringMessageDue    snoozed returns next login
 *   stress_load_assigned    isRecurringMessageDue    snoozed returns next login
 *   priority_card (re-entry) isPriorityCardDue       once per local day
 *   hydration_focus         isRecurringMessageDue    snoozed returns next login
 *   cvs_day3 / cvs_day7     isRecurringMessageDue    snoozed returns next login
 *   cvs_offer               isOfferStillDue          once ever
 *   lsc_day3 / lsc_day7     isRecurringMessageDue    snoozed returns next login
 *   lsc_offer               isOfferStillDue          once ever
 *   rpl_day3 / rpl_day7     isRecurringMessageDue    snoozed returns next login
 *   rpl_offer               isOfferStillDue          once ever
 *   reset_plan_day3/day7    isRecurringMessageDue    snoozed returns next login
 *   weekly_reflection       isRecurringMessageDue    snoozed returns next login
 *   weekly_review           isOfferStillDue          once per local week
 *   priority_card (daily)   isPriorityCardDue        once per local day
 *   free_arc_available      isRecurringMessageDue    snoozed returns next login
 *
 * A new kind added to this chain needs a row in that table and a guard in
 * its branch. tests/root-popup-messages.test.ts asserts the table is
 * complete: it walks this file's own source for every `kind:` returned and
 * fails if one of them sits in a branch with no due-check, so the rule
 * cannot quietly lapse again.
 */

'use server';

import { getCachedUser } from '@/lib/supabase/currentUser';
import { getPublicEntryWelcome } from '@/lib/public-entry/welcome';
import {
  publicEntryArcHandover,
  resolveTrialArcDecision,
  type TrialArcMessage,
} from '@/lib/trial-arc/engine';
import { createClient } from '@/lib/supabase/server';
import { getMyCvsExperimentStatusAction, getMyCvsOfferAction } from './coreValuesSnapshot';
import { getMyLscExperimentStatusAction, getMyLscOfferAction } from './lifeSignalCheck';
import { getMyRplExperimentStatusAction, getMyRplOfferAction } from './readinessPulse';
import { getMyResetPlanDashboardStateAction } from './resetPlan';
import { getMyQuestionnaireCatalog, getMyBodyAssessmentAssignmentCard } from './questionnaireCatalog';
import { resolveCvsCheckinPending, type CvsDailyLogRow } from '@/lib/core-values-snapshot/experiment';
import type { CvsScoring } from '@/lib/core-values-snapshot/types';
import type { LscScoring } from '@/lib/life-signal-check/types';
import type { RplScoring } from '@/lib/readiness-pulse/types';
import type { Signal } from '@/lib/life-signal-check/constants';
import type { ResetPlanDailyLog } from '@/lib/reset-plan/types';
import {
  cvsPopupMessageKey,
  lscPopupMessageKey,
  rplPopupMessageKey,
  resetPlanPopupMessageKey,
  questionnaireAssignedPopupMessageKey,
  publicEntryWelcomePopupMessageKey,
  priorityCardPopupMessageKey,
  weeklyReviewPopupMessageKey,
  weeklyReflectionPopupMessageKey,
  stressLoadPopupMessageKey,
  hydrationFocusPopupMessageKey,
  getRootPopupDismissal,
  ignoreRootPopupMessage,
  isOfferPopupDue,
  isRootPopupDueThisLogin,
  pickFirstDueOneTimeMessage,
  snoozeRootPopupMessage,
  type RootPopupDismissalStatus,
} from '@/lib/root-popup-messages/data';
import { pickNextFreeArcCard, freeArcPopupMessageKey } from '@/lib/root-popup-messages/freeArc';
import { getMyPriorityView } from '@/lib/priority/view';
import type { PriorityView } from '@/lib/priority/types';
import { getMyWeeklyReview } from '@/lib/weekly-review/view';
import { getMyWeeklyReflection } from '@/lib/weekly-reflection/view';
import { WEEKLY_REFLECTION_COPY } from '@/lib/weekly-reflection/copy';
import { getMyStressLoadDeepDive } from '@/lib/stress-load/view';
import { STRESS_LOAD_COPY } from '@/lib/stress-load/copy';
import { STRESS_LOAD_ROUTE } from '@/lib/stress-load/constants';
import { WEEKLY_REVIEW_LABEL } from '@/lib/weekly-review/copy';
import type { RenderedReview } from '@/lib/weekly-review/types';
import { resolveLocalDate } from './checkin';
import { fetchGoalCallbackContext } from '@/lib/memory-callback/data';
import { buildGoalCallback } from '@/lib/memory-callback/copy';
import { fetchHydrationFocus } from '@/lib/hydration/data';
import { memberTimezone } from '@/lib/time/memberToday';

export type RootPopupMessage =
  | { kind: 'cvs_day3'; messageKey: string; experimentId: string; topLabelText: string }
  | {
      kind: 'cvs_day7';
      messageKey: string;
      experimentId: string;
      topLabelText: string;
      logs: CvsDailyLogRow[];
      durationDays: number;
      /** Root Presence System, requirement 4 — her real stated goal, when one exists, for the day-7 message to honestly reference. */
      goalCallback: string | null;
    }
  | { kind: 'cvs_offer'; messageKey: string; sessionId: string; scoring: CvsScoring }
  | { kind: 'lsc_day3'; messageKey: string; experimentId: string; topLabelText: string }
  | {
      kind: 'lsc_day7';
      messageKey: string;
      experimentId: string;
      topLabelText: string;
      logs: CvsDailyLogRow[];
      durationDays: number;
      goalCallback: string | null;
    }
  | { kind: 'lsc_offer'; messageKey: string; sessionId: string; scoring: LscScoring }
  | { kind: 'rpl_day3'; messageKey: string; experimentId: string; topLabelText: string }
  | {
      kind: 'rpl_day7';
      messageKey: string;
      experimentId: string;
      topLabelText: string;
      logs: CvsDailyLogRow[];
      durationDays: number;
      goalCallback: string | null;
    }
  | { kind: 'rpl_offer'; messageKey: string; sessionId: string; scoring: RplScoring }
  | { kind: 'reset_plan_day3'; messageKey: string; planId: string; focusSignal: Signal }
  | { kind: 'reset_plan_day7'; messageKey: string; planId: string; focusSignal: Signal; logs: ResetPlanDailyLog[] }
  | {
      kind: 'questionnaire_assigned';
      messageKey: string;
      assignmentId: string;
      displayName: string;
      primaryHref: string;
    }
  | {
      kind: 'free_arc_available';
      messageKey: string;
      assessmentKey: string;
      displayName: string;
      description: string;
      primaryHref: string;
    }
  /**
   * Priority Card delivery fix (2026-08-12). Root's single priority for
   * today, delivered through this same chain rather than a second pop-up
   * system. Carries the already-computed view so the pop-up, Home's inline
   * card, and Today's inline card all render the identical object from the
   * identical `member_daily_priorities` row.
   */
  | { kind: 'priority_card'; messageKey: string; view: PriorityView }
  /**
   * The Weekly Root Review (Adaptive Coaching Direction, Part 2). Root's
   * one look back at the week, delivered through this same chain rather
   * than a second pop-up system, once per the member's own local week.
   * Carries the already-rendered review so the pop-up and Home's persistent
   * entry render the identical object from the identical
   * `member_weekly_reviews` row.
   */
  | {
      kind: 'weekly_review';
      messageKey: string;
      weekStart: string;
      label: string;
      review: RenderedReview;
    }
  /**
   * The Weekly Reflection. Once a week, Root offers her the look back her
   * coach will read with her: automatically for a program-tier member from
   * her Friday to her Sunday, and on any day for any member her coach sent
   * one to (migration 193).
   *
   * Carries no recap and no questions, deliberately, unlike the Weekly
   * Root Review directly above it. This message is an INVITATION into a
   * three part experience on its own route, not the experience itself, so
   * it renders through the same RootInvitePopup a coach assignment and a
   * free-arc conversation already use and inherits their real "Maybe
   * later" and "Ignore" buttons. Putting the recap in the pop-up would
   * mean composing it twice and would leave her reading Part 1 in a modal
   * she then has to leave to answer Part 2.
   */
  | {
      kind: 'weekly_reflection';
      messageKey: string;
      weekStart: string;
      title: string;
      body: string;
      primaryHref: string;
    }
  /**
   * The Stress & Load Deep-Dive (coach assigned only, migration 190).
   *
   * A separate kind from `questionnaire_assigned`, at the same priority,
   * and the reason is the copy rather than the mechanism: a coach assigning
   * this one is Root being asked to sit down with her, and the approved
   * line says exactly that. Reusing the questionnaire kind would have named
   * it like an item on a to-do list. Everything else about it, including
   * the recurring dismissal lifetime, matches a coach assignment.
   *
   * Carries no questions and no reading, deliberately. This message is an
   * INVITATION into an experience on its own route, so it renders through
   * the same RootInvitePopup a coach-assigned questionnaire and a free-arc
   * conversation already use and inherits their real Maybe later and Ignore
   * buttons.
   */
  | {
      kind: 'stress_load_assigned';
      messageKey: string;
      assignmentId: string;
      title: string;
      body: string;
      primaryHref: string;
    }
  /**
   * Conditional water tracking (migration 163). The one question every
   * member who finished intake before that question existed never got
   * asked. Carries no payload: it is a fixed three-option question in
   * Root's voice, identical for everyone, and its answer writes
   * profiles.hydration_focus.
   */
  | { kind: 'hydration_focus'; messageKey: string }
  /**
   * The public entry welcome (migration 197). Shown once to a member who
   * arrived through Where Your Energy Goes and has not yet completed her
   * Baseline Assessment, so Root can say honestly what she told us before
   * she had an account and then hand her to the real thing.
   *
   * `patternTitle` is null when she arrived and created an account without
   * finishing the nine questions, and the copy branches on that rather than
   * inventing something to have noticed.
   */
  | {
      kind: 'public_entry_welcome';
      messageKey: string;
      patternTitle: string | null;
      primaryHref: string;
      /**
       * Her Baseline Assessment already exists, so this is a greeting
       * rather than an invitation: different copy, a button to her Root Map
       * instead of to the assessment, one "Got it" instead of "Maybe later"
       * and "Ignore", and shown once ever rather than every login until
       * something closes it. See lib/public-entry/welcome.ts's header for
       * the production timings that made this shape necessary.
       */
      hasBaseline: boolean;
      /**
       * The trial arc's day 1 message, when this welcome is carrying it
       * (lib/public-entry/welcome.ts). Null for every account outside the
       * arc, and the pop-up then renders the copy and the button it always
       * has. When it is present the pop-up renders the arc's own copy,
       * fires the arc's delivery receipt, and stamps the arc's CTA.
       */
      arc: TrialArcMessage | null;
    }
  /**
   * The trial arc (migrations 203 and 204). Root pacing a member through
   * the first days of her free trial: one message a day at most, only for
   * an account lib/trial-arc/eligibility.ts says the arc is launched for,
   * and never for anybody who has ever been assigned a coach.
   *
   * Carries the whole message rather than an id, because the arc has no
   * route and no card of its own: it is a sentence Root says, decided fresh
   * from real rows on every visit by lib/trial-arc/engine.ts, and the
   * pop-up is the only place it is ever rendered. There is deliberately no
   * Priority Card entry and no Home card for it.
   */
  | { kind: 'trial_arc_day'; messageKey: string; arc: TrialArcMessage };

async function requireMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/**
 * The member's own local date, which is what scopes the Priority Card's
 * pop-up key and therefore its once-per-day rule. Uses her stored profile
 * timezone and the same resolveLocalDate every other daily surface uses,
 * never the server's date.
 */
async function currentMemberLocalDate(): Promise<string> {
  const user = await getCachedUser();
  const supabase = createClient();
  const timezone = user ? await memberTimezone(supabase, user.id) : 'America/New_York';
  return resolveLocalDate(new Date(new Date().toLocaleString('en-US', { timeZone: timezone })), false);
}

/** The one Root message (if any) currently pending a response/acknowledgment/action, regardless of whether it's due to pop up this login. Used both to decide the pop-up and to badge the underlying card as high priority once snoozed. Core Values Snapshot is checked before Life Signal Check (oldest experience first); within either, day 3 wins over day 7, and day 7 wins over that experience's own start-it-later offer (offer can only exist when no experiment is running yet, so it's never actually competing with day 3/7 for the same experience — this ordering only matters across the two experiences). */
async function findMyPendingRootPopupMessage(): Promise<RootPopupMessage | null> {
  // Real bug found while building the Personal Reset Plan's own day-3/
  // day-7 pop-up case: once any experience's one-time "start it later"
  // offer had been shown once (and dismissed via the auto-ignore-on-mount
  // effect in RootMessagePopupClient), getMyCvsOfferAction/etc kept
  // returning that same real, eligible offer object forever (a completed
  // session with no active experiment is a permanent condition, not a
  // one-time one) — and this function used to return the very first
  // eligible offer it found with no dismissal check of its own, trusting
  // getMyRootPopupMessageAction's single outer isOfferPopupDue check to
  // filter it. That works for the FIRST experience checked, but once that
  // one offer turns out to already be dismissed, the whole call returns
  // null instead of ever falling through to check Life Signal Check,
  // Readiness Pulse, or (the case that surfaced this) the Personal Reset
  // Plan's own pending day-3/day-7 message — a member who had ever simply
  // declined the Core Values Snapshot Weekly Experiment could never again
  // see ANY later pop-up, of any kind, for the rest of their membership.
  // Fixed by checking each offer's own dismissal right here and
  // continuing to the next experience when it's already been shown,
  // exactly the same "skip past what's already resolved" discipline
  // resolveCvsCheckinPending already applies to day3-vs-day7.
  const user = await getCachedUser();
  const memberId = user?.id ?? null;
  const supabase = memberId ? createClient() : null;
  const lastSignInAt = user?.last_sign_in_at ?? null;

  async function isOfferStillDue(messageKey: string): Promise<boolean> {
    if (!memberId || !supabase) return true;
    const dismissal = await getRootPopupDismissal(supabase, memberId, messageKey);
    return isOfferPopupDue(dismissal);
  }

  // FIX 5 (2026-08-03): questionnaire_assigned's own candidate-picking now
  // uses the same recurring snoozed/ignored rule day3/day7 already use,
  // not isOfferStillDue's one-time-ever rule — see this file's own header
  // comment for why.
  //
  // FIX 6 (2026-08-12, found live while verifying the Priority Card's
  // pop-up delivery): every day3/day7 branch below now calls this for
  // itself and FALLS THROUGH when its message is already dismissed,
  // instead of returning unconditionally and leaving the single outer
  // due-check in getMyRootPopupMessageAction to filter it.
  //
  // This is the same starvation bug this file's own header describes for
  // the offer branches (fixed 2026-08-02), which was never applied to
  // day3/day7. The failure is total, not partial: a member who tapped
  // "Ignore" on a Core Values Snapshot day-3 pop-up still has that message
  // genuinely pending forever (ignoring the pop-up is not answering the
  // question), so this function kept returning it, and the outer check
  // then turned the whole call into null. She could never see ANY pop-up
  // again, of any kind, for the rest of her membership.
  //
  // Found on the production test account memberPopulated, which had
  // exactly one such row (cvs_day3, 'ignored') and was consequently
  // getting no Priority Card pop-up while every other account did.
  async function isRecurringMessageDue(messageKey: string): Promise<boolean> {
    if (!memberId || !supabase) return true;
    const dismissal = await getRootPopupDismissal(supabase, memberId, messageKey);
    return isRootPopupDueThisLogin(dismissal, lastSignInAt);
  }

  // FIX 7 (2026-08-27, bug sweep finding B1). The two priority_card
  // branches were the last two in this chain that returned a candidate
  // unconditionally, trusting getMyRootPopupMessageAction's single outer
  // check to filter them. That is the same starvation this file's header
  // and pickFirstDueOneTimeMessage's doc comment both describe, and it was
  // live: a member whose priority card had already been shown and
  // auto-dismissed today got NO pop-up for the rest of the day, because
  // the re-entry branch sits above the hydration question, every day-3 and
  // day-7 follow-up and the Weekly Root Review, and the ordinary branch
  // sits above the free-arc invitation.
  //
  // The priority card's dismissal lifetime is the one-time-ever rule
  // applied to a date-scoped key (priorityCardPopupMessageKey carries her
  // own local date), so its due-check is isOfferPopupDue, not the
  // recurring rule. That is why it gets its own helper rather than reusing
  // isOfferStillDue's name: the semantics are the same, but the key is
  // built here so both branches can share the one local-date resolution.
  //
  // The local date is resolved at most once per call and reused, so adding
  // a check to the branch that used to resolve it lazily on return costs
  // no extra query for the branch that does not reach it.
  let cachedLocalDate: string | null = null;
  async function priorityCardMessageKey(): Promise<string> {
    if (cachedLocalDate === null) cachedLocalDate = await currentMemberLocalDate();
    return priorityCardPopupMessageKey(cachedLocalDate);
  }
  async function isPriorityCardDue(messageKey: string): Promise<boolean> {
    if (!memberId || !supabase) return true;
    const dismissal = await getRootPopupDismissal(supabase, memberId, messageKey);
    return isOfferPopupDue(dismissal);
  }

  /** Root Presence System, requirement 4 — fetched lazily, only when a day-7 message is actually about to be returned, so every other call to this function pays no extra query. */
  async function goalCallbackForDay7(): Promise<string | null> {
    if (!memberId || !supabase) return null;
    return buildGoalCallback(await fetchGoalCallbackContext(supabase, memberId));
  }

  // The public entry welcome (migration 197). FIRST in this chain, ahead
  // even of a coach assignment, and it is the only message here that is
  // about the member's arrival rather than about her week. She has just
  // created an account off the back of telling a stranger's website how her
  // days go, and the first thing Root should do is show her that it was not
  // thrown away and say exactly what it was and was not.
  //
  // ITS OWN DUE-CHECK, per this file's one rule: isRecurringMessageDue, so
  // "Maybe later" genuinely means next login and "Ignore" genuinely means
  // never, matching the buttons the invite chrome actually shows her.
  //
  // ITS OWN CLOSER, so it cannot stand forever. The branch only fires while
  // she has no onboarding submission, because the whole message is an
  // invitation to start one. The moment she has, there is nothing to invite
  // her to and this stops being offered whether or not she ever dismissed
  // it. A rule that only fires when something is missing needs the thing
  // arriving to end it, not a dismissal.
  //
  // WHAT IT IS ALLOWED TO SAY. The pattern her nine public answers resolved
  // to, named as the first impression it is. Nothing here reads
  // public_entry_answers, nothing carries a public answer into an
  // assessment, and the copy itself (lib/public-entry/copy.ts's
  // ROOT_WELCOME_COPY) says out loud that it was not a measurement.
  //
  // THE TRIAL ARC HANDOVER (2026-09-04). The arc's decision for this visit
  // is resolved once, here, before the welcome, because the two are the
  // same message on a member's first day. For an account the arc is
  // launched for, this handshake carries the arc's day 1 framing and points
  // at Core Values Snapshot; from her day 2 onward the welcome stands down
  // and the arc's own branch below speaks. For every other account,
  // `publicEntryArcHandover` is null and nothing about this branch changes.
  //
  // It costs no query while the arc is switched off: resolveTrialArcDecision
  // checks TRIAL_ARC_LAUNCH before any read at all, and it ships null.
  const arcDecision =
    memberId && supabase
      ? await resolveTrialArcDecision(supabase, memberId, {
          lastSignInAt,
        })
      : null;

  if (memberId && supabase) {
    const welcome = await getPublicEntryWelcome(
      supabase,
      memberId,
      arcDecision ? publicEntryArcHandover(arcDecision) : null
    );
    if (welcome) {
      // The arc's day 1 rides this surface, so it rides the arc's key and
      // the arc's lifetime too: once per trial day, marked dismissed the
      // instant it mounts, exactly as the Priority Card's date-scoped key
      // already works. A welcome outside the arc keeps its own key and its
      // own recurring "Maybe later means next login" lifetime, unchanged.
      const messageKey = welcome.arc
        ? welcome.arc.messageKey
        : publicEntryWelcomePopupMessageKey(welcome.sessionId);
      // THREE LIFETIMES, AND EACH ONE IS THE CLOSER ITS OWN SHAPE HAS.
      // The arc's day 1 obeys the arc's day-scoped key. An invitation with
      // no Baseline yet recurs until she starts one or ignores it, which is
      // what it has always done. A greeting to somebody who already has a
      // Baseline is shown ONCE, ever, because nothing that happens later
      // would end it and there is nothing left to invite her to.
      const due =
        welcome.arc || welcome.hasBaseline
          ? await isOfferStillDue(messageKey)
          : await isRecurringMessageDue(messageKey);
      if (due) {
        return {
          kind: 'public_entry_welcome',
          messageKey,
          patternTitle: welcome.patternTitle,
          hasBaseline: welcome.hasBaseline,
          primaryHref: welcome.arc
            ? welcome.arc.copy.href
            : welcome.hasBaseline
              ? '/root-map'
              : '/onboarding',
          arc: welcome.arc,
        };
      }
    }
  }

  // The trial arc, SECOND in this chain and immediately after the welcome.
  //
  // ITS POSITION. Above every coach assignment and everything Root decides
  // on her own, and below only the arrival handshake, because those two are
  // the same message on day 1 and the arrival is the older half of it. It
  // is safe this high for the reason the re-entry takeover is: it is finite
  // and self-limiting. It exists for at most five days of one account's
  // life, it says at most one thing a day, and it has a closer that stops
  // it for good after three ignored messages, so it cannot starve anything
  // below it the way a perpetual daily message would.
  //
  // WHO CAN REACH IT. Only an account lib/trial-arc/eligibility.ts answers
  // 'eligible' for: on the automatic free trial, created after the arc
  // launched, never assigned a coach in any status ever, not suppressed,
  // not a test account, and a PROSPECT. A coaching client can structurally
  // never see a line of it. While TRIAL_ARC_LAUNCH is null, which is how it
  // ships, that is every account in the system and this branch costs no
  // query at all.
  //
  // ITS OWN DUE-CHECK, per this file's one rule: isOfferStillDue on a
  // day-scoped key, which is the once-per-day rule expressed through the
  // existing one-time-ever machinery, exactly as priority_card does. The
  // pop-up marks itself dismissed on mount, so "at most one trial arc
  // message per member per day" holds whether she taps the button, closes
  // the tab or navigates away.
  //
  // ROOT PRESENCE ALREADY WON OR LOST INSIDE THE ENGINE. There is no
  // presence check here: lib/trial-arc/engine.ts refuses on it before it
  // composes anything, so a member being greeted gets the greeting and
  // nothing else. The arc is never stacked on top of it.
  if (arcDecision?.message && arcDecision.message.surface === 'popup') {
    const messageKey = arcDecision.message.messageKey;
    if (await isOfferStillDue(messageKey)) {
      return { kind: 'trial_arc_day', messageKey, arc: arcDecision.message };
    }
  }

  // Coach-assigned questionnaire (Assignment-Gated Questionnaires task) —
  // checked first, ahead of every self-serve Root message below: a coach's
  // direct action for this member takes priority over Root's own day3/
  // day7/offer messages. Reads getMyQuestionnaireCatalog()'s own 'assigned'
  // section rather than querying assessment_assignments directly — that's
  // the exact same title/route every other assigned-questionnaire surface
  // (the Home priority card, the Questionnaires page) already uses per
  // type (the generic engine's own questionnaire title, Primal Pattern's,
  // the unified runtime's), so the pop-up can never name a questionnaire
  // differently than the page the member actually lands on. A real
  // mismatch found live: entry.displayName alone called Short-HAQ "Short
  // Health Assessment Questionnaire," while its own page (and the
  // catalog/priority card, which already read the engine's own title) call
  // it "Health Check-In Questionnaire" — Root would have announced one
  // name and shown another.
  //
  // Uses pickFirstDueOneTimeMessage (lib/root-popup-messages/data.ts) for
  // the exact same guarded "check due-ness, then fall through to the next
  // candidate" discipline as every offer branch below — see that helper's
  // own doc comment and tests/root-popup-messages.test.ts for the
  // regression coverage proving a dismissed earlier assignment can never
  // suppress a later, still-due one (the real starvation bug this
  // function's header comment describes). A member can have more than one
  // pending assignment; catalog registry order decides ties (precise
  // assignment recency doesn't matter here — at most one is ever actually
  // due and undismissed at a time in practice).
  // Coach-Assign-Only Gating task (2026-08-04): Body Assessment's own
  // assignment card is fetched separately (see
  // getMyBodyAssessmentAssignmentCard's own doc comment — the
  // Questionnaires catalog deliberately excludes Body Assessment, but the
  // pop-up chain should treat a Body Assessment assignment exactly the
  // same as any other coach assignment) and merged into the same
  // candidate list, reusing questionnaire_assigned rather than adding a
  // new pop-up kind.
  const [catalog, bodyAssessmentCard] = await Promise.all([
    getMyQuestionnaireCatalog(),
    getMyBodyAssessmentAssignmentCard(),
  ]);
  const assignmentCandidates = [
    ...catalog.assigned.filter((card) => card.assignmentId && card.primaryHref),
    ...(bodyAssessmentCard?.assignmentId && bodyAssessmentCard.primaryHref ? [bodyAssessmentCard] : []),
  ].map((card) => ({
    assignmentId: card.assignmentId!,
    displayName: card.title,
    primaryHref: card.primaryHref!,
    messageKey: questionnaireAssignedPopupMessageKey(card.assignmentId!),
  }));
  const dueAssignment = await pickFirstDueOneTimeMessage(assignmentCandidates, isRecurringMessageDue);
  if (dueAssignment) {
    return {
      kind: 'questionnaire_assigned',
      messageKey: dueAssignment.messageKey,
      assignmentId: dueAssignment.assignmentId,
      displayName: dueAssignment.displayName,
      primaryHref: dueAssignment.primaryHref,
    };
  }

  // The Stress & Load Deep-Dive, immediately below the other coach
  // assignments and above everything Root decides on her own. It is a
  // coach's direct action for this member, which is the priority coach
  // assignments already hold in this chain, and it is finite: finishing it
  // closes the assignment out, so it can never starve anything below it.
  //
  // It sits after the questionnaire assignments rather than before them
  // only because those were here first and neither outranks the other in
  // any real sense. When both are pending, the questionnaire pops first and
  // this one is still due on her next open, because its key has no
  // dismissal row yet.
  //
  // getMyStressLoadDeepDive returns null for every member who was never
  // assigned this, so the gate and the offer are one read rather than two
  // checks here that could drift from the route's. Its own branch checks
  // its own due-ness and falls through, per this file's one rule.
  const stressLoad = await getMyStressLoadDeepDive();
  if (stressLoad?.status === 'pending') {
    const messageKey = stressLoadPopupMessageKey(stressLoad.assignmentId);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'stress_load_assigned',
        messageKey,
        assignmentId: stressLoad.assignmentId,
        title: STRESS_LOAD_COPY.popupTitle,
        body: STRESS_LOAD_COPY.popupBody,
        primaryHref: STRESS_LOAD_ROUTE,
      };
    }
  }

  // Priority Card, the re-entry half (delivery fix, 2026-08-12).
  //
  // The card takes TWO positions in this chain, not one, and the split is
  // deliberate rather than a hedge.
  //
  // Here, high: when the re-entry override has fired, the member has been
  // absent 7+ days and this pop-up IS her welcome back. The build brief
  // calls that a takeover, and a takeover that queued behind a day-3
  // experiment follow-up would not be one. It is safe this high precisely
  // because it is rare and self-limiting: re-entry clears the moment she
  // engages once, so it cannot starve anything below it.
  //
  // The ordinary, every-day priority sits far lower (see below, just above
  // the free-arc invitation) for the opposite reason: it is available
  // EVERY day and perpetual, so putting it above the finite, resolvable
  // day-3/day-7 follow-ups would starve them permanently for a member who
  // opens the app once a day. That is exactly the starvation class this
  // file's own header comment documents, and the reason the ordinary card
  // yields to every message that can actually be finished.
  //
  // A coach assignment still outranks both: a coach's direct action for
  // this member comes before anything Root decides on her behalf.
  //
  // Either half only ever pops while the card is still ACTIVE. If she has
  // already marked today's priority done or saved it for later (on Home or
  // on Today, both of which write the same row), the pop-up has nothing
  // left to ask and interrupting her with it would be noise. The card
  // stays available inline either way.
  const priorityViewRaw = await getMyPriorityView();
  const priorityView = priorityViewRaw?.status === 'active' ? priorityViewRaw : null;
  if (priorityView?.isReEntry) {
    const messageKey = await priorityCardMessageKey();
    if (await isPriorityCardDue(messageKey)) {
      return { kind: 'priority_card', messageKey, view: priorityView };
    }
  }

  // Conditional water tracking (migration 163) — the one-time hydration
  // question, for members who finished intake before the question existed.
  //
  // Position: below the coach-assignment check and the welcome-back
  // takeover, above every day-3/day-7 follow-up.
  //
  // High, because until she answers it the app is actively wrong about
  // her: it is showing her a tracker she may not need and reading her
  // silence on it as under-hydration in her score, her trends and her
  // coach's summary. That correction is worth one screen ahead of an
  // experiment follow-up.
  //
  // Safe at that height for the same reason the re-entry takeover is:
  // it is finite and self-limiting. It is due only while
  // profiles.hydration_focus is still null, so answering it (or a coach
  // setting the flag from her profile) retires it permanently, and it can
  // never starve anything below it the way a perpetual daily message
  // would. New members never see it at all — their intake answer already
  // wrote the flag.
  //
  // "Maybe later" and "Ignore" behave exactly as they do for day3/day7
  // (isRecurringMessageDue): snoozed comes back on her next real login,
  // ignored never comes back. Either way she keeps today's behavior in
  // full, water included, because an unanswered flag reads as tracked
  // everywhere.
  if (memberId && supabase) {
    const { focus } = await fetchHydrationFocus(supabase, memberId);
    if (focus === null && (await isRecurringMessageDue(hydrationFocusPopupMessageKey))) {
      return { kind: 'hydration_focus', messageKey: hydrationFocusPopupMessageKey };
    }
  }

  const cvsStatus = await getMyCvsExperimentStatusAction();
  // Real bug fixed alongside the same one in
  // components/dashboard/ActiveExperimentsSection.tsx: getMyCvsExperimentStatusAction/
  // getMyLscExperimentStatusAction return the member's most recent
  // experiment no matter how long ago it wrapped up (completed/abandoned/
  // expired and acknowledged), so `cvsStatus`/`lscStatus` stay truthy
  // forever once a single experiment has ever existed. That silently
  // skipped the offer check below (an `else` branch that could then never
  // run), which is why the one-time "start it later" pop-up never fired
  // for a member who had any prior experiment history at all, including
  // simply declining a fresh session after an earlier one had finished.
  // Fix: only treat a still-'active' experiment as blocking the offer.
  const cvsPending = cvsStatus
    ? resolveCvsCheckinPending({
        isDay3Eligible: cvsStatus.isDay3Eligible,
        day3Answered: cvsStatus.logs.some((l) => l.day3Response !== null),
        isDay7Eligible: cvsStatus.isDay7Eligible,
        day7Acknowledged: cvsStatus.experiment.day7AcknowledgedAt !== null,
      })
    : null;

  if (cvsPending === 'day3') {
    const messageKey = cvsPopupMessageKey('day3', cvsStatus!.experiment.id);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'cvs_day3',
        messageKey,
        experimentId: cvsStatus!.experiment.id,
        topLabelText: cvsStatus!.experiment.title,
      };
    }
  }
  if (cvsPending === 'day7') {
    const messageKey = cvsPopupMessageKey('day7', cvsStatus!.experiment.id);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'cvs_day7',
        messageKey,
        experimentId: cvsStatus!.experiment.id,
        topLabelText: cvsStatus!.experiment.title,
        logs: cvsStatus!.logs,
        durationDays: cvsStatus!.experiment.durationDays,
        goalCallback: await goalCallbackForDay7(),
      };
    }
  }
  if (!cvsStatus || cvsStatus.experiment.status !== 'active') {
    const offer = await getMyCvsOfferAction();
    if (offer) {
      const messageKey = cvsPopupMessageKey('offer', offer.sessionId);
      if (await isOfferStillDue(messageKey)) {
        return { kind: 'cvs_offer', messageKey, sessionId: offer.sessionId, scoring: offer.scoring };
      }
    }
  }

  const lscStatus = await getMyLscExperimentStatusAction();
  const lscPending = lscStatus
    ? resolveCvsCheckinPending({
        isDay3Eligible: lscStatus.isDay3Eligible,
        day3Answered: lscStatus.logs.some((l) => l.day3Response !== null),
        isDay7Eligible: lscStatus.isDay7Eligible,
        day7Acknowledged: lscStatus.experiment.day7AcknowledgedAt !== null,
      })
    : null;

  if (lscPending === 'day3') {
    const messageKey = lscPopupMessageKey('day3', lscStatus!.experiment.id);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'lsc_day3',
        messageKey,
        experimentId: lscStatus!.experiment.id,
        topLabelText: lscStatus!.experiment.title,
      };
    }
  }
  if (lscPending === 'day7') {
    const messageKey = lscPopupMessageKey('day7', lscStatus!.experiment.id);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'lsc_day7',
        messageKey,
        experimentId: lscStatus!.experiment.id,
        topLabelText: lscStatus!.experiment.title,
        logs: lscStatus!.logs,
        durationDays: lscStatus!.experiment.durationDays,
        goalCallback: await goalCallbackForDay7(),
      };
    }
  }
  if (!lscStatus || lscStatus.experiment.status !== 'active') {
    const offer = await getMyLscOfferAction();
    if (offer) {
      const messageKey = lscPopupMessageKey('offer', offer.sessionId);
      if (await isOfferStillDue(messageKey)) {
        return { kind: 'lsc_offer', messageKey, sessionId: offer.sessionId, scoring: offer.scoring };
      }
    }
  }

  const rplStatus = await getMyRplExperimentStatusAction();
  const rplPending = rplStatus
    ? resolveCvsCheckinPending({
        isDay3Eligible: rplStatus.isDay3Eligible,
        day3Answered: rplStatus.logs.some((l) => l.day3Response !== null),
        isDay7Eligible: rplStatus.isDay7Eligible,
        day7Acknowledged: rplStatus.experiment.day7AcknowledgedAt !== null,
      })
    : null;

  if (rplPending === 'day3') {
    const messageKey = rplPopupMessageKey('day3', rplStatus!.experiment.id);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'rpl_day3',
        messageKey,
        experimentId: rplStatus!.experiment.id,
        topLabelText: rplStatus!.experiment.title,
      };
    }
  }
  if (rplPending === 'day7') {
    const messageKey = rplPopupMessageKey('day7', rplStatus!.experiment.id);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'rpl_day7',
        messageKey,
        experimentId: rplStatus!.experiment.id,
        topLabelText: rplStatus!.experiment.title,
        logs: rplStatus!.logs,
        durationDays: rplStatus!.experiment.durationDays,
        goalCallback: await goalCallbackForDay7(),
      };
    }
  }
  if (!rplStatus || rplStatus.experiment.status !== 'active') {
    const offer = await getMyRplOfferAction();
    if (offer) {
      const messageKey = rplPopupMessageKey('offer', offer.sessionId);
      if (await isOfferStillDue(messageKey)) {
        return { kind: 'rpl_offer', messageKey, sessionId: offer.sessionId, scoring: offer.scoring };
      }
    }
  }

  // Personal Reset Plan — day-3 before day-7, same as every experience
  // above, but no offer case: the plan's own dashboard card (not a
  // one-time pop-up) is its only "start it" surface, per the build brief.
  const resetPlanState = await getMyResetPlanDashboardStateAction();
  if (resetPlanState.kind === 'active' && resetPlanState.plan.focusSignal) {
    if (resetPlanState.isDay3Eligible && !resetPlanState.day3Answered) {
      const messageKey = resetPlanPopupMessageKey('day3', resetPlanState.plan.id);
      if (await isRecurringMessageDue(messageKey)) {
        return {
          kind: 'reset_plan_day3',
          messageKey,
          planId: resetPlanState.plan.id,
          focusSignal: resetPlanState.plan.focusSignal,
        };
      }
    }
    if (resetPlanState.isDay7Eligible && !resetPlanState.day7Acknowledged) {
      const messageKey = resetPlanPopupMessageKey('day7', resetPlanState.plan.id);
      if (await isRecurringMessageDue(messageKey)) {
        return {
          kind: 'reset_plan_day7',
          messageKey,
          planId: resetPlanState.plan.id,
          focusSignal: resetPlanState.plan.focusSignal,
          logs: resetPlanState.logs,
        };
      }
    }
  }

  // The Weekly Reflection.
  //
  // Its position, boundary by boundary, on the same reasoning the Weekly
  // Root Review below states for itself:
  //
  // BELOW every finite thing above it. A coach assignment, a day-3 or a
  // day-7 follow-up can each be finished and then never appear again,
  // while this returns every Friday, so putting it above them would starve
  // them for a member who opens the app once a day. When it loses the slot
  // it is simply still due on her next open, because its key has no
  // dismissal row yet.
  //
  // BELOW safety, exactly as the review is: an unresolved check-in safety
  // flag is the Priority Card's strongest override, so it arrives as the
  // priority_card message below, and this declines while that override is
  // firing rather than the safety card being moved up the chain.
  //
  // ABOVE the Weekly Root Review, which is the one genuinely new ordering
  // decision here. Both are weekly and they rarely collide (the review is
  // delivered on her Monday and has usually had its one showing by
  // Friday), but when they do, the one that ASKS HER SOMETHING wins. The
  // review is Root reporting and it stays on Home all week either way; the
  // reflection has a three day window and a coach waiting to read it.
  //
  // getMyWeeklyReflection returns null for every member nobody opened this
  // week for: not on the program tier and not assigned, or on the program
  // but not on a Friday, Saturday or Sunday. The tier, the window and the
  // coach assignment are one read rather than three checks here that could
  // drift from the route's.
  const weeklyReflection = await getMyWeeklyReflection();
  const safetyOverrideActive = priorityViewRaw?.selected.rule === 'safety';
  if (weeklyReflection?.status === 'pending' && !safetyOverrideActive) {
    const messageKey = weeklyReflectionPopupMessageKey(weeklyReflection.weekStart);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'weekly_reflection',
        messageKey,
        weekStart: weeklyReflection.weekStart,
        title: WEEKLY_REFLECTION_COPY.popupTitle,
        body: WEEKLY_REFLECTION_COPY.popupBody,
        primaryHref: '/weekly-reflection',
      };
    }
  }

  // The Weekly Root Review (Adaptive Coaching Direction, Part 2).
  //
  // Its position is the whole of its delivery design, so it is worth being
  // exact about all four boundaries:
  //
  // BELOW the welcome-back takeover (the re-entry branch far above). A
  // member back after a week away is met with the welcome, not with a
  // report on a week she was not here for.
  //
  // BELOW coach assignments and every finite day-3/day-7 follow-up (all
  // above). Those can be finished and then never appear again; a weekly
  // review is perpetual, so putting it above them would starve them for a
  // member who opens the app once a day, which is exactly the starvation
  // class this file's own header documents. When it loses the slot to one
  // of them, it is simply still due on her next open: its message key
  // carries her own week start and has no dismissal row yet.
  //
  // BELOW safety. There is deliberately no separate safety pop-up in this
  // chain: an unresolved check-in safety flag is the Priority Card's
  // strongest OVERRIDE (Part 1's rule 'safety'), so it arrives as the
  // priority_card message just below. The review therefore declines
  // explicitly when that override has fired, rather than the safety card
  // being moved up the chain, which would change existing behavior. A
  // member with something unresolved open is not shown a weekly report
  // while Root has stopped asking anything of her.
  //
  // ABOVE the ordinary daily priority card. Once a week, on one open, the
  // week's report is the more important thing to say than the day's.
  const weeklyReview = await getMyWeeklyReview();
  if (weeklyReview && !safetyOverrideActive) {
    const messageKey = weeklyReviewPopupMessageKey(weeklyReview.weekStart);
    if (await isOfferStillDue(messageKey)) {
      return {
        kind: 'weekly_review',
        messageKey,
        weekStart: weeklyReview.weekStart,
        label: WEEKLY_REVIEW_LABEL,
        review: weeklyReview.review,
      };
    }
  }

  // Priority Card, the ordinary half. Below every message that can
  // actually be resolved and finished (see the re-entry branch above for
  // the full reasoning), and above the free-arc invitation, on that
  // branch's own stated principle: an invitation to start something new
  // yields to what Root has actually decided matters today.
  //
  // `priorityView` was resolved once at the top of this function, so this
  // costs no second computation.
  if (priorityView) {
    const messageKey = await priorityCardMessageKey();
    if (await isPriorityCardDue(messageKey)) {
      return { kind: 'priority_card', messageKey, view: priorityView };
    }
  }

  // Free Arc Discoverability fix (2026-08-03) — the next unstarted
  // conversation among Core Values Snapshot / Life Signal Check /
  // Readiness Pulse, lowest priority of every message above: an
  // invitation to try something new never preempts continuing something
  // already active (every day3/day7/offer/assignment check above it).
  // Reuses the exact same `catalog` already fetched for the coach-
  // assignment check, no new query. See lib/root-popup-messages/freeArc.ts.
  //
  // Guarded for its own sake (2026-08-27, alongside B1): being last in the
  // chain is the only reason an unguarded return here was not already a
  // starvation bug, and "it is last" is not a property anyone will
  // remember to re-check before adding a message below it. Every branch in
  // this function now checks its own due-ness and falls through, with no
  // exceptions, so the outer check in getMyRootPopupMessageAction is
  // defence in depth rather than the only filter.
  const nextFreeArcCard = pickNextFreeArcCard(catalog);
  if (nextFreeArcCard && nextFreeArcCard.primaryHref) {
    const messageKey = freeArcPopupMessageKey(nextFreeArcCard.key);
    if (await isRecurringMessageDue(messageKey)) {
      return {
        kind: 'free_arc_available',
        messageKey,
        assessmentKey: nextFreeArcCard.key,
        displayName: nextFreeArcCard.title,
        description: nextFreeArcCard.description,
        primaryHref: nextFreeArcCard.primaryHref,
      };
    }
  }

  return null;
}

/** The dismissal state (if any) for a specific message key — used by the dashboard card to decide whether to show the "waiting on you" badge once a member has snoozed the pop-up. */
export async function getMyRootPopupDismissalAction(
  messageKey: string
): Promise<{ status: RootPopupDismissalStatus } | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const dismissal = await getRootPopupDismissal(supabase, memberId, messageKey);
  return dismissal ? { status: dismissal.status } : null;
}

/**
 * The message (if any) that should interrupt this member as a pop-up on
 * this login. Oldest unhandled message first (Core Values Snapshot before
 * Life Signal Check, and within each, resolveCvsCheckinPending already
 * checks day 3 before day 7), one at a time — a second pending message,
 * if one ever exists, simply waits its turn as a card until this one is
 * resolved. Never returns a message for an 'ignored' dismissal, and only
 * returns a 'snoozed' one once a real login has happened since the snooze.
 *
 * The three offer kinds (cvs_offer/lsc_offer/rpl_offer) are the one
 * exception to that "snoozed comes back next login" rule: they pop up at
 * most once, ever. RootMessagePopupClient marks the offer dismissed
 * (status 'ignored') the moment it's shown, so any dismissal row at all —
 * not just an 'ignored' one — permanently retires the pop-up for that
 * offer. The member always still has the dashboard card as an unlimited,
 * un-timed way to start it later. `questionnaire_assigned` and
 * `free_arc_available` are NOT in this one-time-ever group (FIX 5,
 * 2026-08-03 — both use the same recurring rule as day3/day7, so "Maybe
 * later" genuinely means "ask again next login").
 */
export async function getMyRootPopupMessageAction(): Promise<RootPopupMessage | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const message = await findMyPendingRootPopupMessage();
  if (!message) return null;

  const supabase = createClient();
  const dismissal = await getRootPopupDismissal(supabase, user.id, message.messageKey);

  if (message.kind === 'cvs_offer' || message.kind === 'lsc_offer' || message.kind === 'rpl_offer') {
    return isOfferPopupDue(dismissal) ? message : null;
  }

  // Priority Card: once per calendar day, not once per login and not on
  // every reload. Its message key already carries the member's own local
  // date (priorityCardPopupMessageKey), so the existing one-time-ever rule
  // applied to a date-scoped key IS the once-per-day rule — today's key
  // can be dismissed exactly once, and tomorrow's key is a genuinely new
  // message that pops again. No third dismissal lifetime, no new column.
  //
  // RootMessagePopupClient marks it dismissed on mount, exactly as it does
  // for the offer kinds, so a member who closes the tab or navigates away
  // without touching a button still does not get it again today.
  if (message.kind === 'priority_card') {
    return isOfferPopupDue(dismissal) ? message : null;
  }

  // The Weekly Root Review: once per the member's own local week, not once
  // per login and not on every reload. Exactly the same mechanism as the
  // Priority Card's, one scale up. Its message key already carries her own
  // week start (weeklyReviewPopupMessageKey), so the existing one-time-ever
  // rule applied to a week-scoped key IS the once-per-week rule. Next
  // Monday's key is a genuinely new message.
  //
  // RootMessagePopupClient marks it dismissed on mount, exactly as it does
  // for the priority card, so a member who closes the tab or navigates away
  // without acknowledging still does not get it again this week. The review
  // itself stays on Home for the rest of the week either way, which is what
  // makes the one showing safe.
  if (message.kind === 'weekly_review') {
    return isOfferPopupDue(dismissal) ? message : null;
  }

  // The trial arc: at most once per trial day, not once per login and not on
  // every reload. Exactly the same mechanism as the Priority Card's, one
  // scale sideways: its message key carries the day number, so the existing
  // one-time-ever rule applied to a day-scoped key IS the once-per-day rule,
  // and tomorrow's key is a genuinely new message.
  //
  // The arc-framed public entry welcome is here too, and only that one. It
  // carries the arc's key and is the arc's day 1 message, so it has to obey
  // the arc's lifetime; a welcome outside the arc falls through to the
  // recurring rule below, unchanged.
  //
  // A welcome that is a GREETING rather than an invitation is here too, for
  // its own reason: it is shown once ever, marked dismissed on mount, and
  // has no "ask me again" choice to honour.
  if (
    message.kind === 'trial_arc_day' ||
    (message.kind === 'public_entry_welcome' && (message.arc || message.hasBaseline))
  ) {
    return isOfferPopupDue(dismissal) ? message : null;
  }

  const due = isRootPopupDueThisLogin(dismissal, user.last_sign_in_at ?? null);
  return due ? message : null;
}

export async function snoozeRootPopupMessageAction(messageKey: string): Promise<{ ok: boolean }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false };

  const supabase = createClient();
  const ok = await snoozeRootPopupMessage(supabase, memberId, messageKey);
  return { ok };
}

export async function ignoreRootPopupMessageAction(messageKey: string): Promise<{ ok: boolean }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false };

  const supabase = createClient();
  const ok = await ignoreRootPopupMessage(supabase, memberId, messageKey);
  return { ok };
}
