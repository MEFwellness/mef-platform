/**
 * apps/consumer-web-app/app/actions/movement-sessions.ts
 *
 * Root Movement, Level 1 — the server actions the session player calls.
 *
 * Every one of them:
 *   - resolves the member from the session cookie, never from an argument,
 *     so a run can only ever be written for the person holding it;
 *   - validates the session key against movement_session_templates itself
 *     and the exercise id against that session's own slots, so the values
 *     that reach an analytics payload are members of a closed set defined
 *     in the database rather than strings that arrived from a browser;
 *   - records its analytics event through lib/analytics/track.ts, the one
 *     existing write path, and never lets a failed event break the member's
 *     action.
 *
 * PRIVACY: the arguments below are the entire surface. There is no note
 * parameter, no rating, no reason, and no free text anywhere in this file,
 * which is what makes "keys, ids, timestamps and counts only" a property
 * of the code rather than a promise about it.
 *
 * THE MOVEMENT FLIP changed exactly one of those sentences. Completing a
 * session now closes today's priority when today's priority WAS that
 * session, so a member who does the workout never also has to tap Done. It
 * writes through the same two functions the card's own Done button uses and
 * adds no second outcome path; see
 * lib/coaching-direction/movementOutcome.ts. Nothing else changed: starting,
 * viewing and skipping still touch no coaching table at all, and nothing
 * here writes to member_weekly_reviews or the pop-up chain.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import type { SupabaseClient } from '@supabase/supabase-js';
import { trackProductEvent, resolveMemberTimezone } from '@/lib/analytics/track';
import { getCoachingDecision } from '@/lib/coaching-direction/data';
import { recordMovementSessionCompletion } from '@/lib/coaching-direction/movementOutcome';
import { resolveLocalDate } from './checkin';
import {
  appendSessionRunSkip,
  completeSessionRun,
  getSessionRun,
  getSessionTemplate,
  insertSessionRun,
  listTemplateSlots,
} from '@/lib/movement-sessions/data';

type MemberContext = { supabase: SupabaseClient; memberId: string; timezone: string };

async function memberContext(): Promise<MemberContext | null> {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = createClient();
  const timezone = await resolveMemberTimezone(supabase, user.id);
  return { supabase, memberId: user.id, timezone };
}

/**
 * True only when this key names one of the live templates. An unknown or
 * retired key is silently ignored everywhere below rather than raised: a
 * stale bookmark is a normal thing for a member to have, not an error to
 * show her.
 */
async function isKnownSessionKey(supabase: SupabaseClient, sessionKey: string): Promise<boolean> {
  const template = await getSessionTemplate(supabase, sessionKey);
  return template !== null;
}

/** True only when this exercise is genuinely one of that session's slots. */
async function isSlotOfSession(
  supabase: SupabaseClient,
  sessionKey: string,
  externalId: string
): Promise<boolean> {
  const template = await getSessionTemplate(supabase, sessionKey);
  if (!template) return false;
  const slots = await listTemplateSlots(supabase, template.id);
  return slots.some((slot) => slot.external_id === externalId);
}

/**
 * She opened a session's screen. Analytics only: opening a session is not
 * starting one, and nothing is written to her history here.
 */
export async function trackMovementSessionViewedAction(
  sessionKey: string,
  exerciseCount: number
): Promise<void> {
  try {
    const ctx = await memberContext();
    if (!ctx) return;
    if (!(await isKnownSessionKey(ctx.supabase, sessionKey))) return;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'movement_session_viewed',
      timezone: ctx.timezone,
      payload: { sessionKey, exerciseCount: String(Math.max(0, Math.trunc(exerciseCount))) },
    });
  } catch (error) {
    console.error('trackMovementSessionViewedAction failed', error);
  }
}

/**
 * She pressed begin. Returns the run id the rest of the session reports
 * against, or null when the run could not be written, in which case the
 * player still walks the session normally and simply records nothing.
 * A member is never blocked from moving because a database write failed.
 */
