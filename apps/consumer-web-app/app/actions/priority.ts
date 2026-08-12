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
    revalidatePath('/today');
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
    revalidatePath('/today');
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
 */
export async function trackPriorityHelpAction(): Promise<void> {
  try {
    const supabase = createClient();
    const ctx = await memberContext(supabase);
    if (!ctx) return;

    const record = await getDailyPriority(supabase, ctx.memberId, ctx.localDate);
    if (!record) return;

    await trackPriorityAction(supabase, ctx, record.rule, 'help');
  } catch (error) {
    console.error('trackPriorityHelpAction failed', error);
  }
}
