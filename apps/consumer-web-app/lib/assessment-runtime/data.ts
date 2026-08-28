/**
 * The one Supabase-touching module in lib/assessment-runtime/ — mirrors
 * lib/assessments/store.ts's exact shape and discipline: "start" and
 * "resume" are the same get-or-create entry point (backed by migration
 * 99's partial unique index, not application-level check-then-insert);
 * answers are upserted immediately per-save; resume position is always
 * recomputed from real stored answers after every write, never an
 * independently-advanced cursor; the registry publish step runs last, at
 * completion, wrapped in try/catch — a registry write failure must never
 * break a completed assessment the member already has real results for.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UnifiedAssessmentQuestion, UnifiedAssessmentSection } from '@mef/shared-types-contracts';
import {
  getUnifiedAssessmentDefinitionByKey,
  getUnifiedAssessmentQuestions,
  getUnifiedAssessmentSections,
} from '../assessment-foundation/repository';
import { publishUnifiedAssessmentFindings } from '../registry/adapters/unifiedAssessment';
import { deriveFindings } from './findings';
import { buildSession, calculateVisibleQuestions, findFirstUnanswered, flattenVisibleQuestions } from './session';
import type { AnswerValue, AssessmentSession, RuntimeEvent, SessionAnswers } from './types';

type SessionRow = {
  id: string;
  member_id: string;
  assessment_definition_id: string;
  assessment_version: number;
  status: 'in_progress' | 'completed';
  current_section_id: string | null;
  current_question_id: string | null;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

type Content = { sections: UnifiedAssessmentSection[]; questions: UnifiedAssessmentQuestion[] };

async function loadContent(supabase: SupabaseClient, assessmentDefinitionId: string): Promise<Content> {
  const [sections, questions] = await Promise.all([
    getUnifiedAssessmentSections(supabase, assessmentDefinitionId),
    getUnifiedAssessmentQuestions(supabase, assessmentDefinitionId),
  ]);
  return { sections, questions };
}

async function fetchAnswers(
  supabase: SupabaseClient,
  sessionId: string,
  questions: UnifiedAssessmentQuestion[]
): Promise<SessionAnswers> {
  const { data, error } = await supabase
    .from('unified_assessment_answers')
    .select('question_id, value')
    .eq('session_id', sessionId);

  if (error) throw new Error(`Failed to load assessment answers: ${error.message}`);

  const questionKeyById = new Map(questions.map((q) => [q.id, q.question_key]));
  const answers: SessionAnswers = {};
  for (const row of data ?? []) {
    const key = questionKeyById.get(row.question_id as string);
    if (key) answers[key] = row.value as AnswerValue;
  }
  return answers;
}

function assembleSession(row: SessionRow, content: Content, answers: SessionAnswers): AssessmentSession {
  return buildSession({
    id: row.id,
    assessmentId: row.assessment_definition_id,
    assessmentVersion: row.assessment_version,
    memberId: row.member_id,
    status: row.status,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    sections: content.sections,
    questions: content.questions,
    answers,
  });
}

/**
 * The member's open draft for this assessment definition, if one exists —
 * never creates one. Mirrors store.ts's findInProgressAssessment.
 */
export async function findInProgressSession(
  supabase: SupabaseClient,
  memberId: string,
  assessmentDefinitionId: string
): Promise<AssessmentSession | null> {
  const { data: row, error } = await supabase
    .from('unified_assessment_sessions')
    .select('*')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', assessmentDefinitionId)
    .eq('status', 'in_progress')
    .maybeSingle();

  if (error || !row) return null;

  const content = await loadContent(supabase, assessmentDefinitionId);
  const answers = await fetchAnswers(supabase, row.id, content.questions);
  return assembleSession(row as SessionRow, content, answers);
}

/**
 * Loads any session by id regardless of status — what a results screen or
 * coach detail view needs for a *completed* session, which
 * findInProgressSession's own status filter deliberately excludes. Access
 * control is the caller's job (RLS plus, for member-facing pages, an
 * explicit memberId check on the returned session), same trust boundary
 * as every other function in this file.
 */
