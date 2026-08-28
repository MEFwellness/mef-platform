/**
 * apps/consumer-web-app/app/actions/readinessPulse.ts
 *
 * The only place a Server/Client Component reaches into Readiness Pulse.
 * Thin wrappers around the existing Unified Adaptive Assessment Runtime
 * (lib/assessment-runtime), Lifestyle Experiments (lib/lifestyle-experiments),
 * Member Health Narrative (lib/narrative), and the Coaching Style Profile
 * (lib/intelligence-core) — no parallel session/experiment/observation
 * system. Mirrors app/actions/lifeSignalCheck.ts's own shape exactly.
 */

'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { localDateStringFor } from '@/lib/time/localDate';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { checkAssessmentAccess } from '@/lib/assessment-registry/access';
import {
  beginRuntimeAssessment,
  loadRuntimeTakeSession,
} from '@/lib/assessment-runtime/entry';
import {
  completeSession,
  getSessionById,
  persistAnswer,
  type AnswerValue,
  type AssessmentSession,
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
import { RPL_KEY, RPL_EXPERIMENT_DURATION_DAYS, READINESS_PATTERN_LABEL, type ReadinessPattern, type Signal } from '@/lib/readiness-pulse/constants';
import { computeRplScoring, allRplQuestionsAnswered } from '@/lib/readiness-pulse/scoring';
import { buildRplNarrativeDrafts } from '@/lib/readiness-pulse/narrative';
import {
  buildRplReadyNowExperimentCopy,
  buildRplReadyIfSmallExperimentCopy,
  buildEvidenceEchoLine,
  RPL_STILL_DECIDING_INTRO,
  RPL_NOT_YET_INTRO,
  type EvidenceEchoContext,
} from '@/lib/readiness-pulse/copy';
import type { RplScoring, LscContextForRpl, CvsContextForRpl } from '@/lib/readiness-pulse/types';
import { applyRplCoachingStyleStatement } from '@/lib/readiness-pulse/coachingStyleWrite';
import {
  findLatestRplExperiment,
  findRplExperimentBySessionId,
  findLatestLscExperimentForEcho,
  listRplDailyLogs,
  upsertRplDailyLog,
} from '@/lib/readiness-pulse/dailyLogsData';
import { classifyDay7Pattern, daysSinceStart, isDay3Eligible, isDay7Eligible, type Day3Response } from '@/lib/core-values-snapshot/experiment';
import { clearRootPopupDismissal, rplPopupMessageKey } from '@/lib/root-popup-messages/data';
import { LSC_KEY, SIGNAL_LABEL, SIGNAL_BY_LABEL } from '@/lib/life-signal-check/constants';
import { CVS_KEY } from '@/lib/core-values-snapshot/constants';
import { computeLscScoring } from '@/lib/life-signal-check/scoring';
import { computeCvsScoring } from '@/lib/core-values-snapshot/scoring';

async function requireMemberId(): Promise<string | null> {
  const user = await getCachedUser();
  return user?.id ?? null;
}

/**
 * The member's OWN calendar date for a completion instant, not the UTC one
 * (2026-08-27). `completedAt.slice(0, 10)` is the same timezone bug the
 * Protein Ledger had: somebody finishing at 8pm in New York has a
 * completion timestamp that already reads as tomorrow in UTC, so her
 * Personal Health Timeline filed the moment under a day she had not lived
 * yet. Reuses lib/time/localDate.ts, which every other event-stream write
 * already agrees with.
 */
async function memberLocalDateForInstant(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  isoInstant: string
): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', memberId)
    .maybeSingle();
  return localDateStringFor(isoInstant, profile?.timezone ?? 'America/New_York');
}

/** The member's most recently completed Life Signal Check, for Question 8's comparison and the Ready Now / Ready If It's Small experiment's own target signal + timing. Degrades gracefully to null (Life Signal Check unlocks before Readiness Pulse in practice, but this never assumes it). */
async function getLatestLscContextForRpl(supabase: ReturnType<typeof createClient>, memberId: string): Promise<LscContextForRpl | null> {
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, LSC_KEY);
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

  const scoring = computeLscScoring(session.answers, null);
  return { loudestSignal: scoring.loudestSignal, pattern: scoring.pattern, hardestTimeOfDay: scoring.hardestTimeOfDay };
}

