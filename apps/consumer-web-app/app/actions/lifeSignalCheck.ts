/**
 * apps/consumer-web-app/app/actions/lifeSignalCheck.ts
 *
 * The only place a Server/Client Component reaches into Life Signal
 * Check. Thin wrappers around the existing Unified Adaptive Assessment
 * Runtime (lib/assessment-runtime), Lifestyle Experiments
 * (lib/lifestyle-experiments), and Member Health Narrative (lib/narrative)
 * — no parallel session/experiment/observation system. Mirrors
 * app/actions/coreValuesSnapshot.ts's own shape exactly.
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
import { LSC_KEY, LSC_EXPERIMENT_DURATION_DAYS, SIGNAL_LABEL, type Signal } from '@/lib/life-signal-check/constants';
import { computeLscScoring } from '@/lib/life-signal-check/scoring';
import { buildLscNarrativeDrafts } from '@/lib/life-signal-check/narrative';
import { buildLscExperimentTheoryCopy } from '@/lib/life-signal-check/copy';
import type { LscScoring } from '@/lib/life-signal-check/types';
import {
  findLatestLscExperiment,
  findLscExperimentBySessionId,
  listLscDailyLogs,
  upsertLscDailyLog,
} from '@/lib/life-signal-check/dailyLogsData';
import { classifyDay7Pattern, daysSinceStart, isDay3Eligible, isDay7Eligible, type Day3Response } from '@/lib/core-values-snapshot/experiment';
import { clearRootPopupDismissal, lscPopupMessageKey } from '@/lib/root-popup-messages/data';
import { CVS_KEY } from '@/lib/core-values-snapshot/constants';
import { computeCvsScoring } from '@/lib/core-values-snapshot/scoring';
import type { CvsContextForEcho } from '@/lib/life-signal-check/types';

async function requireMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/** The member's most recently completed Core Values Snapshot, if any — needed only to evaluate the Body-Value Echo adjacency condition. Almost always present in practice (Life Signal Check unlocks only after Core Values Snapshot completes), but this degrades gracefully (Echo simply never fires) rather than throwing if it's ever missing. */
async function getLatestCvsContextForEcho(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<CvsContextForEcho | null> {
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

  const scoring = computeCvsScoring(session.answers);
  return { topValue: scoring.topValue, branch: scoring.branch };
}

/** Exported, no-argument wrapper around getLatestCvsContextForEcho, for callers (the results page) outside this file that need the same Body-Value Echo context without themselves passing a raw SupabaseClient across a 'use server' boundary. */
export async function getMyLatestCvsContextForEchoAction() {
  const memberId = await requireMemberId();
  if (!memberId) return null;
  const supabase = createClient();
  return getLatestCvsContextForEcho(supabase, memberId);
}

export type StartOrResumeLscResult =
  | { ok: true; session: AssessmentSession; events: RuntimeEvent[] }
  | { ok: false; reason: 'not_signed_in' | 'access_denied' | 'not_found'; access?: AccessResult };

export async function startOrResumeLscAction(): Promise<StartOrResumeLscResult> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, reason: 'not_signed_in' };

  const access = await checkAssessmentAccess(supabase, user.id, LSC_KEY);
  if (!access.allowed) return { ok: false, reason: 'access_denied', access };

  const result = await startOrResumeSession(supabase, user.id, LSC_KEY);
  if (!result) return { ok: false, reason: 'not_found' };

  return { ok: true, session: result.session, events: result.events };
}

export async function submitLscAnswerAction(
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

async function applyLscNarrativeDraft(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  sessionId: string,
  draft: Awaited<ReturnType<typeof buildLscNarrativeDrafts>>[number]
): Promise<void> {
  const existing = await findActiveItem(supabase, memberId, draft.category, draft.title);
  if (existing && existing.summary === draft.summary) return;

  const inserted = await insertNarrativeItem(supabase, memberId, 'system', null, draft);
  if (existing && inserted) {
    await supersedeNarrativeItem(supabase, existing.id, inserted.id);
  }
  if (!inserted) console.error('applyLscNarrativeDraft: insertNarrativeItem failed', memberId, draft.title, sessionId);
}

export type CompleteLscResult =
  | { ok: true; session: AssessmentSession; scoring: LscScoring }
  | { ok: false; error: string };

export async function completeLscAssessmentAction(sessionId: string): Promise<CompleteLscResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  let session: AssessmentSession;
  try {
    const result = await completeSession(supabase, sessionId);
    session = result.session;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong finishing your check.' };
  }

  if (session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };

  const cvsContext = await getLatestCvsContextForEcho(supabase, memberId);
  const scoring = computeLscScoring(session.answers, cvsContext);

  try {
    const drafts = buildLscNarrativeDrafts(sessionId, scoring);
    for (const draft of drafts) {
      await applyLscNarrativeDraft(supabase, memberId, sessionId, draft);
    }
  } catch (err) {
    console.error('Life Signal Check narrative write failed', err);
  }

  try {
    const completedAt = session.completedAt ?? new Date().toISOString();
    await recordTimelineEvent(supabase, {
      memberId,
      eventType: 'assessment_published',
      localDate: completedAt.slice(0, 10),
      title: 'Completed your Life Signal Check',
      sourceFeature: 'unified_assessment_finding',
      sourceRecordId: sessionId,
    });
  } catch (err) {
    console.error('Life Signal Check timeline event failed', err);
  }

  return { ok: true, session, scoring };
}

export type StartLscExperimentResult =
  | { ok: true; experiment: LifestyleExperiment }
  | { ok: false; error: string };

