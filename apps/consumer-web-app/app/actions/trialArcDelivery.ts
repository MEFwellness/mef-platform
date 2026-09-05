'use server';

/**
 * The trial arc's two writes, and they are the only two the member-facing
 * half of this feature has.
 *
 * SEPARATE FROM app/actions/trialArc.ts ON PURPOSE. That file is the one
 * door that writes trial_arc_suppressed_at, it is administrator only four
 * times over, and tests/trial-arc-suppression-guard.test.ts reads its
 * source and fails the build if anything else appears beside it or if it is
 * imported from outside app/admin/. These two writes are the opposite kind
 * of thing: they are hers, from her own session, about a message she was
 * shown. Keeping them apart is what lets that guard stay as strict as it is.
 *
 * NEITHER IS EVER CALLED FROM A RENDER. Both arrive through the analytics
 * beacon route (app/api/analytics/track/route.ts): one from a mounted
 * effect on a pop-up that genuinely displayed, one from the button she
 * pressed. A page, a layout or a server component calling either would
 * write a receipt for a message nobody was shown, and Next prefetching a
 * link would write one for a screen nobody opened.
 *
 * A ROUTE HANDLER, NOT A SERVER ACTION CALLED FROM THE CLIENT, for the
 * reason that route states in full: a Server Action re-renders the whole
 * current route on the server and streams the payload back, which on Home
 * was measured as a second full render for the sake of one row. These are
 * called BY the route handler, which returns 204 and re-renders nothing.
 *
 * THE SERVER DECIDES EVERYTHING THE BROWSER COULD HAVE LIED ABOUT. The only
 * thing the browser sends is a message key. The member, her timezone, her
 * trial day, her pace state and the step the message pointed at are all
 * re-resolved here from her own session through the same engine that
 * decided to show it, so a hand built request can only ever record a
 * receipt for the message this member's own screen was genuinely entitled
 * to display today.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveTrialArcDecision } from '@/lib/trial-arc/engine';
import { claimTrialArcDelivery, markTrialArcCtaTapped } from '@/lib/trial-arc/data';
import { resolveTrialDay } from '@/lib/trial-arc/day';
import { composeTrialArcRecapPlan } from '@/lib/trial-arc/recapCompose';
import { ensureTrialArcRecap, markTrialArcRecapOpened } from '@/lib/trial-arc/recapData';
import { TRIAL_ARC_FIRST_RECAP_DAY, TRIAL_ARC_LAST_DAY } from '@/lib/trial-arc/constants';

/**
 * Records that one trial arc message reached her screen.
 *
 * Insert if absent, so a reload, a second mount or a stale tab all resolve
 * to the one row that already exists with its first delivered_at. See
 * migration 204.
 *
 * A KEY THAT IS NOT TODAY'S IS DROPPED SILENTLY. The engine is asked what
 * this member's message is right now, and anything else writes nothing:
 * that covers a stale tab left open across midnight as well as a forged
 * request, and both deserve the same answer, which is nothing.
 */
export async function trackTrialArcDeliveredAction(messageKey: unknown): Promise<void> {
  if (typeof messageKey !== 'string' || messageKey.length === 0) return;

  try {
    const user = await getCachedUser();
    if (!user) return;

    const supabase = createClient();
    const decision = await resolveTrialArcDecision(supabase, user.id, {
      lastSignInAt: user.last_sign_in_at ?? null,
    });

    const message = decision.message;
    const facts = decision.facts;
    if (!message || message.messageKey !== messageKey || !facts) return;

    await claimTrialArcDelivery(supabase, user.id, {
      messageKey: message.messageKey,
      dayNumber: message.dayNumber,
      paceState: message.paceState,
      pointedStep: message.copy.step,
      deliveredLocalDate: facts.todayLocalDate,
    });

    // DAY 6 COMPOSES HER RECAP AT THIS EXACT MOMENT, and this is the moment
    // the build's own rule names: the beacon confirming that the message
    // genuinely reached her screen. Not on the render that decided to show
    // it, and not when she presses the button, so a member who reads the
    // pop-up and closes it still has a recap composed from the week she
    // actually had on the day she was offered it.
    //
    // Insert if absent. A second display, a reload or the CTA beacon
    // arriving a moment later all find the row that already exists and
    // change nothing about it.
    if (message.dayNumber >= TRIAL_ARC_FIRST_RECAP_DAY) {
      await ensureTrialArcRecap(supabase, user.id, {
        dayNumber: message.dayNumber,
        composedLocalDate: facts.todayLocalDate,
        compose: () =>
          composeTrialArcRecapPlan(supabase, user.id, {
            day: {
              dayNumber: message.dayNumber,
              todayLocalDate: facts.todayLocalDate,
              startLocalDate: facts.startLocalDate,
              timeZone: facts.timeZone,
            },
            now: new Date(),
          }),
      });
    }
  } catch (error) {
    console.error('trackTrialArcDeliveredAction failed', error);
  }
}

