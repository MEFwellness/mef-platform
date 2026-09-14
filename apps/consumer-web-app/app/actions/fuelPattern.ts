/**
 * apps/consumer-web-app/app/actions/fuelPattern.ts
 *
 * The only place a Server or Client Component reaches into the Rooted
 * Reset Fuel Pattern Assessment. Thin wrappers around the existing
 * Unified Adaptive Assessment Runtime (lib/assessment-runtime) plus this
 * instrument's own scoring and results row. Nothing here re-implements a
 * session, an answer store or a gate, and nothing here extends the Primal
 * Pattern engine, which this instrument replaces rather than builds on.
 *
 * Mirrors app/actions/readinessPulse.ts's own shape: begin and retake are
 * buttons, the take route only reads, and completion is idempotent.
 */

'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { localDateStringFor } from '@/lib/time/localDate';
import { memberTimezone } from '@/lib/time/memberToday';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import {
  beginRuntimeAssessment,
  loadRuntimeTakeSession,
  type RuntimePhase,
} from '@/lib/assessment-runtime/entry';
import {
  completeSession,
  persistAnswer,
  type AnswerValue,
  type AssessmentSession,
} from '@/lib/assessment-runtime';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { FPA_KEY, FPA_LABEL, FPA_ROUTE, FPA_TAKE_ROUTE } from '@/lib/fuel-pattern/constants';
import { allFpaQuestionsAnswered, computeFpaScoring } from '@/lib/fuel-pattern/scoring';
import { saveFuelPatternResult, findFuelPatternResultBySession } from '@/lib/fuel-pattern/data';
import { buildFpaMemberResult, type FpaMemberResult } from '@/lib/fuel-pattern/memberResult';
import {
  buildFpaMealsPayload,
  type FpaMealsPayload,
} from '@/lib/fuel-pattern/meals/memberPayload';
import {
  buildFpaExperimentPayload,
  fpaTaggableMealsFromCards,
  type FpaExperimentPayload,
} from '@/lib/fuel-pattern/experiment/memberPayload';
import { archiveFpaExperimentsFromOtherSittings } from '@/lib/fuel-pattern/experiment/data';

const FPA_ROUTES = {
  overview: FPA_ROUTE,
  take: FPA_TAKE_ROUTE,
  results: (sessionId: string) => `${FPA_ROUTE}/results/${sessionId}`,
};

async function requireMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/**
 * The Start / Resume button. A Server Action, never a render, because a
 * render must not insert a row. See lib/assessment-runtime/entry.ts.
 */
export async function beginFpaAction(): Promise<void> {
  const result = await beginRuntimeAssessment(FPA_KEY, FPA_ROUTES);
  redirect(result.ok ? result.takeHref : result.redirectTo);
}

/** Take it again. Only ever reached by pressing the labelled retake button on the overview screen. */
export async function retakeFpaAction(): Promise<void> {
  const result = await beginRuntimeAssessment(FPA_KEY, FPA_ROUTES, { startRetake: true });
  redirect(result.ok ? result.takeHref : result.redirectTo);
}

/**
 * What the take page reads. Resumes a real draft, keeps a member who just
 * finished on her reveal, sends a member returning to a finished sitting
 * to her results, and writes nothing in any of those cases.
 *
 * `hasInFlowClosing: true` because this instrument ends inside its own
 * taker, on the short reveal, not on its results screen.
 */
export async function loadFpaTakeSessionAction(): Promise<
  { ok: true; phase: RuntimePhase; session: AssessmentSession } | { ok: false; redirectTo: string }
> {
  const result = await loadRuntimeTakeSession(FPA_KEY, FPA_ROUTES, { hasInFlowClosing: true });
  return result.ok
    ? { ok: true, phase: result.phase, session: result.session }
    : { ok: false, redirectTo: result.redirectTo };
}

/**
 * THE GATE, ON THE WRITE PATH TOO. 'view', not 'start': a member who
 * legitimately began must always be able to finish, and whether she may
 * BEGIN is decided on the begin path.
 */
async function mayWriteFpa(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<boolean> {
  const access = await checkAssessmentAccess(supabase, memberId, FPA_KEY, { intent: 'view' });
  return access.allowed;
}

export async function submitFpaAnswerAction(
  sessionId: string,
  questionId: string,
  value: AnswerValue
): Promise<{ ok: true } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await mayWriteFpa(supabase, memberId))) {
    return { ok: false, error: 'This is not open for you right now.' };
  }

  try {
    const { session } = await persistAnswer(supabase, sessionId, questionId, value);
    if (session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save that answer.' };
  }
}

/**
 * What the reveal and the results screen both read, and the ONLY thing
 * either of them is handed. The three raw scores, the confidence level,
 * every stored tendency, the digestive discomfort flag and her vitality
 * answer are the coach's, and they are fenced out by construction: the
 * payload is built by lib/fuel-pattern/memberResult.ts, which has two
 * fields and no way to grow a third by accident.
 *
 * IT IS COMPLETE BEFORE HER SCREEN MOUNTS. The result experience makes no
 * request of its own once it is on the screen, which is what lets the
 * reveal hold instead of being replaced by something arriving late.
 */