/** The member's most recently completed Core Values Snapshot top value, for the closing screen's own "what you are protecting" synthesis card only. */
async function getLatestCvsContextForRpl(supabase: ReturnType<typeof createClient>, memberId: string): Promise<CvsContextForRpl | null> {
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
  return { topValue: scoring.topValue };
}

export async function getMyLatestLscContextForRplAction() {
  const memberId = await requireMemberId();
  if (!memberId) return null;
  return getLatestLscContextForRpl(createClient(), memberId);
}

export async function getMyLatestCvsContextForRplAction() {
  const memberId = await requireMemberId();
  if (!memberId) return null;
  return getLatestCvsContextForRpl(createClient(), memberId);
}

const RPL_ROUTES = {
  overview: '/assessments/readiness-pulse',
  take: '/assessments/readiness-pulse/take',
  results: (sessionId: string) => `/assessments/readiness-pulse/results/${sessionId}`,
};

/**
 * The Start / Resume button. A Server Action, never a render, because a
 * render must not insert a row. See lib/assessment-runtime/entry.ts.
 */
export async function beginRplAction(): Promise<void> {
  const result = await beginRuntimeAssessment(RPL_KEY, RPL_ROUTES);
  redirect(result.ok ? result.takeHref : result.redirectTo);
}

/** Take it again. Only ever reached by pressing the labelled retake button on the overview screen. */
export async function retakeRplAction(): Promise<void> {
  const result = await beginRuntimeAssessment(RPL_KEY, RPL_ROUTES, { startRetake: true });
  redirect(result.ok ? result.takeHref : result.redirectTo);
}

/** What the take page reads. Resumes a real draft, sends a finished member to her results, and writes nothing in either case or in the case where there is nothing at all. */
export async function loadRplTakeSessionAction(): Promise<
  { ok: true; session: AssessmentSession } | { ok: false; redirectTo: string }
> {
  const result = await loadRuntimeTakeSession(RPL_KEY, RPL_ROUTES);
  return result.ok
    ? { ok: true, session: result.session }
    : { ok: false, redirectTo: result.redirectTo };
}

/**
 * THE GATE, ON THE WRITE PATH TOO (2026-08-27). 'view', not 'start': a
 * member who legitimately began must always be able to finish it, and the
 * question of whether she may BEGIN is decided on the begin path.
 */
async function mayWriteRpl(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<boolean> {
  const access = await checkAssessmentAccess(supabase, memberId, RPL_KEY, { intent: 'view' });
  return access.allowed;
}

export async function submitRplAnswerAction(
  sessionId: string,
  questionId: string,
  value: AnswerValue
): Promise<{ ok: true; session: AssessmentSession } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await mayWriteRpl(supabase, memberId))) {
    return { ok: false, error: 'This is not open for you right now.' };
  }

  try {
    const { session } = await persistAnswer(supabase, sessionId, questionId, value);
    if (session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };
    return { ok: true, session };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save that answer.' };
  }
}

async function applyRplNarrativeDraft(
  supabase: ReturnType<typeof createClient>,
  memberId: string,
  sessionId: string,
  draft: Awaited<ReturnType<typeof buildRplNarrativeDrafts>>[number]
): Promise<void> {
  const existing = await findActiveItem(supabase, memberId, draft.category, draft.title);
  if (existing && existing.summary === draft.summary) return;

  const inserted = await insertNarrativeItem(supabase, memberId, 'system', null, draft);
  if (existing && inserted) {
    await supersedeNarrativeItem(supabase, existing.id, inserted.id);
  }
  if (!inserted) console.error('applyRplNarrativeDraft: insertNarrativeItem failed', memberId, draft.title, sessionId);
}

export type CompleteRplResult = { ok: true; session: AssessmentSession; scoring: RplScoring } | { ok: false; error: string };

