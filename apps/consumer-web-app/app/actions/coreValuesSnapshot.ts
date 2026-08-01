/**
 * apps/consumer-web-app/app/actions/coreValuesSnapshot.ts
 *
 * The only place a Server/Client Component reaches into Core Values
 * Snapshot. Thin wrappers around the existing Unified Adaptive Assessment
 * Runtime (lib/assessment-runtime), Lifestyle Experiments
 * (lib/lifestyle-experiments), and Member Health Narrative
 * (lib/narrative) — no parallel session/experiment/observation system.
 * Same discipline as app/actions/wbsa.ts.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import type { AccessResult } from '@/lib/assessment-registry/access';
import {
  completeSession,
  getSessionById,
  persistAnswer,
  startOrResumeSession,
  type AnswerValue,
  type AssessmentSession,
  type RuntimeEvent,
} from '@/lib/assessment-runtime';
import { getUnifiedAssessmentDefinitionByKey } from '@/lib/assessment-foundation/repository';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { findActiveItem, insertNarrativeItem, supersedeNarrativeItem } from '@/lib/narrative/data';
import {
  startLifestyleExperiment,
  listMyLifestyleExperiments,
  countActiveExperiments,
  deriveEffectiveStatus,
  markDay7Acknowledged,
  MAX_ACTIVE_EXPERIMENTS,
  type LifestyleExperiment,
} from '@/lib/lifestyle-experiments';
import { localDateFor } from './rootMap';
import { CVS_KEY, CVS_EXPERIMENT_DURATION_DAYS, AREA_LABEL, type ValueArea } from '@/lib/core-values-snapshot/constants';
import { computeCvsScoring } from '@/lib/core-values-snapshot/scoring';
import { buildCvsNarrativeDrafts } from '@/lib/core-values-snapshot/narrative';
import { buildExperimentTheoryCopy } from '@/lib/core-values-snapshot/copy';
import type { CvsScoring } from '@/lib/core-values-snapshot/types';
import {
  findCvsExperimentBySessionId,
  findLatestCvsExperiment,
  listCvsDailyLogs,
  upsertCvsDailyLog,
} from '@/lib/core-values-snapshot/dailyLogsData';
import { classifyDay7Pattern, daysSinceStart, isDay3Eligible, isDay7Eligible, type Day3Response } from '@/lib/core-values-snapshot/experiment';
import { clearRootPopupDismissal, cvsPopupMessageKey } from '@/lib/root-popup-messages/data';
import { hasStartedLscAction } from './lifeSignalCheck';

async function requireMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

export type StartOrResumeCvsResult =
  | { ok: true; session: AssessmentSession; events: RuntimeEvent[] }
  | { ok: false; reason: 'not_signed_in' | 'access_denied' | 'not_found'; access?: AccessResult };

export async function startOrResumeCvsAction(): Promise<StartOrResumeCvsResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, reason: 'not_signed_in' };

  const access = await checkAssessmentAccess(supabase, user.id, CVS_KEY);
  if (!access.allowed) return { ok: false, reason: 'access_denied', access };

  const result = await startOrResumeSession(supabase, user.id, CVS_KEY);
  if (!result) return { ok: false, reason: 'not_found' };

  return { ok: true, session: result.session, events: result.events };
}

export async function submitCvsAnswerAction(
  sessionId: string,
  questionId: string,
  value: AnswerValue
): Promise<{ ok: true; session: AssessmentSession } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  try {
    const { session } = await persistAnswer(supabase, sessionId, questionId, value);
    if (session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };
    return { ok: true, session };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save that answer.' };
  }
}

/** find-active / supersede-or-insert, self-contained here rather than reusing lib/narrative/service.ts's applyDraft (that service is tied to the AI-agent dispatch event pipeline — this mirrors its dedup discipline without depending on it). */
async function applyCvsNarrativeDraft(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  sessionId: string,
  draft: Awaited<ReturnType<typeof buildCvsNarrativeDrafts>>[number]
): Promise<void> {
  const existing = await findActiveItem(supabase, memberId, draft.category, draft.title);
  if (existing && existing.summary === draft.summary) return;

  const inserted = await insertNarrativeItem(supabase, memberId, 'system', null, draft);
  if (existing && inserted) {
    await supersedeNarrativeItem(supabase, existing.id, inserted.id);
  }
  if (!inserted) console.error('applyCvsNarrativeDraft: insertNarrativeItem failed', memberId, draft.title, sessionId);
}

export type CompleteCvsResult =
  | { ok: true; session: AssessmentSession; scoring: CvsScoring }
  | { ok: false; error: string };

/**
 * Wraps the runtime's own completeSession (validation, findings — none
 * expected here, registry publish — all unmodified) with Core Values
 * Snapshot's own side effects: "What Root Knows So Far" narrative entries
 * and a Personal Health Timeline event, both best-effort/non-throwing —
 * same discipline as completeWbsaAssessmentAction.
 */
