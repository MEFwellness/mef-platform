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
    if (!message || message.messageKey !== messageKey || !decision.facts) return;

    await claimTrialArcDelivery(supabase, user.id, {
      messageKey: message.messageKey,
      dayNumber: message.dayNumber,
      paceState: message.paceState,
      pointedStep: message.copy.step,
      deliveredLocalDate: decision.facts.todayLocalDate,
    });
  } catch (error) {
    console.error('trackTrialArcDeliveredAction failed', error);
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
 * NO DECISION CHECK, unlike the receipt above. By the time she taps, the act
 * of tapping may already have changed what today's message would be, and
 * the row this stamps is her own and already exists. The update is scoped to
 * her own member_id and to a row with no stamp on it yet, so the worst a
 * forged key can do is match nothing.
 */
export async function markTrialArcCtaTappedAction(messageKey: unknown): Promise<void> {
  if (typeof messageKey !== 'string' || messageKey.length === 0) return;

  try {
    const user = await getCachedUser();
    if (!user) return;

    await markTrialArcCtaTapped(createClient(), user.id, messageKey);
  } catch (error) {
    console.error('markTrialArcCtaTappedAction failed', error);
  }
}