export async function getSessionById(
  supabase: SupabaseClient,
  sessionId: string
): Promise<AssessmentSession | null> {
  const { data: row, error } = await supabase
    .from('unified_assessment_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !row) return null;

  const content = await loadContent(supabase, (row as SessionRow).assessment_definition_id);
  const answers = await fetchAnswers(supabase, sessionId, content.questions);
  return assembleSession(row as SessionRow, content, answers);
}

/** The most recent session this member has actually FINISHED for a definition, or null. One indexed query (unified_assessment_sessions_member_definition_idx already orders by completed_at desc). */
export async function findLatestCompletedSession(
  supabase: SupabaseClient,
  memberId: string,
  assessmentDefinitionId: string
): Promise<{ id: string; completedAt: string | null } | null> {
  const { data: row, error } = await supabase
    .from('unified_assessment_sessions')
    .select('id, completed_at')
    .eq('member_id', memberId)
    .eq('assessment_definition_id', assessmentDefinitionId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) return null;
  return { id: row.id as string, completedAt: (row.completed_at as string | null) ?? null };
}

export type StartOrResumeResult =
  /** An open draft was found and handed back untouched. */
  | { status: 'resumed'; session: AssessmentSession; events: RuntimeEvent[] }
  /** No draft existed and a new session was created. */
  | { status: 'started'; session: AssessmentSession; events: RuntimeEvent[] }
  /** She has already finished this and did not ask to start again. NOTHING was written. */
  | { status: 'already_completed'; latestCompletedSessionId: string }
  /** Read-only call (`createIfMissing: false`): there is no draft to resume and no completion to show. NOTHING was written. */
  | { status: 'no_session' }
  /** The key does not resolve to a real, active definition. */
  | { status: 'not_found' };

/**
 * Start or resume — the same idempotent entry point, backed by migration
 * 99's partial unique index so a member can never end up with two open
 * drafts of the same assessment definition.
 *
 * A FINISHED ASSESSMENT IS NEVER SILENTLY RESTARTED (2026-08-27). This
 * function used to create a brand-new empty session for anybody with no
 * open draft, including somebody who had just completed the whole thing.
 * The take pages call it while RENDERING, and finishing an assessment is a
 * Next.js Server Action, which re-renders the page it was called from: so
 * the act of finishing re-ran the take page and started a fresh, empty
 * session of the assessment that had just been completed, 72ms later in a
 * local reproduction and 1.4 to 2.5 seconds later in production. That empty
 * draft then outranked the completion in `assessment_status_by_member`, and
 * the Home card, the Questionnaires page, the Priority Card, the free-arc
 * pop-up and the prerequisite chain all went back to saying she had never
 * done it. One member answered all twelve Core Values Snapshot questions
 * four separate times because of it.
 *
 * A retake is still completely available. It is now a decision the member
 * makes, carried by `options.startRetake`, rather than something a page
 * render does on her behalf.
 *
 * A PAGE RENDER MUST NOT INSERT A ROW (2026-08-27). The 'already_completed'
 * short-circuit above fixed the worst case, a finished assessment restarting
 * itself, but a FIRST visit to a take URL still created a draft during
 * render. A read-only page load by an audit crawler created one on
 * production, and any bookmark, prefetch or link-preview does the same.
 * `createIfMissing: false` is the read path the take pages now use: it
 * resumes a real draft, reports a real completion, and otherwise writes
 * nothing and says so. Creating is reserved for the explicit Start or
 * Resume the member presses, which arrives as a Server Action, never a GET.
 */
export async function startOrResumeSession(
  supabase: SupabaseClient,
  memberId: string,
  assessmentDefinitionKey: string,
  options: { startRetake?: boolean; createIfMissing?: boolean } = {}
): Promise<StartOrResumeResult> {
  const definition = await getUnifiedAssessmentDefinitionByKey(supabase, assessmentDefinitionKey);
  if (!definition) return { status: 'not_found' };

  const existing = await findInProgressSession(supabase, memberId, definition.id);
  if (existing) {
    return {
      status: 'resumed',
      session: existing,
      events: [{ type: 'assessment_resumed', sessionId: existing.id }],
    };
  }

  if (!options.startRetake) {
    const completed = await findLatestCompletedSession(supabase, memberId, definition.id);
    if (completed) return { status: 'already_completed', latestCompletedSessionId: completed.id };
  }

  if (options.createIfMissing === false) return { status: 'no_session' };

  const content = await loadContent(supabase, definition.id);
  const { visible } = calculateVisibleQuestions(content.questions, {});
  const flat = flattenVisibleQuestions(content.sections, visible);
  const first = flat[0];

  const { data: created, error } = await supabase
    .from('unified_assessment_sessions')
    .insert({
      member_id: memberId,
      assessment_definition_id: definition.id,
      assessment_version: definition.version,
      status: 'in_progress',
      current_section_id: first?.section?.id ?? null,
      current_question_id: first?.question.id ?? null,
    })
    .select('*')
    .single();

  if (error || !created) {
    throw new Error(`Failed to start assessment session: ${error?.message ?? 'unknown error'}`);
  }

  const session = assembleSession(created as SessionRow, content, {});
  // No "started" event exists in the requested vocabulary (only paused/
  // resumed/completed) — a fresh session simply has no events yet.
  return { status: 'started', session, events: [] };
}

/**
 * Persists one answer and advances the resume position to the first
 * currently-visible unanswered question — recomputed from real stored
 * answers after every write, exactly like store.ts's saveAnswer, never an
 * independently-advanced cursor (so a branching rule that just changed
 * which questions are visible can never leave a stale position behind).
 */
export async function persistAnswer(
  supabase: SupabaseClient,
  sessionId: string,
  questionId: string,
  value: AnswerValue
): Promise<{ session: AssessmentSession; events: RuntimeEvent[] }> {
  const { data: row, error: rowError } = await supabase
    .from('unified_assessment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (rowError || !row) throw new Error(`Failed to load assessment session: ${rowError?.message ?? 'not found'}`);

  const { error: answerError } = await supabase.from('unified_assessment_answers').upsert(
    { session_id: sessionId, question_id: questionId, value, answered_at: new Date().toISOString() },
    { onConflict: 'session_id,question_id' }
  );
  if (answerError) throw new Error(`Failed to save answer: ${answerError.message}`);

  const content = await loadContent(supabase, (row as SessionRow).assessment_definition_id);
  const answers = await fetchAnswers(supabase, sessionId, content.questions);
  const answeredQuestion = content.questions.find((q) => q.id === questionId);

  const { visible } = calculateVisibleQuestions(content.questions, answers);
  const flat = flattenVisibleQuestions(content.sections, visible);
  const next = findFirstUnanswered(flat, answers);

  const { error: positionError } = await supabase
    .from('unified_assessment_sessions')
    .update({
      current_section_id: next?.section?.id ?? null,
      current_question_id: next?.question.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (positionError) throw new Error(`Failed to update resume position: ${positionError.message}`);

  const { data: updatedRow, error: updatedError } = await supabase
    .from('unified_assessment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (updatedError || !updatedRow) {
    throw new Error(`Failed to reload assessment session: ${updatedError?.message ?? 'not found'}`);
  }

  const session = assembleSession(updatedRow as SessionRow, content, answers);
  const events: RuntimeEvent[] = answeredQuestion
    ? [{ type: 'question_answered', questionKey: answeredQuestion.question_key, value }]
    : [];

  const answeredSection = answeredQuestion?.section_id
    ? content.sections.find((s) => s.id === answeredQuestion.section_id)
    : null;
  if (answeredSection) {
    const sectionVisible = visible.filter((q) => q.section_id === answeredSection.id);
    const sectionComplete = sectionVisible.length > 0 && sectionVisible.every((q) => answers[q.question_key] !== undefined);
    if (sectionComplete) events.push({ type: 'section_completed', sectionId: answeredSection.id });
  }

  return { session, events };
}

/**
 * Validates completeness server-side against real stored answers (never
 * trusts the client), marks the session complete, then — as the last,
 * best-effort step — derives and publishes findings through the Universal
 * Registry adapter. Mirrors store.ts's completeAssessment exactly.
 */
export async function completeSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{ session: AssessmentSession; events: RuntimeEvent[] }> {
  const { data: row, error: rowError } = await supabase
    .from('unified_assessment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (rowError || !row) throw new Error(`Failed to load assessment session: ${rowError?.message ?? 'not found'}`);

  const content = await loadContent(supabase, (row as SessionRow).assessment_definition_id);
  const answers = await fetchAnswers(supabase, sessionId, content.questions);
  const { visible } = calculateVisibleQuestions(content.questions, answers);

  const incomplete = visible.some((q) => answers[q.question_key] === undefined);
  if (incomplete) throw new Error('Cannot complete an assessment with unanswered visible questions.');

  const completedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('unified_assessment_sessions')
    .update({
      status: 'completed',
      completed_at: completedAt,
      current_section_id: null,
      current_question_id: null,
      updated_at: completedAt,
    })
    .eq('id', sessionId)
    .select('*')
    .single();
  if (updateError || !updated) {
    throw new Error(`Failed to complete assessment session: ${updateError?.message ?? 'unknown error'}`);
  }

  const session = assembleSession(updated as SessionRow, content, answers);
  const events: RuntimeEvent[] = [{ type: 'assessment_completed', sessionId }];

  // Best-effort, non-throwing — same discipline as store.ts's
  // completeAssessment registry-publish step.
  try {
    const findings = deriveFindings(visible, answers);
    const publishedCount = await publishUnifiedAssessmentFindings(
      supabase,
      (updated as SessionRow).member_id,
      sessionId,
      findings
    );
    events.push({ type: 'findings_published', sessionId, count: publishedCount });
  } catch (err) {
    console.error('publishUnifiedAssessmentFindings failed', err);
  }

  return { session, events };
}