export async function completeRplAssessmentAction(sessionId: string): Promise<CompleteRplResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await mayWriteRpl(supabase, memberId))) {
    return { ok: false, error: 'This is not open for you right now.' };
  }

  let session: AssessmentSession;
  try {
    const result = await completeSession(supabase, sessionId);
    session = result.session;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong finishing this conversation.' };
  }

  if (session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };
  if (!allRplQuestionsAnswered(session.answers)) return { ok: false, error: 'Not every question was answered yet.' };

  const lscContext = await getLatestLscContextForRpl(supabase, memberId);
  const scoring = computeRplScoring(session.answers, lscContext);

  try {
    const drafts = buildRplNarrativeDrafts(sessionId, scoring);
    for (const draft of drafts) {
      await applyRplNarrativeDraft(supabase, memberId, sessionId, draft);
    }
  } catch (err) {
    console.error('Readiness Pulse narrative write failed', err);
  }

  try {
    await applyRplCoachingStyleStatement(supabase, memberId, sessionId, scoring.q5);
  } catch (err) {
    console.error('Readiness Pulse coaching-style write failed', err);
  }

  try {
    const completedAt = session.completedAt ?? new Date().toISOString();
    await recordTimelineEvent(supabase, {
      memberId,
      eventType: 'assessment_published',
      localDate: await memberLocalDateForInstant(supabase, memberId, completedAt),
      title: 'Completed your Readiness Pulse',
      sourceFeature: 'unified_assessment_finding',
      sourceRecordId: sessionId,
    });
  } catch (err) {
    console.error('Readiness Pulse timeline event failed', err);
  }

  return { ok: true, session, scoring };
}

// --- Evidence Echo ----------------------------------------------------

/** Eligibility per the build brief: a Life Signal Check experiment, active or completed, with at least one real day answer within the last 14 days. Numbers only from real logged days; never fires without them. */
export async function getEvidenceEchoContext(supabase: ReturnType<typeof createClient>, memberId: string): Promise<EvidenceEchoContext | null> {
  const experiment = await findLatestLscExperimentForEcho(supabase, memberId);
  if (!experiment) return null;

  const now = new Date();
  const effectiveStatus = deriveEffectiveStatus(
    { status: experiment.status as LifestyleExperiment['status'], startDate: experiment.startDate, durationDays: experiment.durationDays },
    now
  );
  if (effectiveStatus !== 'active' && effectiveStatus !== 'completed') return null;

  const logs = await listRplDailyLogs(supabase, experiment.id);
  const todayLocalDate = await localDateFor(supabase, memberId);
  const fourteenDaysAgo = new Date(`${todayLocalDate}T00:00:00Z`);
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 14);
  const experimentStart = new Date(`${experiment.startDate}T00:00:00Z`);

  // Floored at the experiment's own start date, not just "last 14 days" —
  // real usage can never produce a log before an experiment's start_date
  // (logging always stamps today's date, which is never earlier than
  // start_date), but this keeps yesCount and windowDays mutually
  // consistent under any data anomaly rather than ever producing a
  // nonsensical claim like "4 of the last 1 days."
  const recentLogs = logs.filter(
    (l) => l.completed !== null && new Date(`${l.localDate}T00:00:00Z`) >= fourteenDaysAgo && new Date(`${l.localDate}T00:00:00Z`) >= experimentStart
  );
  if (recentLogs.length === 0) return null;

  const yesCount = recentLogs.filter((l) => l.completed === true).length;
  const windowDays = Math.min(daysSinceStart(experiment.startDate, todayLocalDate) + 1, experiment.durationDays, 14);
  const signal = SIGNAL_BY_LABEL[experiment.title] ?? null;
  if (!signal) return null;

  return { signalLabel: SIGNAL_LABEL[signal], yesCount, windowDays };
}

export async function getMyEvidenceEchoAction(): Promise<EvidenceEchoContext | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;
  return getEvidenceEchoContext(createClient(), memberId);
}

export { buildEvidenceEchoLine };

// --- Weekly Experiment --------------------------------------------------

