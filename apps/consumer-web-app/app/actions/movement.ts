/**
 * apps/consumer-web-app/app/actions/movement.ts
 *
 * Server actions for Movement Intelligence. getTodaysMovementSession is the
 * one entry point the Movement Dashboard and session pages both use — it
 * returns today's session, generating one through the deterministic
 * decision engine (lib/movement/rules/) on first read if none exists yet.
 * Every mutation follows the same "real write first, best-effort side
 * effects after" shape as app/actions/checkin.ts.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import type { MovementSessionWithExercises, MovementWeeklyGoal } from '@mef/shared-types-contracts';
import type { ActionResult } from './auth';
import { getRecentCheckins, resolveLocalDate } from './checkin';
import { getActiveMovementProvider } from '@/lib/movement/providers/registry';
import { buildMovementFacts } from '@/lib/movement/rules/facts';
import { generateMovementSessionPlan } from '@/lib/movement/rules/plan';
import {
  getLatestMovementSessionForDate,
  hydrateSessionExercises,
  insertMovementSession,
  listRecentMovementSessions,
  listSessionExercises,
  setSessionExerciseCompleted,
  updateMovementSessionStatus,
} from '@/lib/movement/data';
import { computeMovementScore, DEFAULT_WEEKLY_SESSION_TARGET } from '@/lib/movement/score';
import { daysBetweenLocalDates, localDateNDaysBefore } from '@/lib/movement/dates';
import { listRegistryEntriesForMember } from '@/lib/registry/data';
import { upsertRegistryEntryFromMovementSession } from '@/lib/registry/adapters/movement';
import { emitAndDispatch } from '@/lib/ai/events';
import { buildRuleFacts } from '@/lib/ai/rules/facts';
import { recordTimelineEvent } from '@/lib/timeline/data';

async function resolveMemberContext() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  const timezone = profile?.timezone ?? 'America/New_York';
  const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const localDate = await resolveLocalDate(nowInTz, false);

  return { supabase, user, timezone, localDate };
}

/**
 * Today's movement session — generated on first read if none exists yet
 * for this member/date. Every input the decision engine uses is real: the
 * member's recent check-ins, their active Universal Registry entries
 * (posture/movement/breathing findings and wearable metrics), and their
 * own movement-session history for variety and adherence.
 */
export async function getTodaysMovementSession(): Promise<MovementSessionWithExercises | null> {
  const ctx = await resolveMemberContext();
  if (!ctx) return null;
  const { supabase, user, timezone, localDate } = ctx;
  const provider = getActiveMovementProvider();

  let session = await getLatestMovementSessionForDate(supabase, user.id, localDate);

  if (!session) {
    const [checkinsOldestFirst, registryEntries, recentSessions] = await Promise.all([
      getRecentCheckins(14),
      listRegistryEntriesForMember(supabase, user.id, { statusFilter: ['active'] }),
      listRecentMovementSessions(supabase, user.id, 30),
    ]);

    const previousSession = recentSessions[0] ?? null;
    const lastSessionExerciseIds = previousSession
      ? (await listSessionExercises(supabase, previousSession.id)).map((e) => e.exercise_id)
      : [];

    const facts = buildMovementFacts({
      checkinsOldestFirst,
      registryEntries,
      recentSessionsNewestFirst: recentSessions,
      lastSessionExerciseIds,
      asOfLocalDate: localDate,
    });

    const plan = await generateMovementSessionPlan(facts, provider);
    session = await insertMovementSession(supabase, user.id, timezone, localDate, plan);
    if (!session) return null;
  }

  const sessionExercises = await listSessionExercises(supabase, session.id);
  const exercises = await hydrateSessionExercises(sessionExercises, provider);

  return { ...session, exercises };
}

/** Rolling 7-day adherence against the default weekly target — see lib/movement/score.ts for why there's no per-member target yet. */
export async function getWeeklyMovementProgress(): Promise<MovementWeeklyGoal> {
  const ctx = await resolveMemberContext();
  if (!ctx) {
    return {
      targetSessionsPerWeek: DEFAULT_WEEKLY_SESSION_TARGET,
      completedThisWeek: 0,
      weekStartLocalDate: '',
    };
  }
  const { supabase, user, localDate } = ctx;

  const recentSessions = await listRecentMovementSessions(supabase, user.id, 30);
  const completedThisWeek = recentSessions.filter(
    (s) => s.status === 'completed' && daysBetweenLocalDates(s.local_date, localDate) <= 6
  ).length;

  return {
    targetSessionsPerWeek: DEFAULT_WEEKLY_SESSION_TARGET,
    completedThisWeek,
    weekStartLocalDate: localDateNDaysBefore(localDate, 6),
  };
}

