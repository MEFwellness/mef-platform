/**
 * The facts about one member that a program explanation is allowed to be
 * built from, read once, in one place.
 *
 * THE POINT OF THIS FILE IS THE LIST ITSELF. An explanation composed from
 * "whatever the screen happened to have loaded" is an explanation that says
 * something different depending on which door the coach came in through.
 * These four things, and nothing else, are what
 * lib/programs/explain/programExplanation.ts may draw on:
 *
 *   her first name          from her profile, so the paragraph is addressed
 *                           to a person
 *   what she said she wants her own words, from member_goal_selections
 *   where the work goes     her latest posture assessment's findings,
 *                           translated to body areas by ./bodyAreas.ts and
 *                           never carrying a finding name or a severity
 *   nothing else            no check-in scores, no correlations, no
 *                           coach notes, no internal notes
 *
 * Everything else the paragraph mentions (how long the program is, how
 * often, what equipment) is a property of the PROGRAM, not of her, and
 * comes from the plan the coach is looking at.
 *
 * EVERY READ IS BEST EFFORT. A member with no goals and no assessment is a
 * real member on her first day. She gets a shorter paragraph, not an error
 * and not a hedge.
 *
 * This runs under the CALLER's session. A coach reads her client's rows
 * because RLS lets a coach read her client's rows; this function does not
 * grant anything and does not check anything a policy already decides.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getLatestCompletedPostureAssessment } from '../../corrective-engine/findings';
import { readGoals } from '../../coach-member-entries/data';
import { bodyAreasFromFindings } from './bodyAreas';

export interface MemberExplanationFacts {
  firstName: string | null;
  primaryGoal: string | null;
  goals: string[];
  bodyAreas: string[];
}

export const EMPTY_MEMBER_FACTS: MemberExplanationFacts = {
  firstName: null,
  primaryGoal: null,
  goals: [],
  bodyAreas: [],
};

export async function loadMemberExplanationFacts(
  supabase: SupabaseClient,
  memberId: string
): Promise<MemberExplanationFacts> {
  const [profileResult, goalsResult, assessment] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', memberId).maybeSingle(),
    readGoals(supabase, memberId).catch(() => null),
    getLatestCompletedPostureAssessment(supabase, memberId).catch(() => null),
  ]);

  const displayName = (profileResult.data?.display_name as string | null | undefined) ?? null;
  const firstName = displayName ? (displayName.trim().split(/\s+/)[0] ?? null) : null;

  const latestGoals = goalsResult?.available ? (goalsResult.items[0] ?? null) : null;

  return {
    firstName,
    primaryGoal: latestGoals?.primaryGoal ?? null,
    // Her stated goals minus the one already named as most important, so
    // the sentence does not say the same thing twice.
    goals: (latestGoals?.goals ?? []).filter((goal) => goal !== latestGoals?.primaryGoal),
    bodyAreas: bodyAreasFromFindings(assessment?.findings ?? []),
  };
}