function rplExperimentTitleAndProtocol(scoring: RplScoring): { title: string; protocol: string } {
  switch (scoring.finalPattern) {
    case 'ready_now': {
      const { theory, body } = buildRplReadyNowExperimentCopy(scoring);
      return { title: SIGNAL_LABEL[scoring.targetSignal], protocol: `${theory} ${body}` };
    }
    case 'ready_if_small': {
      const { theory, body } = buildRplReadyIfSmallExperimentCopy(scoring);
      return { title: `${SIGNAL_LABEL[scoring.targetSignal]} (small)`, protocol: `${theory} ${body}` };
    }
    case 'still_deciding':
      return { title: 'Daily Noticing', protocol: `${RPL_STILL_DECIDING_INTRO.theory} ${RPL_STILL_DECIDING_INTRO.body}` };
    case 'not_yet':
      return { title: 'The Noticing', protocol: `${RPL_NOT_YET_INTRO.theory} ${RPL_NOT_YET_INTRO.body}` };
  }
}

export type StartRplExperimentResult = { ok: true; experiment: LifestyleExperiment } | { ok: false; error: string };

export async function startRplExperimentAction(sessionId: string): Promise<StartRplExperimentResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const session = await getSessionById(supabase, sessionId);
  if (!session || session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };

  const activeCount = await countActiveExperiments(supabase, memberId);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    return { ok: false, error: `You're already working on ${MAX_ACTIVE_EXPERIMENTS} experiments, close one out before starting another.` };
  }

  const now = new Date();
  const latest = await findLatestRplExperiment(supabase, memberId);
  if (latest) {
    const experiments = await listMyLifestyleExperiments(supabase, memberId);
    const current = experiments.find((e) => e.id === latest.id);
    if (current && deriveEffectiveStatus(current, now) === 'active') {
      return { ok: false, error: 'You already have an active Readiness Pulse experiment. Close it out first.' };
    }
  }

  const lscContext = await getLatestLscContextForRpl(supabase, memberId);
  const scoring = computeRplScoring(session.answers, lscContext);
  const { title, protocol } = rplExperimentTitleAndProtocol(scoring);
  const startDate = await localDateFor(supabase, memberId);

  const experiment = await startLifestyleExperiment(supabase, memberId, {
    recommendationId: null,
    title,
    protocol,
    startDate,
    durationDays: RPL_EXPERIMENT_DURATION_DAYS,
    sourceSessionId: sessionId,
    sourceExperienceKey: 'readiness-pulse',
  });
  if (!experiment) return { ok: false, error: 'Could not start this experiment.' };

  return { ok: true, experiment };
}

export type RplOffer = { sessionId: string; scoring: RplScoring };

export async function getMyRplOfferAction(): Promise<RplOffer | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, RPL_KEY);
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

  const lscContext = await getLatestLscContextForRpl(supabase, memberId);
  const scoring = computeRplScoring(session.answers, lscContext);
  return { sessionId: session.id, scoring };
}

export type RplExperimentStatus = {
  experiment: LifestyleExperiment;
  kind: ReadinessPattern;
  targetSignal: Signal | null;
  small: boolean;
  todayLocalDate: string;
  daysSinceStart: number;
  isDay3Eligible: boolean;
  isDay7Eligible: boolean;
  logs: Awaited<ReturnType<typeof listRplDailyLogs>>;
  todayCompleted: boolean | null;
};

export async function getMyRplExperimentStatusAction(): Promise<RplExperimentStatus | null> {
  const memberId = await requireMemberId();
  if (!memberId) return null;

  const supabase = createClient();
  const latest = await findLatestRplExperiment(supabase, memberId);
  if (!latest) return null;

  const experiments = await listMyLifestyleExperiments(supabase, memberId);
  const now = new Date();
  const experiment = experiments.map((e) => ({ ...e, status: deriveEffectiveStatus(e, now) })).find((e) => e.id === latest.id);
  if (!experiment) return null;

  let kind: ReadinessPattern = 'still_deciding';
  let targetSignal: Signal | null = null;
  if (latest.sourceSessionId) {
    const session = await getSessionById(supabase, latest.sourceSessionId);
    if (session) {
      const lscContext = await getLatestLscContextForRpl(supabase, memberId);
      const scoring = computeRplScoring(session.answers, lscContext);
      kind = scoring.finalPattern;
      if (kind === 'ready_now' || kind === 'ready_if_small') targetSignal = scoring.targetSignal;
    }
  }

  const todayLocalDate = await localDateFor(supabase, memberId);
  const logs = await listRplDailyLogs(supabase, experiment.id);
  const todayRow = logs.find((l) => l.localDate === todayLocalDate);

  return {
    experiment,
    kind,
    targetSignal,
    small: kind === 'ready_if_small',
    todayLocalDate,
    daysSinceStart: daysSinceStart(experiment.startDate, todayLocalDate),
    isDay3Eligible: isDay3Eligible(experiment.startDate, todayLocalDate),
    isDay7Eligible: isDay7Eligible(experiment.startDate, todayLocalDate),
    logs,
    todayCompleted: todayRow?.completed ?? null,
  };
}