export async function completeCvsAssessmentAction(sessionId: string): Promise<CompleteCvsResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  let session: AssessmentSession;
  try {
    const result = await completeSession(supabase, sessionId);
    session = result.session;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong finishing your snapshot.' };
  }

  if (session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };

  const scoring = computeCvsScoring(session.answers);

  try {
    const drafts = buildCvsNarrativeDrafts(sessionId, scoring);
    for (const draft of drafts) {
      await applyCvsNarrativeDraft(supabase, memberId, sessionId, draft);
    }
  } catch (err) {
    console.error('Core Values Snapshot narrative write failed', err);
  }

  try {
    const completedAt = session.completedAt ?? new Date().toISOString();
    await recordTimelineEvent(supabase, {
      memberId,
      eventType: 'assessment_published',
      localDate: completedAt.slice(0, 10),
      title: 'Completed your Core Values Snapshot',
      sourceFeature: 'unified_assessment_finding',
      sourceRecordId: sessionId,
    });
  } catch (err) {
    console.error('Core Values Snapshot timeline event failed', err);
  }

  return { ok: true, session, scoring };
}

export type StartCvsExperimentResult =
  | { ok: true; experiment: LifestyleExperiment }
  | { ok: false; error: string };

/** "I'm in — start the 7 days." Reuses lifestyle_experiments as-is (Prompt 11's real experiment lifecycle/cap/read-time-overdue machinery), with recommendation_id null and source_session_id set so this experiment traces back to the exact Core Values Snapshot completion that started it. */
export async function startCvsExperimentAction(
  sessionId: string,
  topValue: ValueArea
): Promise<StartCvsExperimentResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const session = await getSessionById(supabase, sessionId);
  if (!session || session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };

  const activeCount = await countActiveExperiments(supabase, memberId);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    return {
      ok: false,
      error: `You're already working on ${MAX_ACTIVE_EXPERIMENTS} experiments, close one out before starting another.`,
    };
  }

  const startDate = await localDateFor(supabase, memberId);
  const { theory, body } = buildExperimentTheoryCopy(computeCvsScoring(session.answers));
  const experiment = await startLifestyleExperiment(supabase, memberId, {
    recommendationId: null,
    title: AREA_LABEL[topValue],
    protocol: `${theory} ${body}`,
    startDate,
    durationDays: CVS_EXPERIMENT_DURATION_DAYS,
    sourceSessionId: sessionId,
    sourceExperienceKey: 'core-values-snapshot',
  });
  if (!experiment) return { ok: false, error: 'Could not start this experiment.' };

  return { ok: true, experiment };
}

export type CvsOffer = { sessionId: string; scoring: CvsScoring };

/**
 * The member's most recently completed Core Values Snapshot session, only
 * when they have never started (or no longer have) an experiment tied to
 * it — mirrors Life Signal Check's own getMyLscOfferAction. Used by the
 * dashboard card (CvsCheckinCard.tsx) to give a member who was blocked by
 * the active-experiment cap, or who simply declined at the time, a real
 * way to start the Weekly Experiment later.
 */
export async function getMyCvsOfferAction(): Promise<CvsOffer | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, CVS_KEY);
  if (!definition) return null;

  const { data } = await supabase
    .from('unified_assessment_sessions')
    .select('id')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definition.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const session = await getSessionById(supabase, data.id as string);
  if (!session) return null;

  return { sessionId: session.id, scoring: computeCvsScoring(session.answers) };
}

export type CvsExperimentStatus = {
  experiment: LifestyleExperiment;
  todayLocalDate: string;
  daysSinceStart: number;
  isDay3Eligible: boolean;
  isDay7Eligible: boolean;
  logs: Awaited<ReturnType<typeof listCvsDailyLogs>>;
  todayCompleted: boolean | null;
};

/** The signed-in member's current Weekly Experiment (most recent Core Values Snapshot-sourced one), if any, plus enough real stored data to render the daily prompt and day-3/day-7 follow-ups honestly. */
export async function getMyCvsExperimentStatusAction(): Promise<CvsExperimentStatus | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const latest = await findLatestCvsExperiment(supabase, memberId);
  if (!latest) return null;

  const experiments = await listMyLifestyleExperiments(supabase, memberId);
  const now = new Date();
  const experiment = experiments
    .map((e) => ({ ...e, status: deriveEffectiveStatus(e, now) }))
    .find((e) => e.id === latest.id);
  if (!experiment) return null;

  const todayLocalDate = await localDateFor(supabase, memberId);
  const logs = await listCvsDailyLogs(supabase, experiment.id);
  const todayRow = logs.find((l) => l.localDate === todayLocalDate);

  return {
    experiment,
    todayLocalDate,
    daysSinceStart: daysSinceStart(experiment.startDate, todayLocalDate),
    isDay3Eligible: isDay3Eligible(experiment.startDate, todayLocalDate),
    isDay7Eligible: isDay7Eligible(experiment.startDate, todayLocalDate),
    logs,
    todayCompleted: todayRow?.completed ?? null,
  };
}

