/**
 * THE ONE READ PER FACT, FOR HOME.
 *
 * Home is now drawn in several Suspense boundaries instead of one blocking
 * render, which is what lets her greeting arrive in the first response. The
 * price of that, if nobody pays attention, is that boundaries which used to
 * share one `Promise.all` each go and fetch for themselves: her body
 * assessments were read by Quick Actions, by Your Path and by the
 * first-check-in transition, and that would have been three reads of one
 * list where the old page made one.
 *
 * So every fact more than one region on Home wants is stated here, once,
 * request-memoized (React's `cache`, the same mechanism
 * `lib/supabase/currentUser.ts` uses for the signed-in user). A region
 * calls these rather than the underlying action, and five regions asking
 * the same question cost one answer between them.
 *
 * WHY WRAPPERS AND NOT MEMOIZED ACTIONS. Each of these is a `'use server'`
 * module, which may only export async functions, so the memoized form
 * cannot live beside the action itself. Wrapping here also keeps the memo
 * scoped to this screen: nothing else in the app changes behaviour because
 * Home wanted to read something twice.
 *
 * NOTHING HERE OUTLIVES THE REQUEST. It is a deduplicated read, not a
 * cache: a different member's request gets its own, and tomorrow cannot see
 * today's. The one thing in here that writes (`getMyRootScore` calculates
 * and stores today's snapshot the first time it is asked for) is the writer
 * itself, so sharing its answer is sharing what it just wrote.
 */
import { requestCache } from '@/lib/reactRequestCache';
import { getMyAssessmentsAction } from '@/app/actions/body-assessment';
import {
  getMyBodyAssessmentAssignmentCard,
  getMyQuestionnaireCatalog,
} from '@/app/actions/questionnaireCatalog';
import { getMyCurrentProgramEntryAction } from '@/app/actions/coach-programs';
import { getMyLifestyleExperiments } from '@/app/actions/lifestyleExperiments';
import { getMyBaselineAssessment } from '@/app/actions/onboarding';
import { getMyWearableConnections } from '@/app/actions/wearables';
import { getMyRootScore } from '@/app/actions/scoring';
import { getMyCoachingDecision } from '@/app/actions/coaching-brain';
import { getMyMorningBrief } from '@/app/actions/coaching-engine';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import { getRequestClient } from '@/lib/supabase/server';
import { requireHomeFrame } from './frame';

/** Her posture and movement assessments, newest first. Quick Actions, Your Path and the first-check-in transition all read this. */
export const homeBodyAssessments = requestCache(() => getMyAssessmentsAction());

/** The questionnaire catalog. The invites read it, Your Path reads its counts. */
export const homeQuestionnaireCatalog = requestCache(() => getMyQuestionnaireCatalog());

/** A pending Body Assessment assignment, which the catalog deliberately excludes. */
export const homeBodyAssessmentAssignment = requestCache(() =>
  getMyBodyAssessmentAssignmentCard()
);

/** Her current program entry. The hero reads it, and the Movement panel reads it again to decide whether it is the screen's second card or its first. */
export const homeCurrentProgram = requestCache(() => getMyCurrentProgramEntryAction());

/** Her Weekly Experiments. Two regions ask whether one is active. */
export const homeLifestyleExperiments = requestCache(() => getMyLifestyleExperiments());

/** Her Baseline Assessment. */
export const homeBaselineAssessment = requestCache(() => getMyBaselineAssessment());

/** Her connected devices. */
export const homeWearableConnections = requestCache(() => getMyWearableConnections());

/** Today's Root Score snapshot. The hero draws the number; the Daily Brief card draws the same snapshot beside its text. */
export const homeRootScore = requestCache(async () => {
  const frame = await requireHomeFrame();
  return getMyRootScore(frame.localDate, frame.timezone);
});

/** The Coaching Brain's decision for today. */
export const homeCoachingDecision = requestCache(async () => {
  const frame = await requireHomeFrame();
  return getMyCoachingDecision(frame.timezone);
});

/** Root's daily brief. */
export const homeMorningBrief = requestCache(async () => {
  const frame = await requireHomeFrame();
  return getMyMorningBrief(frame.timezone);
});

/**
 * Whether the Body Assessment route is open to her.
 *
 * Coach-Assign-Only Gating (2026-08-04): Body Assessment is
 * requiresAssignment, so a free member with no history and no pending
 * assignment sees the Movement card locked rather than an open invite.
 * `checkAssessmentAccess` already lets through anyone with real history or
 * a pending assignment, so it never hides her own progress.
 */
export const homeBodyAssessmentAccess = requestCache(async () => {
  const frame = await requireHomeFrame();
  return checkAssessmentAccess(getRequestClient(), frame.memberId, 'body-assessment');
});