/** Live Movement Score for the dashboard — recomputed from real session history each read, not read off a single stored row (see lib/movement/score.ts). */
export async function getCurrentMovementScore(): Promise<number | null> {
  const ctx = await resolveMemberContext();
  if (!ctx) return null;
  const { supabase, user, localDate } = ctx;

  const recentSessions = await listRecentMovementSessions(supabase, user.id, 30);
  const sessionsLast7Days = recentSessions.filter(
    (s) => daysBetweenLocalDates(s.local_date, localDate) <= 6
  );
  return computeMovementScore(sessionsLast7Days);
}

export async function startMovementSession(sessionId: string): Promise<ActionResult> {
  const ctx = await resolveMemberContext();
  if (!ctx) return { error: 'Not signed in.' };

  await updateMovementSessionStatus(ctx.supabase, sessionId, 'in_progress', {
    started_at: new Date().toISOString(),
  });
  return {};
}

export async function toggleMovementExerciseCompleted(
  sessionExerciseId: string,
  completed: boolean
): Promise<ActionResult> {
  const ctx = await resolveMemberContext();
  if (!ctx) return { error: 'Not signed in.' };

  await setSessionExerciseCompleted(ctx.supabase, sessionExerciseId, completed);
  return {};
}

export async function completeMovementSession(sessionId: string): Promise<ActionResult> {
  const ctx = await resolveMemberContext();
  if (!ctx) return { error: 'Not signed in.' };
  const { supabase, user, localDate } = ctx;

  const completedAt = new Date().toISOString();
  await updateMovementSessionStatus(supabase, sessionId, 'completed', {
    completed_at: completedAt,
  });

  const recentSessions = await listRecentMovementSessions(supabase, user.id, 30);
  const sessionsLast7Days = recentSessions.filter(
    (s) => daysBetweenLocalDates(s.local_date, localDate) <= 6
  );
  const movementScore = computeMovementScore(sessionsLast7Days);
  if (movementScore != null) {
    await updateMovementSessionStatus(supabase, sessionId, 'completed', {
      movement_score: movementScore,
    });
  }

  // Best-effort side effects — never allowed to affect the completion
  // result already written above. Same discipline as submitDailyCheckin.
  try {
    const completedSession = recentSessions.find((s) => s.id === sessionId);
    if (completedSession) {
      await upsertRegistryEntryFromMovementSession(supabase, user.id, {
        ...completedSession,
        status: 'completed',
        completed_at: completedAt,
        movement_score: movementScore ?? completedSession.movement_score,
      });
    }
  } catch (registryError) {
    console.error('Movement registry adapter failed for completeMovementSession', registryError);
  }

  try {
    const checkinsOldestFirst = await getRecentCheckins(14);
    if (checkinsOldestFirst.length > 0) {
      const facts = buildRuleFacts(checkinsOldestFirst, localDate);
      await emitAndDispatch(
        supabase,
        {
          eventType: 'movement_session_completed',
          memberId: user.id,
          source: 'member',
          payload: { sessionId },
        },
        facts
      );
    }

    await recordTimelineEvent(supabase, {
      memberId: user.id,
      eventType: 'movement_session_completed',
      localDate,
      title: 'Completed a movement session',
      sourceFeature: 'movement_sessions',
      sourceRecordId: sessionId,
    });
  } catch (aiError) {
    console.error('AI event emission failed for completeMovementSession', aiError);
  }

  return {};
}

export async function skipMovementSession(
  sessionId: string,
  reason: string | null
): Promise<ActionResult> {
  const ctx = await resolveMemberContext();
  if (!ctx) return { error: 'Not signed in.' };

  await updateMovementSessionStatus(ctx.supabase, sessionId, 'skipped', {
    skipped_at: new Date().toISOString(),
    skip_reason: reason,
  });
  return {};
}
