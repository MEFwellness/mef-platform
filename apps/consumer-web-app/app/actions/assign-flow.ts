/**
 * The unified assign flow's read side: everything a coach needs to see
 * about one member before deciding what to give her.
 *
 * REUSE, NOT A SECOND OVERVIEW. The posture findings, the detected
 * corrective patterns and the drafts already waiting for review all come
 * from getMemberCorrectiveOverviewAction, unchanged. This adds the three
 * things the corrective screen never needed and the assign screen does:
 * what she said she wanted, how ready she has been saying she is, and what
 * she is already on. Nothing here re-derives anything that action already
 * answers.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import {
  getMemberCorrectiveOverviewAction,
  type MemberCorrectiveOverview,
} from './corrective-programs';
import { getClientProgramAssignmentSummariesAction } from './coach-programs';
import { readCheckins, readGoals } from '@/lib/coach-member-entries/data';
import type { ProgramAssignmentSummary } from '@mef/shared-types-contracts';

export interface AssignFlowGoal {
  /** Newest first. The table is insert-only, so an older row is what she used to say. */
  statedOn: string;
  primaryGoal: string | null;
  goals: string[];
}

export interface AssignFlowReadiness {
  /** Her most recent daily check-in that answered anything about readiness. */
  localDate: string;
  answers: { question: string; answer: string }[];
}

export interface AssignFlowOverview extends MemberCorrectiveOverview {
  goals: AssignFlowGoal[];
  readiness: AssignFlowReadiness | null;
  /** Current and recent programs, newest first. */
  programs: ProgramAssignmentSummary[];
}

const RECENT_CHECKIN_DAYS = 30;

/** YYYY-MM-DD, `days` before today, in UTC. The read is a range and the range is generous; a day either side of a timezone boundary changes nothing about which check-in is the most recent one. */
function isoDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * One read for the member overview step. Everything is best effort: a
 * member with no goals, no check-ins and no programs is a real member on
 * her first day, and the screen shows an empty section rather than an
 * error.
 */
export async function getAssignFlowOverviewAction(
  memberId: string
): Promise<AssignFlowOverview | null> {
  const corrective = await getMemberCorrectiveOverviewAction(memberId);
  if (!corrective) return null;

  const supabase = createClient();
  const [goalsResult, checkinsResult, programs] = await Promise.all([
    readGoals(supabase, memberId),
    readCheckins(supabase, memberId, isoDaysAgo(RECENT_CHECKIN_DAYS), isoDaysAgo(0)),
    getClientProgramAssignmentSummariesAction(memberId),
  ]);

  const goals: AssignFlowGoal[] = goalsResult.available
    ? goalsResult.items.slice(0, 2).map((entry) => ({
        statedOn: entry.createdAt,
        primaryGoal: entry.primaryGoal,
        goals: entry.goals,
      }))
    : [];

  const latestWithReadiness = checkinsResult.available
    ? checkinsResult.items.find((entry) => entry.readiness.some((a) => a.answer !== null))
    : undefined;

  const readiness: AssignFlowReadiness | null = latestWithReadiness
    ? {
        localDate: latestWithReadiness.localDate,
        answers: latestWithReadiness.readiness
          .filter((answer) => answer.answer !== null)
          .map((answer) => ({ question: answer.question, answer: answer.answer! })),
      }
    : null;

  return { ...corrective, goals, readiness, programs };
}
