/**
 * The delivery route for everything a member does to her 7 Day Fuel
 * Experiment.
 *
 * =====================================================================
 * WHY A ROUTE HANDLER AND NOT A SERVER ACTION.
 * =====================================================================
 *
 * The same reason app/api/fuel-pattern/meals/route.ts is one. A Server
 * Action's response is the whole re-rendered React tree for the page it
 * was called from, and she meets this section while standing in a reveal
 * that holds precisely because nothing behind it can replace it. Starting
 * a run and logging a check both happen on that page, so both answer with
 * a few bytes of JSON instead, are not the router's, and survive her
 * navigating away.
 *
 * =====================================================================
 * NOTHING HERE TRUSTS THE BROWSER.
 * =====================================================================
 *
 *   - The member is resolved from her own session, never from the body.
 *   - THE DAY IS THE SERVER'S. Day 1 and the day a check belongs to are
 *     resolved from her stored timezone, not sent up from a device whose
 *     clock is hers to set.
 *   - THE PATTERN AND THE SITTING ARE THE SERVER'S TOO. A run records the
 *     reading it is testing and the sitting it came from, both read from
 *     her latest stored result, so a hand made POST cannot start a run
 *     against a reading she was never given.
 *   - Every one of the three answers is checked against its closed list,
 *     and a meal tag is checked against the library. A meal id that names
 *     a real meal brings that meal's own type with it rather than
 *     accepting the type the browser claimed.
 *   - A check can only ever be written into HER live run, which is read
 *     here rather than named by the body.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { memberTodayLocalDate } from '@/lib/time/memberToday';
import { findLatestFuelPatternResult } from '@/lib/fuel-pattern/data';
import { fpaMealById } from '@/lib/fuel-pattern/meals/library';
import {
  acknowledgeFpaExperiment,
  archiveFpaExperiment,
  findLiveFpaExperiment,
  isFpaCheckMealType,
  isFpaClarityAnswer,
  isFpaEnergyAnswer,
  isFpaHungerAnswer,
  recordFpaExperimentCheck,
  startFpaExperiment,
} from '@/lib/fuel-pattern/experiment/data';
import { fpaExperimentDayNumber } from '@/lib/fuel-pattern/experiment/days';
import type { FpaExperimentCheck } from '@/lib/fuel-pattern/experiment/types';

type Body = {
  action?: unknown;
  energy?: unknown;
  hunger?: unknown;
  clarity?: unknown;
  mealType?: unknown;
  mealId?: unknown;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const supabase = createClient();
  const memberId = user.id;

  switch (body.action) {
    case 'start':
      return start(supabase, memberId, { restart: false });
    case 'restart':
      return start(supabase, memberId, { restart: true });
    case 'check':
      return check(supabase, memberId, body);
    case 'acknowledge':
      return acknowledge(supabase, memberId);
    default:
      return NextResponse.json({ ok: false }, { status: 400 });
  }
}

/**
 * Day 1 is today, where she is standing.
 *
 * A restart archives the run she is finished with first, in the same
 * request, which is what keeps the one live run per member rule true
 * rather than merely intended.
 */
async function start(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  options: { restart: boolean }
): Promise<NextResponse> {
  const latest = await findLatestFuelPatternResult(supabase, memberId);
  if (!latest) return NextResponse.json({ ok: false }, { status: 400 });

  if (options.restart) {
    const live = await findLiveFpaExperiment(supabase, memberId);
    if (live) {
      const archived = await archiveFpaExperiment(supabase, memberId, live.id, 'restarted');
      if (!archived) return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  const startedOn = await memberTodayLocalDate(supabase, memberId);
  const run = await startFpaExperiment(supabase, memberId, {
    pattern: latest.pattern,
    startedOn,
    sessionId: latest.sessionId,
  });
  if (!run) return NextResponse.json({ ok: false }, { status: 500 });

  return NextResponse.json({
    ok: true,
    run: {
      id: run.id,
      pattern: run.pattern,
      startedOn: run.startedOn,
      dayNumber: fpaExperimentDayNumber(run.startedOn, startedOn),
      acknowledged: run.acknowledgedAt !== null,
    },
    todayLocalDate: startedOn,
  });
}

/**
 * One quick check. Three answers, and the tag when she gave one.
 *
 * IT IS WRITTEN AGAINST HER LIVE RUN WHATEVER DAY SHE IS ON. A check
 * logged on day 8, before she has pressed DONE, is a real thing she
 * noticed and is kept; it simply falls outside the seven days the
 * completion summary counts. Refusing it would be throwing away
 * information to protect a number.
 */
async function check(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  body: Body
): Promise<NextResponse> {
  if (
    !isFpaEnergyAnswer(body.energy) ||
    !isFpaHungerAnswer(body.hunger) ||
    !isFpaClarityAnswer(body.clarity)
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const run = await findLiveFpaExperiment(supabase, memberId);
  if (!run) return NextResponse.json({ ok: false }, { status: 409 });

  /*
    A TAGGED MEAL BRINGS ITS OWN MEAL TYPE. The two cannot disagree,
    because a check that says "lunch" while naming a breakfast would put
    a low energy reading under the wrong part of her day, and that is
    exactly what the meal_type_flag insight reads.
  */
  const meal = typeof body.mealId === 'string' ? fpaMealById(body.mealId) : null;
  const mealType = meal
    ? meal.type
    : isFpaCheckMealType(body.mealType)
      ? body.mealType
      : null;

  const loggedOn = await memberTodayLocalDate(supabase, memberId);
  const written = await recordFpaExperimentCheck(supabase, memberId, {
    experimentId: run.id,
    loggedOn,
    energy: body.energy,
    hunger: body.hunger,
    clarity: body.clarity,
    mealType,
    mealId: meal?.id ?? null,
  });
  if (!written) return NextResponse.json({ ok: false }, { status: 500 });

  const check: FpaExperimentCheck = written;
  return NextResponse.json({ ok: true, check });
}

/** She pressed DONE on the completion screen. */
async function acknowledge(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<NextResponse> {
  const run = await findLiveFpaExperiment(supabase, memberId);
  if (!run) return NextResponse.json({ ok: false }, { status: 409 });
  const done = await acknowledgeFpaExperiment(supabase, memberId, run.id);
  return NextResponse.json({ ok: done }, { status: done ? 200 : 500 });
}
