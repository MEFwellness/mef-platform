'use server';

/**
 * The trial arc's member-facing writes, and they are the only ones this
 * half of the feature has: the delivery receipt, the CTA stamp, the day 6
 * recap's open stamp, and the day 7 close's open and door stamps.
 *
 * SEPARATE FROM app/actions/trialArc.ts ON PURPOSE. That file is the one
 * door that writes trial_arc_suppressed_at, it is administrator only four
 * times over, and tests/trial-arc-suppression-guard.test.ts reads its
 * source and fails the build if anything else appears beside it or if it is
 * imported from outside app/admin/. These two writes are the opposite kind
 * of thing: they are hers, from her own session, about a message she was
 * shown. Keeping them apart is what lets that guard stay as strict as it is.
 *
 * NONE OF THEM IS EVER CALLED FROM A RENDER. All of them arrive through the
 * analytics beacon route (app/api/analytics/track/route.ts): from a mounted
 * effect on a pop-up or a screen that genuinely displayed, or from a button
 * she pressed. A page, a layout or a server component calling any of them
 * would write a receipt for a message nobody was shown, and Next
 * prefetching a link would write one for a screen nobody opened.
 *
 * A ROUTE HANDLER, NOT A SERVER ACTION CALLED FROM THE CLIENT, for the
 * reason that route states in full: a Server Action re-renders the whole
 * current route on the server and streams the payload back, which on Home
 * was measured as a second full render for the sake of one row. These are
 * called BY the route handler, which returns 204 and re-renders nothing.
 *
 * THE SERVER DECIDES EVERYTHING THE BROWSER COULD HAVE LIED ABOUT. The only
 * things the browser sends are a message key and, on the close, which door
 * was pressed. The member, her timezone, her trial day, her pace state, the
 * step the message pointed at and whether that door was ever on her screen
 * are all re-resolved here from her own session and her own stored rows, so
 * a hand built request can only ever record something this member's own
 * screen was genuinely entitled to record today.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveTrialArcDecision } from '@/lib/trial-arc/engine';
import { claimTrialArcDelivery, markTrialArcCtaTapped } from '@/lib/trial-arc/data';
import { resolveTrialDay } from '@/lib/trial-arc/day';
import { composeTrialArcRecapPlan } from '@/lib/trial-arc/recapCompose';
import { ensureTrialArcRecap, markTrialArcRecapOpened } from '@/lib/trial-arc/recapData';
import { composeTrialArcClosePlan } from '@/lib/trial-arc/closeCompose';
import {
  ensureTrialArcClose,
  markTrialArcCloseDoor,
  markTrialArcCloseOpened,
} from '@/lib/trial-arc/closeData';
import { isTrialArcCloseAction } from '@/lib/trial-arc/closeTypes';
import {
  TRIAL_ARC_CLOSE_DAY,
  TRIAL_ARC_FIRST_RECAP_DAY,
  TRIAL_ARC_LAST_DAY,
} from '@/lib/trial-arc/constants';

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

    // DAY 7 COMPOSES HER CLOSE AT THIS EXACT MOMENT, for the same reason and
    // through the same insert-if-absent write. A member who reads the day 7
    // pop-up and closes it still has a close composed from the week she
    // actually had, on the day she was offered it, and the row's null
    // opened_at is then the honest record that she never opened it.
    //
    // The recap block above still runs on day 7 as well, deliberately.
    // Migration 205 allows a recap composed on day 6 OR day 7 precisely so a
    // member who never opened the app on day 6 is given her week rather than
    // losing it, and Prompt 6's continuation screen reads both rows.
    if (message.dayNumber === TRIAL_ARC_CLOSE_DAY) {
      await ensureTrialArcClose(supabase, user.id, {
        dayNumber: message.dayNumber,
        composedLocalDate: facts.todayLocalDate,
        compose: () =>
          composeTrialArcClosePlan(supabase, user.id, {
            day: {
              dayNumber: message.dayNumber,
              todayLocalDate: facts.todayLocalDate,
              startLocalDate: facts.startLocalDate,
              timeZone: facts.timeZone,
            },
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
 * She opened the close screen.
 *
 * THE SAME TWO THINGS AS THE RECAP'S OPEN BEACON, IN THE SAME ORDER, AND
 * FOR THE SAME REASONS. It composes her close if she does not have one yet,
 * and it stamps that she opened it. The composing half exists because three
 * real paths reach this screen without the pop-up's own beacon having
 * finished: she presses the button the instant the pop-up appears and
 * navigates while the receipt is still in flight, she arrives from a link,
 * or the receipt request was dropped. In all of them the honest answer is
 * to compose it now rather than show her an empty screen, and because the
 * write is insert-if-absent, doing it in two places cannot produce two
 * closes or a recomputed one.
 *
 * THE SERVER DECIDES WHETHER SHE MAY HAVE ONE. The browser sends nothing at
 * all. Her arc eligibility and her trial day are re-resolved here from her
 * own session, so a member the arc is not launched for, or who is not yet
 * at day 7, gets nothing written.
 *
 * DAY 7 ONLY. Before day 7 there is no close, and after it the trial is over
 * and the member surface she would be standing on has already been closed by
 * the trial lock (middleware.ts), so a close composed there would be
 * composed for a screen she cannot be on. Prompt 6's continuation screen
 * READS this close; it does not need this action to compose one late.
 */
export async function openTrialArcCloseAction(): Promise<void> {
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
    // facts on a day it has something to SAY, and a member who already
    // dismissed today's pop-up reaches this screen on a decision with none.
    const day = await resolveTrialDay(supabase, user.id);
    if (!day || day.dayNumber !== TRIAL_ARC_CLOSE_DAY) return;

    await ensureTrialArcClose(supabase, user.id, {
      dayNumber: day.dayNumber,
      composedLocalDate: day.todayLocalDate,
      compose: () => composeTrialArcClosePlan(supabase, user.id, { day }),
    });

    await markTrialArcCloseOpened(supabase, user.id);
  } catch (error) {
    console.error('openTrialArcCloseAction failed', error);
  }
}

/**
 * Which door she took on the close, or that she quietly went home.
 *
 * THE ONE THING THE BROWSER GETS TO SAY IS WHICH DOOR, and even that is
 * checked twice: the value has to be one of the three this build knows, and
 * lib/trial-arc/closeData.ts then refuses a door that is not on her own
 * stored plan, so a close drawn with one door on it can never come back
 * carrying a choice between two.
 *
 * NO ELIGIBILITY RE-RESOLUTION HERE, DELIBERATELY. The existence of her
 * close row IS the entitlement: it was written by a beacon that already
 * re-resolved her eligibility and her trial day from her own session, and
 * this update matches no row when there is none. Re-running the whole
 * engine on a button press would cost her a round trip through nine queries
 * to learn something the row already says.
 *
 * FIRST CHOICE WINS, in the data layer, so a second press after coming back
 * changes nothing about what she decided on the day.
 */
export async function markTrialArcCloseDoorAction(door: unknown): Promise<void> {
  if (!isTrialArcCloseAction(door)) return;

  try {
    const user = await getCachedUser();
    if (!user) return;

    const supabase = createClient();
    await markTrialArcCloseDoor(supabase, user.id, door);
  } catch (error) {
    console.error('markTrialArcCloseDoorAction failed', error);
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
