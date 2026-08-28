/**
 * apps/consumer-web-app/app/actions/wbsa.ts
 *
 * The only place a Server/Client Component reaches into WBSA. Thin
 * wrappers around the existing Unified Adaptive Assessment Runtime
 * (lib/assessment-runtime/{data,session}.ts) — no parallel submission
 * system, no new session/branching/scoring logic here. Auth + membership
 * access are checked before every runtime call, same discipline as
 * app/actions/assessments.ts.
 */

'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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
import {
  getUnifiedAssessmentDefinitionByKey,
  getUnifiedAssessmentSections,
} from '@/lib/assessment-foundation/repository';
import { computeWbsaSystemBreakdown, hasAnySkippedQuestion } from '@/lib/wbsa/results';
import { escalateWbsaRedFlags } from '@/lib/wbsa/safety';
import { recordTimelineEvent } from '@/lib/timeline/data';
import { WBSA_KEY } from '@/lib/wbsa/constants';

async function requireMemberId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const WBSA_ROUTES = {
  overview: '/assessments/wbsa',
  take: '/assessments/wbsa/take',
  results: (sessionId: string) => `/assessments/wbsa/results/${sessionId}`,
};

/**
 * The Start / Resume button. A Server Action, never a render, because a
 * render must not insert a row. See lib/assessment-runtime/entry.ts.
 */
export async function beginWbsaAction(): Promise<void> {
  const result = await beginRuntimeAssessment(WBSA_KEY, WBSA_ROUTES);
  redirect(result.ok ? result.takeHref : result.redirectTo);
}

/** Take it again. Only ever reached by pressing the labelled retake button on the overview screen. */
export async function retakeWbsaAction(): Promise<void> {
  const result = await beginRuntimeAssessment(WBSA_KEY, WBSA_ROUTES, { startRetake: true });
  redirect(result.ok ? result.takeHref : result.redirectTo);
}

/** What the take page reads. Resumes a real draft, sends a finished member to her results, and writes nothing in either case or in the case where there is nothing at all. */
export async function loadWbsaTakeSessionAction(): Promise<
  { ok: true; session: AssessmentSession } | { ok: false; redirectTo: string }
> {
  const result = await loadRuntimeTakeSession(WBSA_KEY, WBSA_ROUTES);
  return result.ok
    ? { ok: true, session: result.session }
    : { ok: false, redirectTo: result.redirectTo };
}

/**
 * THE GATE, ON THE WRITE PATH TOO (2026-08-27). 'view', not 'start': a
 * member who legitimately began must always be able to finish it, and the
 * question of whether she may BEGIN is decided on the begin path.
 */
async function mayWriteWbsa(
  supabase: ReturnType<typeof createClient>,
  memberId: string
): Promise<boolean> {
  const access = await checkAssessmentAccess(supabase, memberId, WBSA_KEY, { intent: 'view' });
  return access.allowed;
}

