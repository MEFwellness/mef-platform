'use server';

/**
 * Priority Card — the server actions behind the card's three buttons and
 * its two analytics events.
 *
 * Everything analytics here goes through lib/analytics/track.ts, which
 * goes through lib/events/service.ts's recordMemberEvent, the one write
 * path into member_wellness_events. No second pipeline, and every payload
 * value is validated against the closed allowlists in
 * lib/analytics/surfaces.ts before it can reach the database, because
 * these actions are called from a client component and their arguments
 * therefore arrive from the browser.
 *
 * The three buttons are deliberately NOT one generic action with a mode
 * argument: Done has a real side effect beyond the card (it writes the
 * Reset Plan's own daily log when the priority is a plan commitment), and
 * collapsing them would hide that.
 */

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { trackProductEvent } from '@/lib/analytics/track';
import { isPriorityAction, isPriorityPresentation, isPriorityRule } from '@/lib/analytics/surfaces';
import { claimPriorityShown, getDailyPriority, setDailyPriorityStatus } from '@/lib/priority/data';
import { getCoachingDecision } from '@/lib/coaching-direction/data';
import { recordCardResponse } from '@/lib/coaching-direction/service';
import type { CardResponse } from '@/lib/coaching-direction/types';
import {
  getCurrentResetPlan,
  getLatestResetPlanVersionId,
  upsertResetPlanDailyLog,
} from '@/lib/reset-plan/data';
import { resolveLocalDate } from './checkin';

type MemberContext = { memberId: string; timezone: string; localDate: string };

async function memberContext(supabase: SupabaseClient): Promise<MemberContext | null> {
  const user = await getCachedUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();

  const timezone = profile?.timezone ?? 'America/New_York';
  const localDate = await resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
  return { memberId: user.id, timezone, localDate };
}

/**
 * The card was shown, which rule won, and whether it reached her as the
 * pop-up or inline. Fired from the client after paint, same reason
 * app/actions/analytics.ts's own surface-view action is an action rather
 * than tracking inside the server render.
 *
 * Exactly one `priority_shown` event per member per local day, guaranteed
 * by `claimPriorityShown`'s conditional UPDATE rather than by a client-side
 * dedupe window. That matters because the card can render three times in
 * one day (pop-up, Home, Today) and Home renders the pop-up and the inline
 * card in the same pass, so no client-side timer could decide this
 * correctly or deterministically. The presentation recorded is whichever
 * one genuinely reached her first.
 */
export async function trackPriorityShownAction(
  rule: string,
  presentation: string
): Promise<void> {
  try {
    if (!isPriorityRule(rule)) return;
    if (!isPriorityPresentation(presentation)) return;
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;

    const won = await claimPriorityShown(supabase, ctx.memberId, ctx.localDate, presentation);
    if (!won) return;

    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 'priority_shown',
      timezone: ctx.timezone,
      payload: { rule, presentation },
    });

    // The delivery event, riding the SAME atomic claim. That is the whole
    // reason it lives here rather than in its own tracker: the claim is
    // what guarantees exactly one per member per local day, and a second
    // call site with its own dedupe would eventually disagree with this
    // one about how many actions were delivered.
    //
    // The action type comes from the ledger row rather than from the
    // client, so a browser can never assert what kind of action it was
    // shown.
    const decision = await getCoachingDecision(supabase, ctx.memberId, ctx.localDate);
    if (decision) {
      await trackProductEvent(supabase, {
        memberId: ctx.memberId,
        eventType: 'coaching_action_delivered',
        timezone: ctx.timezone,
        payload: { rule: decision.rule, actionType: decision.actionType },
      });
    }
  } catch (error) {
    console.error('trackPriorityShownAction failed', error);
  }
}

/**
 * A re-entry opening was shown. Separate from priority_shown (which also
 * fires, carrying rule 're_entry') so "how often does the re-entry state
 * actually fire" is answerable on its own without inferring it from a
 * rule slug.
 */
export async function trackReEntryShownAction(): Promise<void> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;
    await trackProductEvent(supabase, {
      memberId: ctx.memberId,
      eventType: 're_entry_shown',
      timezone: ctx.timezone,
    });
  } catch (error) {
    console.error('trackReEntryShownAction failed', error);
  }
}

async function trackPriorityAction(
  supabase: SupabaseClient,
  ctx: MemberContext,
  rule: string,
  action: string
): Promise<void> {
  if (!isPriorityRule(rule) || !isPriorityAction(action)) return;
  await trackProductEvent(supabase, {
    memberId: ctx.memberId,
    eventType: 'priority_action',
    timezone: ctx.timezone,
    payload: { rule, action },
  });
}

/**
 * The Adaptive Coaching Direction half of a button tap: the outcome row,
 * and the coaching_action_* event.
 *
 * Deliberately additive to trackPriorityAction rather than replacing it.
 * priority_action is about the CARD (which button, on which rule) and has
 * a year of meaning behind it; the coaching_action_* events are about the
 * DECISION (which kind of action, acted on or dismissed). Collapsing them
 * would break every existing rollup to save one row.
 *
 * 'done' and 'help' are both acting on it: she did the thing, or she took
 * the smaller way in. 'save' is dismissing it for today. That mapping is
 * the whole editorial judgement in this function, and it is why "Help me"
 * counts as a success rather than a failure of the action.
 */