export type CompleteFpaResult =
  | {
      ok: true;
      reveal: FpaMemberResult;
      meals: FpaMealsPayload;
      experiment: FpaExperimentPayload;
    }
  | { ok: false; error: string };

export async function completeFpaAssessmentAction(sessionId: string): Promise<CompleteFpaResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await mayWriteFpa(supabase, memberId))) {
    return { ok: false, error: 'This is not open for you right now.' };
  }

  let session: AssessmentSession;
  try {
    const result = await completeSession(supabase, sessionId);
    session = result.session;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Something went wrong finishing this assessment.',
    };
  }

  if (session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };
  if (!allFpaQuestionsAnswered(session.answers)) {
    return { ok: false, error: 'Not every question was answered yet.' };
  }

  const scoring = computeFpaScoring(session.answers);

  /*
    HER READING IS STORED, AND THE STORED ONE IS WHAT SHE IS SHOWN. A
    second call inside the same second (a Server Action re-renders the
    route it was called from) finds the row already there and hands it
    back rather than writing a second one. If the write genuinely fails
    she is still shown the reading that was just computed, because a
    storage problem is not a reason to leave a member who answered
    twenty four questions staring at an error.
  */
  const stored = await saveFuelPatternResult(supabase, memberId, sessionId, scoring);

  try {
    const completedAt = session.completedAt ?? new Date().toISOString();
    await recordTimelineEvent(supabase, {
      memberId,
      eventType: 'assessment_published',
      localDate: localDateStringFor(completedAt, await memberTimezone(supabase, memberId)),
      title: `Completed your ${FPA_LABEL}`,
      sourceFeature: 'unified_assessment_finding',
      sourceRecordId: sessionId,
    });
  } catch (err) {
    console.error('Fuel Pattern timeline event failed', err);
  }

  /*
    HER OBSERVATIONS COME FROM THE ANSWERS AS THEY WERE STORED, not from
    the scoring object in hand, whenever the row was written: the two are
    the same today, and reading the row is what keeps them the same on
    every later visit to this sitting.
  */
  const reading = stored ?? { pattern: scoring.pattern, responses: scoring.responses };

  /*
    THE RETAKE RULE, AND THE ONLY WRITE THIS FEATURE MAKES OUTSIDE ITS OWN
    ROUTE HANDLER.

    A run of the 7 Day Fuel Experiment belongs to the sitting she started
    it from, and a sitting she has just FINISHED supersedes it: the
    hypothesis it was testing is no longer the one she holds. So the run
    is archived, with every check inside it kept and still visible to her
    coach, and the result page she is about to meet offers a fresh start.

    It is here rather than on the retake BUTTON because a retake she
    abandons half way through should not cost her a live experiment, and
    it is keyed on the session rather than on a time so that a second call
    inside the same second, which a Server Action re-render makes
    ordinary, finds nothing left to archive. A first sitting archives
    nothing, because there is nothing to archive.

    This is a Server Action behind the last button of a sitting, not a
    render. A render never decides anything.
  */
  await archiveFpaExperimentsFromOtherSittings(supabase, memberId, sessionId);

  const meals = await buildFpaMealsPayload(supabase, memberId, reading.pattern);

  return {
    ok: true,
    reveal: buildFpaMemberResult(reading),
    /*
      HER MEALS AND HER EXPERIMENT COME BACK WITH HER READING, in the same
      response, for the same reason everything else on that screen does:
      the reveal holds only while nothing on it is waiting on something
      that could arrive late and replace it. Building both payloads is a
      read.
    */
    meals,
    experiment: await buildFpaExperimentPayload(supabase, memberId, {
      taggableMeals: fpaTaggableMealsFromCards(meals),
    }),
  };
}

/**
 * The stored reading for one finished sitting, member facing half only,
 * with her meals alongside it. Returns null when the sitting is not hers
 * or has no stored row.
 */
export async function getMyFpaRevealAction(sessionId: string): Promise<{
  reveal: FpaMemberResult;
  meals: FpaMealsPayload;
  experiment: FpaExperimentPayload;
} | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;
  const supabase = createClient();
  const row = await findFuelPatternResultBySession(supabase, sessionId);
  if (!row || row.memberId !== memberId) return null;
  const meals = await buildFpaMealsPayload(supabase, memberId, row.pattern);
  return {
    reveal: buildFpaMemberResult(row),
    meals,
    // A READ, EVEN HERE. This is the one request the reveal ever makes,
    // and it must not start, acknowledge or archive anything: a member
    // who reloads on her result page has decided nothing by reloading.
    experiment: await buildFpaExperimentPayload(supabase, memberId, {
      taggableMeals: fpaTaggableMealsFromCards(meals),
    }),
  };
}