export async function logRplExperimentDayAction(experimentId: string, completed: boolean): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, memberId);
  const ok = await upsertRplDailyLog(supabase, memberId, experimentId, localDate, { completed });
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function submitRplDay3ResponseAction(experimentId: string, response: Day3Response): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const localDate = await localDateFor(supabase, memberId);
  const ok = await upsertRplDailyLog(supabase, memberId, experimentId, localDate, { day3Response: response });
  if (ok) await clearRootPopupDismissal(supabase, memberId, rplPopupMessageKey('day3', experimentId));
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

export async function acknowledgeRplDay7Action(experimentId: string): Promise<{ ok: boolean; error?: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  const ok = await markDay7Acknowledged(supabase, memberId, experimentId);
  if (ok) await clearRootPopupDismissal(supabase, memberId, rplPopupMessageKey('day7', experimentId));
  return ok ? { ok: true } : { ok: false, error: 'Could not save that.' };
}

// --- Coach visibility -------------------------------------------------

export type RplCoachSummary = {
  sessionId: string;
  completedAt: string;
  assessmentVersion: number;
  finalPatternLabel: string;
  derivedPatternLabel: string;
  pickDiverged: boolean;
};

export async function getClientRplSessionsAction(clientId: string): Promise<RplCoachSummary[]> {
  const supabase = createClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, RPL_KEY);
  if (!definition) return [];

  const { data: rows, error } = await supabase
    .from('unified_assessment_sessions')
    .select('id, completed_at, assessment_version')
    .eq('member_id', clientId)
    .eq('assessment_definition_id', definition.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (error || !rows || rows.length === 0) return [];

  const summaries: RplCoachSummary[] = [];
  for (const row of rows as { id: string; completed_at: string; assessment_version: number }[]) {
    const session = await getSessionById(supabase, row.id);
    if (!session) continue;
    const lscContext = await getLatestLscContextForRpl(supabase, clientId);
    const scoring = computeRplScoring(session.answers, lscContext);

    summaries.push({
      sessionId: row.id,
      completedAt: row.completed_at,
      assessmentVersion: row.assessment_version,
      finalPatternLabel: READINESS_PATTERN_LABEL[scoring.finalPattern],
      derivedPatternLabel: READINESS_PATTERN_LABEL[scoring.derivedPattern],
      pickDiverged: scoring.pickDivergedFromDerived,
    });
  }

  return summaries;
}

export type RplCoachSessionDetail = {
  session: AssessmentSession;
  scoring: RplScoring;
  timeToCompleteMinutes: number | null;
  experiment: (LifestyleExperiment & { logs: Awaited<ReturnType<typeof listRplDailyLogs>> }) | null;
};

export async function getClientRplSessionDetailAction(sessionId: string): Promise<RplCoachSessionDetail | null> {
  const supabase = createClient();
  const session = await getSessionById(supabase, sessionId);
  if (!session) return null;

  const lscContext = await getLatestLscContextForRpl(supabase, session.memberId);
  const scoring = computeRplScoring(session.answers, lscContext);

  const timeToCompleteMinutes = session.completedAt
    ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)
    : null;

  let experiment: RplCoachSessionDetail['experiment'] = null;
  const linkedExperiment = await findRplExperimentBySessionId(supabase, sessionId);
  if (linkedExperiment) {
    const experiments = await listMyLifestyleExperiments(supabase, session.memberId);
    const now = new Date();
    const found = experiments.map((e) => ({ ...e, status: deriveEffectiveStatus(e, now) })).find((e) => e.id === linkedExperiment.id);
    if (found) {
      const logs = await listRplDailyLogs(supabase, found.id);
      experiment = { ...found, logs };
    }
  }

  return { session, scoring, timeToCompleteMinutes, experiment };
}

export { classifyDay7Pattern };