export async function startLscExperimentAction(sessionId: string, signal: Signal): Promise<StartLscExperimentResult> {
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
  const cvsContext = await getLatestCvsContextForEcho(supabase, memberId);
  const scoring = computeLscScoring(session.answers, cvsContext);
  const { theory, body } = buildLscExperimentTheoryCopy(scoring);
  const experiment = await startLifestyleExperiment(supabase, memberId, {
    recommendationId: null,
    title: SIGNAL_LABEL[signal],
    protocol: `${theory} ${body}`,
    startDate,
    durationDays: LSC_EXPERIMENT_DURATION_DAYS,
    sourceSessionId: sessionId,
    sourceExperienceKey: 'life-signal-check',
  });
  if (!experiment) return { ok: false, error: 'Could not start this experiment.' };

  return { ok: true, experiment };
}

export type LscExperimentStatus = {
  experiment: LifestyleExperiment;
  todayLocalDate: string;
  daysSinceStart: number;
  isDay3Eligible: boolean;
  isDay7Eligible: boolean;
  logs: Awaited<ReturnType<typeof listLscDailyLogs>>;
  todayCompleted: boolean | null;
};

export async function getMyLscExperimentStatusAction(): Promise<LscExperimentStatus | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const latest = await findLatestLscExperiment(supabase, memberId);
  if (!latest) return null;

  const experiments = await listMyLifestyleExperiments(supabase, memberId);
  const now = new Date();
  const experiment = experiments
    .map((e) => ({ ...e, status: deriveEffectiveStatus(e, now) }))
    .find((e) => e.id === latest.id);
  if (!experiment) return null;

  const todayLocalDate = await localDateFor(supabase, memberId);
  const logs = await listLscDailyLogs(supabase, experiment.id);
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

export async function logLscExperimentDayAction(experimentId: string, completed: boolean): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, memberId);
  const ok = await upsertLscDailyLog(supabase, memberId, experimentId, localDate, { completed });
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function submitLscDay3ResponseAction(
  experimentId: string,
  response: Day3Response
): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, memberId);
  const ok = await upsertLscDailyLog(supabase, memberId, experimentId, localDate, { day3Response: response });
  if (ok) await clearRootPopupDismissal(supabase, memberId, lscPopupMessageKey('day3', experimentId));
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function acknowledgeLscDay7Action(experimentId: string): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const ok = await markDay7Acknowledged(supabase, memberId, experimentId);
  if (ok) await clearRootPopupDismissal(supabase, memberId, lscPopupMessageKey('day7', experimentId));
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

/** Whether the given member has ever started (or completed) a Life Signal Check session — used by Core Values Snapshot's own coach detail view to answer "did they continue to Experience 2" for real. */
export async function hasStartedLscAction(memberId: string): Promise<boolean> {
  const supabase = createClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, LSC_KEY);
  if (!definition) return false;

  const { count } = await supabase
    .from('unified_assessment_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .eq('assessment_definition_id', definition.id);

  return (count ?? 0) > 0;
}

// --- Coach visibility -------------------------------------------------

export type LscCoachSummary = {
  sessionId: string;
  completedAt: string;
  assessmentVersion: number;
  chosenSignalLabel: string;
  loudestSignalLabel: string;
  pattern: LscScoring['pattern'];
};

export async function getClientLscSessionsAction(clientId: string): Promise<LscCoachSummary[]> {
  const supabase = createClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, LSC_KEY);
  if (!definition) return [];

  const { data: rows, error } = await supabase
    .from('unified_assessment_sessions')
    .select('id, completed_at, assessment_version')
    .eq('member_id', clientId)
    .eq('assessment_definition_id', definition.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (error || !rows || rows.length === 0) return [];

  const summaries: LscCoachSummary[] = [];
  for (const row of rows as { id: string; completed_at: string; assessment_version: number }[]) {
    const session = await getSessionById(supabase, row.id);
    if (!session) continue;
    const cvsContext = await getLatestCvsContextForEcho(supabase, clientId);
    const scoring = computeLscScoring(session.answers, cvsContext);

    summaries.push({
      sessionId: row.id,
      completedAt: row.completed_at,
      assessmentVersion: row.assessment_version,
      chosenSignalLabel: SIGNAL_LABEL[scoring.chosenSignal],
      loudestSignalLabel: SIGNAL_LABEL[scoring.loudestSignal],
      pattern: scoring.pattern,
    });
  }

  return summaries;
}

export type LscCoachSessionDetail = {
  session: AssessmentSession;
  scoring: LscScoring;
  timeToCompleteMinutes: number | null;
  experiment: (LifestyleExperiment & { logs: Awaited<ReturnType<typeof listLscDailyLogs>> }) | null;
};

export async function getClientLscSessionDetailAction(sessionId: string): Promise<LscCoachSessionDetail | null> {
  const supabase = createClient();
  const session = await getSessionById(supabase, sessionId);
  if (!session) return null;

  const cvsContext = await getLatestCvsContextForEcho(supabase, session.memberId);
  const scoring = computeLscScoring(session.answers, cvsContext);

  const timeToCompleteMinutes =
    session.completedAt
      ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)
      : null;

  let experiment: LscCoachSessionDetail['experiment'] = null;
  const linkedExperiment = await findLscExperimentBySessionId(supabase, sessionId);
  if (linkedExperiment) {
    const experiments = await listMyLifestyleExperiments(supabase, session.memberId);
    const now = new Date();
    const found = experiments.map((e) => ({ ...e, status: deriveEffectiveStatus(e, now) })).find((e) => e.id === linkedExperiment.id);
    if (found) {
      const logs = await listLscDailyLogs(supabase, found.id);
      experiment = { ...found, logs };
    }
  }

  return { session, scoring, timeToCompleteMinutes, experiment };
}

export { classifyDay7Pattern };