/**
 * She opened the recap screen.
 *
 * TWO THINGS, IN ORDER, AND BOTH BELONG TO A REAL DISPLAY. It composes her
 * recap if she does not have one yet, and it stamps that she opened it.
 *
 * WHY IT COMPOSES AT ALL, when the day 6 pop-up already does. Three real
 * paths reach this screen without that beacon having finished: she presses
 * the button the instant the pop-up appears and navigates while the receipt
 * is still in flight (the same race that cost the CTA stamp a real bug on
 * 2026-09-04), she opens the recap on day 7 having never opened the app on
 * day 6, or she arrives from a link. In all three the honest answer is to
 * compose it now rather than show her an empty screen, and because the
 * write is insert-if-absent, doing it in two places cannot produce two
 * recaps or a recomputed one.
 *
 * THE SERVER DECIDES WHETHER SHE MAY HAVE ONE. The browser sends nothing at
 * all. Her arc eligibility and her trial day are re-resolved here from her
 * own session, exactly as the two beacons above do, and a member the arc is
 * not launched for, or who is not yet at day 6, gets nothing written.
 *
 * NOT A RENDER, AND NOT A SERVER ACTION CALLED FROM THE CLIENT. It arrives
 * through the analytics beacon route, fired by a mounted effect on the
 * recap screen itself.
 */
export async function openTrialArcRecapAction(): Promise<void> {
  try {
    const user = await getCachedUser();
    if (!user) return;

    const supabase = createClient();
    const decision = await resolveTrialArcDecision(supabase, user.id, {
      lastSignInAt: user.last_sign_in_at ?? null,
    });
    if (!decision.eligible) return;

    // ONE SOURCE FOR THE TRIAL DAY. Asked of the clock module directly
    // rather than read off the decision, because the decision only carries
    // facts on a day it has something to SAY, and this screen is reachable
    // on day 7 as well, when it does not.
    const day = await resolveTrialDay(supabase, user.id);
    if (!day) return;

    // Days 6 and 7 only. Before day 6 there is no week to read back yet, and
    // after day 7 the trial is over and the member surface she would be
    // standing on has already been closed by the trial lock (middleware.ts),
    // so a recap composed there would be composed for a screen she cannot
    // be on. The next prompt's continuation screen READS this recap; it
    // does not need this action to compose one late.
    if (day.dayNumber < TRIAL_ARC_FIRST_RECAP_DAY || day.dayNumber > TRIAL_ARC_LAST_DAY) return;

    await ensureTrialArcRecap(supabase, user.id, {
      dayNumber: day.dayNumber,
      composedLocalDate: day.todayLocalDate,
      compose: () => composeTrialArcRecapPlan(supabase, user.id, { day, now: new Date() }),
    });

    await markTrialArcRecapOpened(supabase, user.id);
  } catch (error) {
    console.error('openTrialArcRecapAction failed', error);
  }
}

/**
 * Stamps that she pressed a trial arc message's primary button.
 *
 * WHY THIS IS NOT ANALYTICS. It is one half of what "ignored" means to the
 * closer: three messages that reached her and that she neither acted on nor
 * answered with the step they pointed at, and the pacing stops permanently.
 * A tap that went unrecorded would count against her.
 *
 * IT CLAIMS THE RECEIPT BEFORE IT STAMPS IT, AND THAT IS A REAL BUG FIX
 * (2026-09-04, found by driving day 1 on the live site). The display beacon
 * and this one are two independent requests fired about a second apart, and
 * nothing orders them. A member who presses the button the moment the
 * pop-up appears sends the tap while the display receipt is still in
 * flight, and an UPDATE against a row that does not exist yet matches
 * nothing and returns no error. The tap was silently lost, and the closer
 * then counted a message she had acted on as one she had ignored: three of
 * those and Root stops talking to somebody who was doing exactly what was
 * asked.
 *
 * A TAP IS PROOF OF A DISPLAY, so claiming the receipt here is not
 * inventing one. It is the same insert-if-absent the display beacon does,
 * against the same unique constraint, so whichever of the two arrives first
 * writes the row and the other finds it already there.
 *
 * The claim re-resolves today's message from her own session first, exactly
 * as the display beacon does, so a stale tab or a forged key can still only
 * ever write the receipt this member's own screen was entitled to write
 * today. If the key names something that is not today's message, nothing is
 * claimed and the stamp simply matches whatever row is already there, which
 * for a forged key is none.
 */
export async function markTrialArcCtaTappedAction(messageKey: unknown): Promise<void> {
  if (typeof messageKey !== 'string' || messageKey.length === 0) return;

  try {
    const user = await getCachedUser();
    if (!user) return;

    const supabase = createClient();

    const decision = await resolveTrialArcDecision(supabase, user.id, {
      lastSignInAt: user.last_sign_in_at ?? null,
    });
    const message = decision.message;
    if (message && message.messageKey === messageKey && decision.facts) {
      await claimTrialArcDelivery(supabase, user.id, {
        messageKey: message.messageKey,
        dayNumber: message.dayNumber,
        paceState: message.paceState,
        pointedStep: message.copy.step,
        deliveredLocalDate: decision.facts.todayLocalDate,
      });
    }

    await markTrialArcCtaTapped(supabase, user.id, messageKey);
  } catch (error) {
    console.error('markTrialArcCtaTappedAction failed', error);
  }
}