export async function startMovementSessionAction(sessionKey: string): Promise<string | null> {
  try {
    const ctx = await memberContext();
    if (!ctx) return null;
    if (!(await isKnownSessionKey(ctx.supabase, sessionKey))) return null;

    const run = await insertSessionRun(ctx.supabase, ctx.memberId, sessionKey);
    if (!run) return null;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'movement_session_started',
      timezone: ctx.timezone,
      payload: { sessionKey },
    });

    return run.id;
  } catch (error) {
    console.error('startMovementSessionAction failed', error);
    return null;
  }
}

/**
 * She skipped one exercise. The exercise id is checked against the run's
 * OWN session before anything is recorded, so an id that is not part of
 * this session cannot reach either the run row or an event payload.
 */
export async function skipMovementExerciseAction(
  runId: string,
  externalId: string
): Promise<boolean> {
  try {
    const ctx = await memberContext();
    if (!ctx) return false;

    const run = await getSessionRun(ctx.supabase, ctx.memberId, runId);
    if (!run) return false;
    if (!(await isSlotOfSession(ctx.supabase, run.session_key, externalId))) return false;

    const skipped = await appendSessionRunSkip(ctx.supabase, ctx.memberId, runId, externalId);
    if (skipped === null) return false;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'movement_exercise_skipped',
      timezone: ctx.timezone,
      payload: { sessionKey: run.session_key, exerciseId: externalId },
    });

    return true;
  } catch (error) {
    console.error('skipMovementExerciseAction failed', error);
    return false;
  }
}

/**
 * She reached the end. completeSessionRun only ever claims a run whose
 * completed_at is still null, so a double submit returns null here and
 * the completion event fires exactly once per run.
 *
 * And, since the movement flip, this is also where today's priority is
 * marked done when today's priority WAS this session. That write is
 * conditional in three independent places and cannot double-count; see
 * lib/coaching-direction/movementOutcome.ts. It is deliberately AFTER the
 * completion event and outside anything the member is waiting on: a failure
 * to close a coaching loop must never cost her the completion itself.
 */
export async function completeMovementSessionAction(runId: string): Promise<boolean> {
  try {
    const ctx = await memberContext();
    if (!ctx) return false;

    const run = await completeSessionRun(ctx.supabase, ctx.memberId, runId);
    if (!run) return false;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'movement_session_completed',
      timezone: ctx.timezone,
      payload: {
        sessionKey: run.session_key,
        skipCount: String(run.skipped_exercise_ids.length),
      },
    });

    await closeMovementPriority(ctx, run.session_key);

    return true;
  } catch (error) {
    console.error('completeMovementSessionAction failed', error);
    return false;
  }
}

/**
 * Today's priority, marked done because she did it.
 *
 * The `coaching_action_acted` event is the SAME event the card's Done
 * button fires (app/actions/priority.ts's recordCoachingOutcome), with the
 * same three behavioral fields and no fourth. It is fired only when the
 * ledger write genuinely landed, which is what keeps it exactly one per
 * decision whether she taps Done, opens the smaller step, or simply does
 * the session.
 *
 * `priority_action` is deliberately NOT fired here. That event is about
 * which BUTTON was tapped on the card, and she tapped none: inventing a
 * synthetic button press would make a year of card-interaction rollups
 * quietly wrong.
 */
async function closeMovementPriority(ctx: MemberContext, sessionKey: string): Promise<void> {
  try {
    const localDate = await resolveLocalDate(
      new Date(new Date().toLocaleString('en-US', { timeZone: ctx.timezone })),
      false
    );

    const decision = await getCoachingDecision(ctx.supabase, ctx.memberId, localDate);
    if (!decision) return;

    const outcome = await recordMovementSessionCompletion(
      ctx.supabase,
      ctx.memberId,
      localDate,
      sessionKey
    );
    if (outcome !== 'recorded') return;

    await trackProductEvent(ctx.supabase, {
      memberId: ctx.memberId,
      eventType: 'coaching_action_acted',
      timezone: ctx.timezone,
      payload: {
        rule: decision.rule,
        actionType: decision.actionType,
        action: 'done',
      },
    });

    // The card lives inside /today's page, exactly as the Done button's own
    // action narrows it to.
    revalidatePath('/today', 'page');
  } catch (error) {
    console.error('closeMovementPriority failed', error);
  }
}
