'use server';

/**
 * The Rooted Reset Fuel Pattern Assessment's COACH side.
 *
 * =====================================================================
 * WHY THIS IS A SEPARATE FILE FROM app/actions/fuelPattern.ts.
 * =====================================================================
 *
 * Everything below reaches lib/fuel-pattern/coachView.ts, which reaches
 * lib/fuel-pattern/coachCopy.ts, where the confidence levels, the
 * tendency wording and the digestive discomfort note live. None of those
 * may reach a member surface. Her taker imports the submit action, so
 * anything in ITS module is on her import graph, and one combined module
 * would put the coach vocabulary two hops from her screen. The split is
 * the fence, and tests/fuel-pattern-member-payload.test.ts is what keeps
 * it standing. This is the same split the Breathing Pattern Check-In
 * made for the same reason.
 *
 * READ ONLY, AND NOTHING HERE RUNS ON A RENDER OF A MEMBER SCREEN. The
 * one function below is called because a coach opened his own client
 * page. It inserts nothing, claims nothing and schedules nothing.
 *
 * TEST ACCOUNTS NEVER REACH A STAFF SURFACE, and that is enforced in the
 * data layer through lib/staff/testAccounts.ts rather than by this screen
 * remembering. isMemberVisibleToStaff is scoped to "not on your
 * caseload", so a coach genuinely assigned to a test member (the paired
 * coaching loop) keeps seeing her panel.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { hasActiveRole } from '@/lib/auth/guards';
import { isMemberVisibleToStaff } from '@/lib/staff/testAccounts';
import { listFuelPatternResults } from '@/lib/fuel-pattern/data';
import { buildFpaCoachReading, type FpaCoachReading } from '@/lib/fuel-pattern/coachView';
import {
  listFpaMealExclusions,
  listFpaMealRejections,
  listFpaMealSaves,
} from '@/lib/fuel-pattern/meals/data';
import {
  buildFpaCoachMealReading,
  type FpaCoachMealReading,
} from '@/lib/fuel-pattern/meals/coachView';
import { listCompletedPrimalPatternAssessments } from '@/lib/primal-pattern/store';
import { PRIMAL_PATTERN_QUESTIONNAIRE_ID } from '@/lib/primal-pattern/questionnaire';
import type { PrimalPatternResult } from '@/lib/primal-pattern/types';

export type CoachFpaSitting = {
  /** The result row's own id. */
  id: string;
  /** The runtime session this reading belongs to. */
  sessionId: string;
  /**
   * When the reading was written, which is when she finished: the row is
   * inserted in the same request that completes the sitting.
   */
  completedAt: string;
  reading: FpaCoachReading;
};

/**
 * One historical Primal Pattern sitting, exactly as it was stored.
 *
 * PRIMAL PATTERN IS RETIRED AND ITS DATA IS UNTOUCHED. These rows are
 * read and printed, never rewritten, never re-scored and never mapped
 * onto a fuel pattern: the two instruments asked different questions and
 * pretending one translates into the other would invent a reading she was
 * never given. They sit at the foot of the same card so that a coach
 * looking at her nutrition history sees one history rather than having to
 * remember there used to be another questionnaire.
 */
export type CoachPrimalSitting = {
  id: string;
  completedAt: string;
  result: PrimalPatternResult;
  label: string;
};

export type CoachFuelPatternPanelState = {
  memberId: string | null;
  /** Every finished Fuel Pattern sitting, newest first. */
  sittings: CoachFpaSitting[];
  /** Every finished Primal Pattern sitting, newest first. Read only. */
  primalSittings: CoachPrimalSitting[];
  /**
   * What she has told her meal cards she does not eat, what she rejected
   * and what she kept.
   *
   * NOT PER SITTING, ON PURPOSE. A sitting is a reading taken on a day. A
   * standing preference is a fact about her that outlives every retake,
   * so it is read once for the member rather than attached to whichever
   * sitting happened to be on the screen when she recorded it.
   */
  meals: FpaCoachMealReading;
};

const EMPTY_MEALS: FpaCoachMealReading = {
  preferences: [],
  rejections: [],
  savedCount: 0,
  saved: [],
};

const EMPTY_PANEL: CoachFuelPatternPanelState = {
  memberId: null,
  sittings: [],
  primalSittings: [],
  meals: EMPTY_MEALS,
};

/** The three Primal Pattern outcomes, in the words that questionnaire used. */
const PRIMAL_RESULT_LABEL: Record<PrimalPatternResult, string> = {
  polar: 'Polar Diet Type',
  variable: 'Variable Diet Type',
  equatorial: 'Equatorial Diet Type',
};

export async function getClientFuelPatternPanelAction(
  clientId: string
): Promise<CoachFuelPatternPanelState> {
  const user = await getCachedUser();
  if (!user) return EMPTY_PANEL;
  const supabase = createClient();

  if (!(await isCoachOrAdmin(supabase, user.id))) return EMPTY_PANEL;
  if (!(await isMemberVisibleToStaff(supabase, clientId, user.id))) return EMPTY_PANEL;

  const [rows, primal, exclusions, rejections, saves] = await Promise.all([
    listFuelPatternResults(supabase, clientId),
    listCompletedPrimalPatternAssessments(supabase, clientId, PRIMAL_PATTERN_QUESTIONNAIRE_ID),
    listFpaMealExclusions(supabase, clientId),
    listFpaMealRejections(supabase, clientId),
    listFpaMealSaves(supabase, clientId),
  ]);

  return {
    memberId: clientId,
    sittings: rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      completedAt: row.createdAt,
      reading: buildFpaCoachReading(row),
    })),
    // listCompletedPrimalPatternAssessments returns oldest first, and every
    // list on this card reads newest first.
    primalSittings: [...primal].reverse().map((row) => ({
      id: row.id,
      completedAt: row.completedAt,
      result: row.result,
      label: PRIMAL_RESULT_LABEL[row.result],
    })),
    meals: buildFpaCoachMealReading({ exclusions, rejections, saves }),
  };
}

async function isCoachOrAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  return (
    (await hasActiveRole(supabase, userId, 'coach')) ||
    (await hasActiveRole(supabase, userId, 'platform_administrator'))
  );
}