export async function submitWbsaAnswerAction(
  sessionId: string,
  questionId: string,
  value: AnswerValue
): Promise<{ ok: true; session: AssessmentSession } | { ok: false; error: string }> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await mayWriteWbsa(supabase, memberId))) {
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

export type CompleteWbsaResult =
  | { ok: true; session: AssessmentSession }
  | { ok: false; error: string };

/**
 * Wraps the runtime's own completeSession (validation, findings,
 * Universal Registry publish — all unmodified) with the three WBSA-
 * specific side effects the build brief asks for: safety escalation on a
 * qualifying red-flag answer, a member timeline event, and (best-effort)
 * nothing else — retake comparison is computed on demand by the results
 * page from two completed sessions, not persisted separately here. Every
 * side effect is wrapped so a failure can never turn a real, completed
 * assessment into an error the member sees.
 */
export async function completeWbsaAssessmentAction(sessionId: string): Promise<CompleteWbsaResult> {
  const memberId = await requireMemberId();
  if (!memberId) return { ok: false, error: 'Not signed in.' };

  const supabase = createClient();
  if (!(await mayWriteWbsa(supabase, memberId))) {
    return { ok: false, error: 'This is not open for you right now.' };
  }

  let session: AssessmentSession;
  try {
    const result = await completeSession(supabase, sessionId);
    session = result.session;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong finishing your assessment.' };
  }

  if (session.memberId !== memberId) return { ok: false, error: 'Assessment not found.' };

  try {
    await escalateWbsaRedFlags(supabase, memberId, sessionId, session.findings);
  } catch (err) {
    console.error('WBSA safety escalation failed', err);
  }

  try {
    const completedAt = session.completedAt ?? new Date().toISOString();
    await recordTimelineEvent(supabase, {
      memberId,
      eventType: 'assessment_published',
      localDate: completedAt.slice(0, 10),
      title: 'Completed your Whole-Body Check-In',
      sourceFeature: 'unified_assessment_finding',
      sourceRecordId: sessionId,
    });
  } catch (err) {
    console.error('WBSA timeline event failed', err);
  }

  return { ok: true, session };
}

export type WbsaCoachSummary = {
  sessionId: string;
  completedAt: string;
  assessmentVersion: number;
  hasSafetyFlag: boolean;
  skippedAnyQuestion: boolean;
  systemsNeedingContextCount: number;
  systemsWorthWatchingCount: number;
};

/**
 * Coach-facing list summary — completion status/date, version, high-level
 * per-system counts, safety flag, and whether any sensitive question was
 * skipped. Deliberately counts only, never which system or what was
 * answered — full per-question detail lives behind
 * getClientWbsaSessionDetailAction below, gated by the same coach-
 * assigned RLS every other coach detail read in this app already relies
 * on (no new grant needed — migration 99 already scopes
 * unified_assessment_sessions/_answers to coach_read_assigned_*).
 */
export async function getClientWbsaSessionsAction(clientId: string): Promise<WbsaCoachSummary[]> {
  const supabase = createClient();
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, WBSA_KEY);
  if (!definition) return [];

  const { data: rows, error } = await supabase
    .from('unified_assessment_sessions')
    .select('id, completed_at, assessment_version')
    .eq('member_id', clientId)
    .eq('assessment_definition_id', definition.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false });

  if (error || !rows || rows.length === 0) return [];

  const sections = await getUnifiedAssessmentSections(supabase, definition.id);

  const summaries: WbsaCoachSummary[] = [];
  for (const row of rows as { id: string; completed_at: string; assessment_version: number }[]) {
    const session = await getSessionById(supabase, row.id);
    if (!session) continue;

    const breakdown = computeWbsaSystemBreakdown(
      sections,
      session.visibleQuestions,
      session.answers,
      session.findings
    );

    summaries.push({
      sessionId: row.id,
      completedAt: row.completed_at,
      assessmentVersion: row.assessment_version,
      hasSafetyFlag: session.findings.some((f) => f.severity === 'significant'),
      skippedAnyQuestion: hasAnySkippedQuestion(breakdown),
      systemsNeedingContextCount: breakdown.filter((b) => b.band === 'needs_context').length,
      systemsWorthWatchingCount: breakdown.filter((b) => b.band === 'watch').length,
    });
  }

  return summaries;
}

export type WbsaCoachSessionDetail = {
  session: AssessmentSession;
  sections: Awaited<ReturnType<typeof getUnifiedAssessmentSections>>;
};

/** Full per-question detail for the coach detail view — same RLS gate as the summary list above, just reading everything rather than counts. */
export async function getClientWbsaSessionDetailAction(
  sessionId: string
): Promise<WbsaCoachSessionDetail | null> {
  const supabase = createClient();
  const session = await getSessionById(supabase, sessionId);
  if (!session) return null;

  const sections = await getUnifiedAssessmentSections(supabase, session.assessmentId);
  return { session, sections };
}
