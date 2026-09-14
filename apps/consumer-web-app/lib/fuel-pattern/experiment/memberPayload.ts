/**
 * Rooted Reset Fuel Pattern Assessment, Build 4 — the experiment payload
 * her screen is handed, and the fence around it.
 *
 * =====================================================================
 * THE SAME FENCE BUILDS 2 AND 3 BUILT, EXTENDED RATHER THAN REOPENED.
 * =====================================================================
 *
 * Everything in this object is something a member may read. No score, no
 * confidence, no tendency, and nothing from lib/fuel-pattern/coachCopy.ts
 * or from any coach module is reachable from this file.
 * tests/fuel-pattern-member-payload.test.ts walks the real import graph
 * and proves it.
 *
 * =====================================================================
 * BUILDING IT IS A READ. A RENDER NEVER DECIDES ANYTHING.
 * =====================================================================
 *
 * Opening the result page, or her own experiment screen, inserts
 * nothing, starts nothing and acknowledges nothing. A run begins because
 * she pressed START MY EXPERIMENT, and every check exists because she
 * tapped three answers. The only write anywhere near a completion is the
 * retake archive, and that lives in the Server Action behind the last
 * button of a sitting.
 *
 * HER CHECKS COME DOWN WITH THE PAGE, all of them, so a new one can be
 * folded in and the standing insight recomputed in her browser by the
 * server's own engine. That is what keeps a tap off the router and the
 * reveal on the screen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { memberTodayLocalDate } from '@/lib/time/memberToday';
import { fpaExperimentDayNumber, fpaExperimentStatus } from './days';
import { FPA_MY_EXPERIMENT, fpaExperimentDayLine } from './copy';
import {
  findLiveFpaExperiment,
  listFpaExperimentChecks,
  type FpaExperimentRow,
} from './data';
import type { FpaExperimentPayload, FpaExperimentRun, FpaTaggableMeal } from './payload';
import { fpaMealById } from '../meals/library';
import { listFpaMealSaves } from '../meals/data';
import type { FpaMealsPayload } from '../meals/payload';

export type { FpaExperimentPayload, FpaExperimentRun, FpaTaggableMeal } from './payload';

/** The most meals the quick check will ever offer as a one tap tag. */
const MAX_TAGGABLE_MEALS = 4;

function toRun(
  row: FpaExperimentRow,
  todayLocalDate: string,
  checks: FpaExperimentRun['checks']
): FpaExperimentRun {
  return {
    id: row.id,
    pattern: row.pattern,
    startedOn: row.startedOn,
    dayNumber: fpaExperimentDayNumber(row.startedOn, todayLocalDate),
    status: fpaExperimentStatus(row.startedOn, todayLocalDate, row.archivedAt),
    acknowledged: row.acknowledgedAt !== null,
    checks,
  };
}

/**
 * Her live run and everything her screen needs to draw it.
 *
 * `taggableMeals` is decided by the CALLER, because what counts as "a
 * meal she just viewed" is a fact about the screen she is standing on.
 * The result page offers the four cards she is scrolling past; her own
 * experiment screen offers what she has saved, because that is what she
 * can see from there.
 */
export async function buildFpaExperimentPayload(
  supabase: SupabaseClient,
  memberId: string,
  options: { taggableMeals?: FpaTaggableMeal[] } = {}
): Promise<FpaExperimentPayload> {
  const [todayLocalDate, row] = await Promise.all([
    memberTodayLocalDate(supabase, memberId),
    findLiveFpaExperiment(supabase, memberId),
  ]);

  const checks = row ? await listFpaExperimentChecks(supabase, row.id) : [];

  return {
    todayLocalDate,
    run: row ? toRun(row, todayLocalDate, checks) : null,
    taggableMeals: (options.taggableMeals ?? []).slice(0, MAX_TAGGABLE_MEALS),
  };
}

/**
 * The meals on her four cards right now, as one tap tags.
 *
 * A card she swaps after the page loads is still a meal she viewed on
 * this page, so a chip that outlives a swap is naming something true.
 * Nothing here is a claim that she ate it: the tag exists so that a
 * check she logs can say which meal it followed, and it is optional
 * every time.
 */
export function fpaTaggableMealsFromCards(meals: FpaMealsPayload | null): FpaTaggableMeal[] {
  if (!meals) return [];
  const out: FpaTaggableMeal[] = [];
  for (const slot of meals.slots) {
    const meal = slot.mealId ? fpaMealById(slot.mealId) : null;
    if (meal) out.push({ id: meal.id, name: meal.name, type: meal.type });
  }
  return out;
}

/** What she has kept, as one tap tags, newest first. Her own experiment screen uses these. */
export async function fpaTaggableMealsFromSaves(
  supabase: SupabaseClient,
  memberId: string
): Promise<FpaTaggableMeal[]> {
  const saves = await listFpaMealSaves(supabase, memberId);
  const out: FpaTaggableMeal[] = [];
  for (const save of saves) {
    const meal = fpaMealById(save.mealId);
    if (meal) out.push({ id: meal.id, name: meal.name, type: meal.type });
    if (out.length >= MAX_TAGGABLE_MEALS) break;
  }
  return out;
}

/**
 * The one line the Food Lens tile prints, and nothing more than that.
 *
 * A SEPARATE, SMALLER READ ON PURPOSE. The tile needs the day she is on
 * and nothing else, so it reads her run and her timezone rather than
 * dragging every check she has logged into a grid of six tiles. It is a
 * read, like everything else on that page.
 */
export async function fpaExperimentTileStatus(
  supabase: SupabaseClient,
  memberId: string
): Promise<string> {
  const [todayLocalDate, row] = await Promise.all([
    memberTodayLocalDate(supabase, memberId),
    findLiveFpaExperiment(supabase, memberId),
  ]);
  if (!row) return FPA_MY_EXPERIMENT.tileNotStarted;
  const status = fpaExperimentStatus(row.startedOn, todayLocalDate, row.archivedAt);
  if (status !== 'active') return FPA_MY_EXPERIMENT.tileComplete;
  return fpaExperimentDayLine(fpaExperimentDayNumber(row.startedOn, todayLocalDate));
}