export async function logCvsExperimentDayAction(
  experimentId: string,
  completed: boolean
): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, memberId);
  const ok = await upsertCvsDailyLog(supabase, memberId, experimentId, localDate, { completed });
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function submitCvsDay3ResponseAction(
  experimentId: string,
  response: Day3Response
): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, memberId);
  const ok = await upsertCvsDailyLog(supabase, memberId, experimentId, localDate, { day3Response: response });
  if (ok) await clearRootPopupDismissal(supabase, memberId, cvsPopupMessageKey('day3', experimentId));
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function acknowledgeCvsDay7Action(experimentId: string): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const ok = await markDay7Acknowledged(supabase, memberId, experimentId);
  if (ok) await clearRootPopupDismissal(supabase, memberId, cvsPopupMessageKey('day7', experimentId));
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

// --- Coach visibility -------------------------------------------------

export type CvsCoachSummary = {
  sessionId: string;
  completedAt: string;
  assessmentVersion: number;
  topValueLabel: string;
  runnerUpValueLabel: string;
  branch: CvsScoring['branch'];
  gapClassification: CvsScoring['gapClassification'];
};

export async function getClientCvsSessionsAction(clientId: string): Promise<CvsCoachSummary[]> {
  const supabase = createClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, CVS_KEY);
  if (!definition) return [];

  const { data: rows, error } = await supabase
    .from('unified_assessment_sessions')
    .select('id, completed_at, assessment_version')
    .eq('member_id', clientId)
    .eq('assessment_definition_id', definition.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (error || !rows || rows.length === 0) return [];

  const summaries: CvsCoachSummary[] = [];
  for (const row of rows as { id: string; completed_at: string; assessment_version: number }[]) {
    const session = await getSessionById(supabase, row.id);
    if (!session) continue;
    const scoring = computeCvsScoring(session.answers);

    summaries.push({
      sessionId: row.id,
      completedAt: row.completed_at,
      assessmentVersion: row.assessment_version,
      topValueLabel: AREA_LABEL[scoring.topValue],
      runnerUpValueLabel: AREA_LABEL[scoring.runnerUpValue],
      branch: scoring.branch,
      gapClassification: scoring.gapClassification,
    });
  }

  return summaries;
}

export type CvsCoachSessionDetail = {
  session: AssessmentSession;
  scoring: CvsScoring;
  guiltAnswerVerbatim: string | null;
  timeToCompleteMinutes: number | null;
  experiment: (LifestyleExperiment & { logs: Awaited<ReturnType<typeof listCvsDailyLogs>> }) | null;
  /** Whether this member has started (or completed) the Life Signal Check, checked for real via hasStartedLscAction. */
  continuedToExperience2: boolean;
};

export async function getClientCvsSessionDetailAction(sessionId: string): Promise<CvsCoachSessionDetail | null> {
  const supabase = createClient();
  const session = await getSessionById(supabase, sessionId);
  if (!session) return null;

  const scoring = computeCvsScoring(session.answers);
  const q3Answer = session.answers['cvs_q3'];
  const q3Question = session.visibleQuestions.find((q) => q.question_key === 'cvs_q3');
  const q3Options = Array.isArray(q3Question?.answer_options)
    ? (q3Question!.answer_options as { value: string; label: string }[])
    : [];
  const guiltAnswerVerbatim =
    typeof q3Answer === 'string' ? (q3Options.find((o) => o.value === q3Answer)?.label ?? null) : null;

  const timeToCompleteMinutes =
    session.completedAt
      ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)
      : null;

  let experiment: CvsCoachSessionDetail['experiment'] = null;
  const linkedExperiment = await findCvsExperimentBySessionId(supabase, sessionId);
  if (linkedExperiment) {
    const experiments = await listMyLifestyleExperiments(supabase, session.memberId);
    const now = new Date();
    const found = experiments.map((e) => ({ ...e, status: deriveEffectiveStatus(e, now) })).find((e) => e.id === linkedExperiment.id);
    if (found) {
      const logs = await listCvsDailyLogs(supabase, found.id);
      experiment = { ...found, logs };
    }
  }

  const continuedToExperience2 = await hasStartedLscAction(session.memberId);

  return {
    session,
    scoring,
    guiltAnswerVerbatim,
    timeToCompleteMinutes,
    experiment,
    continuedToExperience2,
  };
}

export { classifyDay7Pattern };