async function recordCoachingOutcome(
  supabase: SupabaseClient,
  ctx: MemberContext,
  response: CardResponse
): Promise<void> {
  const decision = await getCoachingDecision(supabase, ctx.memberId, ctx.localDate);
  if (!decision) return;

  await recordCardResponse(supabase, ctx.memberId, ctx.localDate, response);

  if (!isPriorityRule(decision.rule)) return;

  await trackProductEvent(supabase, {
    memberId: ctx.memberId,
    eventType: response === 'later' ? 'coaching_action_dismissed' : 'coaching_action_acted',
    timezone: ctx.timezone,
    payload: {
      rule: decision.rule,
      actionType: decision.actionType,
      action: response === 'later' ? 'save' : response,
    },
  });
}

/**
 * Done.
 *
 * Two writes, and the second one is the point. Marking the row done is
 * what makes the card render its accomplished state on the next load. But
 * when the priority IS an active Reset Plan commitment, this also writes
 * the plan's own real daily log through the Reset Plan's own data layer,
 * which is what genuinely feeds tomorrow's selection: rule 1 asks "an
 * active commitment she has not completed today", so a logged completion
 * is precisely what stops the same commitment winning again tomorrow
 * before she has actually done it. Nothing decorative, and no second copy
 * of the Reset Plan's completion state.
 */
export async function completePriorityAction(): Promise<{ ok: boolean }> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return { ok: false };

    const record = await getDailyPriority(supabase, ctx.memberId, ctx.localDate);
    if (!record) return { ok: false };

    if (record.rule === 'reset_plan_commitment') {
      const plan = await getCurrentResetPlan(supabase, ctx.memberId);
      if (plan && plan.status === 'active') {
        const planVersionId = await getLatestResetPlanVersionId(supabase, plan.id);
        if (planVersionId) {
          await upsertResetPlanDailyLog(
            supabase,
            ctx.memberId,
            plan.id,
            planVersionId,
            ctx.localDate,
            'completed_normal'
          );
        }
      }
    }

    const ok = await setDailyPriorityStatus(supabase, ctx.memberId, ctx.localDate, 'done');
    await trackPriorityAction(supabase, ctx, record.rule, 'done');
    await recordCoachingOutcome(supabase, ctx, 'done');
    // Narrowed to the page itself. The only thing this answer changes on
    // /today is the card inside that page; the bare `revalidatePath('/today')`
    // this replaced also invalidated the layout above it, so every tap
    // threw away more of the member's warm client-side cache than the tap
    // had actually changed and her next few navigations all went back to
    // the server. Measured on production under Slow 3G: the first
    // navigation after a Done took roughly twice as long as after an
    // answer that revalidates nothing.
    revalidatePath('/today', 'page');
    return { ok };
  } catch (error) {
    console.error('completePriorityAction failed', error);
    return { ok: false };
  }
}

/**
 * Save for later. Only a status change: the card collapses and drops down
 * the page, and Root does not raise the same priority back to dominant
 * again today, which is what the stored status is read for on the next
 * render.
 */
export async function savePriorityForLaterAction(): Promise<{ ok: boolean }> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return { ok: false };

    const record = await getDailyPriority(supabase, ctx.memberId, ctx.localDate);
    if (!record) return { ok: false };

    const ok = await setDailyPriorityStatus(supabase, ctx.memberId, ctx.localDate, 'saved');
    await trackPriorityAction(supabase, ctx, record.rule, 'save');
    await recordCoachingOutcome(supabase, ctx, 'later');
    // The page itself only. See completePriorityAction for why.
    revalidatePath('/today', 'page');
    return { ok };
  } catch (error) {
    console.error('savePriorityForLaterAction failed', error);
    return { ok: false };
  }
}

/**
 * Help me. Records the tap and nothing else: the smaller next step is
 * already on the page (it is stored on the row and passed to the card at
 * render), so expanding it is pure client state with no round trip and no
 * navigation. This action exists only so the analytics requirement is met
 * honestly rather than by inferring the tap from something else.
 *
 * It reports whether it landed, unlike the fire-and-forget shape it had at
 * first, because it also writes the outcome ledger row that says she took
 * the smaller way in — and the caller retries anything that did not land.
 */
export async function trackPriorityHelpAction(): Promise<{ ok: boolean }> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return { ok: false };

    const record = await getDailyPriority(supabase, ctx.memberId, ctx.localDate);
    if (!record) return { ok: false };

    await trackPriorityAction(supabase, ctx, record.rule, 'help');
    await recordCoachingOutcome(supabase, ctx, 'help');
    return { ok: true };
  } catch (error) {
    console.error('trackPriorityHelpAction failed', error);
    return { ok: false };
  }
}
