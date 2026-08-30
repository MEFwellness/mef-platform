/**
 * Coach Member Detail: the reads.
 *
 * AUTHORIZATION IS NOT REIMPLEMENTED HERE, AND THAT IS DELIBERATE. Every
 * query below runs through the CALLER'S own Supabase client, so row level
 * security decides what comes back. A coach reads a member only because
 * `is_active_coach_for` says she is assigned to him; a member reading anyone
 * but herself gets no rows; a signed-out visitor never reaches this file at
 * all because middleware.ts redirects /coach before the route renders. There
 * is no service-role client in this module and no second definition of who
 * may see what. If this file had a bug, Postgres would still refuse the read.
 *
 * NOTHING IS COMPUTED. Every function returns rows as the member left them.
 * No scoring, no averaging, no correlation, no inference, no model. The one
 * transformation applied anywhere is turning a stored value back into the
 * question she was asked and the words she chose, which lives in ./present.ts
 * and is pure.
 *
 * EACH SECTION FAILS ALONE. A section that cannot be read returns
 * `{ available: false, reason }`, never an empty list. An empty section and a
 * broken section are different facts, and a coach told "no check-ins" when
 * the truth is "the check-in read failed" has been misinformed about her
 * member.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { ruleSatisfied } from '../adaptive-assessment-engine/select';
import type { AnsweredMap, Rule } from '../adaptive-assessment-engine/types';
import { answeredMapForDay } from '../daily-checkin-adaptive/answeredMap';
import {
  anyAnswered,
  checkinAnswers,
  goalLabel,
  goalLabels,
  goalSourceLabel,
  probeAnswer,
  readinessAnswers,
  sortGoalsNewestFirst,
} from './present';
import type {
  CheckinEntry,
  CompletedSubmission,
  ConversationSessionEntry,
  GoalEntry,
  MemberEntries,
  SectionResult,
} from './types';

/** How far back the day-by-day reads go by default. Wide enough to hold a full coaching block, bounded so one member cannot pull an unbounded history into a page render. */
export const DEFAULT_ENTRY_DAYS = 90;

/** Hard ceiling on check-in days read in one request, whatever the range asks for. */
export const MAX_ENTRY_DAYS = 365;

/**
 * Only an absent or unreadable value falls back to the default. A number that
 * was genuinely asked for is clamped into range instead, so `?days=0` reads
 * one day rather than silently becoming ninety: a nonsense request should be
 * corrected to the nearest real answer, not answered with a different
 * question.
 */
export function clampDays(requested: number | null | undefined): number {
  if (requested === null || requested === undefined || !Number.isFinite(requested)) {
    return DEFAULT_ENTRY_DAYS;
  }
  return Math.min(Math.max(Math.trunc(requested), 1), MAX_ENTRY_DAYS);
}

function shiftDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return shifted.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------

/**
 * Was this follow-up one she was actually put that day?
 *
 * The same eligibility rules the check-in screen itself uses
 * (lib/daily-checkin-adaptive/localFollowUps.ts), replayed against what she
 * had answered that day, so the history and the screen she saw cannot
 * disagree about which questions existed. A question with no rules at all
 * was always applicable.
 */
function wasApplicable(
  definition: { requires: Rule[]; excludes: Rule[] },
  answered: AnsweredMap
): boolean {
  if (definition.requires.length > 0 && !definition.requires.every((rule) => ruleSatisfied(rule, answered))) {
    return false;
  }
  return !definition.excludes.some((rule) => ruleSatisfied(rule, answered));
}

/**
 * Her check-in history, newest first, with the adaptive driver answers for
 * each day attached to that day.
 *
 * `daily_checkins_current` is the existing view that returns the highest
 * version row per day, so an edited check-in shows what she last said rather
 * than both versions. The probe answers are read in one query for the whole
 * range and grouped in memory rather than one query per day.
 */
export async function readCheckins(
  supabase: SupabaseClient,
  memberId: string,
  start: string,
  end: string
): Promise<SectionResult<CheckinEntry>> {
  const { data: checkinRows, error: checkinError } = await supabase
    .from('daily_checkins_current')
    .select('*')
    .eq('user_id', memberId)
    .gte('local_date', start)
    .lte('local_date', end)
    .order('local_date', { ascending: false });

  if (checkinError) {
    return { available: false, reason: checkinError.message };
  }

  const checkins = (checkinRows ?? []) as DailyCheckin[];
  if (checkins.length === 0) return { available: true, items: [] };

  // The question bank, so an answer can be shown against the question she was
  // actually asked. Read from the same table the check-in screen renders
  // from, so a question edited by /coach/questions cannot be labelled one way
  // to her and another way to her coach.
  const { data: probeRows } = await supabase
    .from('daily_checkin_probe_answers')
    .select('local_date, question_key, value')
    .eq('member_id', memberId)
    .gte('local_date', start)
    .lte('local_date', end);

  const questionKeys = [...new Set((probeRows ?? []).map((row) => row.question_key as string))];
  const questions = new Map<
    string,
    { prompt: string; responseType: string; options: unknown; requires: Rule[]; excludes: Rule[] }
  >();
  if (questionKeys.length > 0) {
    const { data: questionRows } = await supabase
      .from('driver_probe_questions')
      .select('question_key, prompt, response_type, options, requires, excludes')
      .in('question_key', questionKeys);
    for (const row of questionRows ?? []) {
      questions.set(row.question_key as string, {
        prompt: row.prompt as string,
        responseType: row.response_type as string,
        options: row.options,
        requires: Array.isArray(row.requires) ? (row.requires as Rule[]) : [],
        excludes: Array.isArray(row.excludes) ? (row.excludes as Rule[]) : [],
      });
    }
  }

  // What she answered that day, in the shape a follow-up's own rules read,
  // so this screen can tell "she skipped it" apart from "she was never
  // asked it". Both halves matter: a rule can name a probe answer
  // (checkin_probe.digestion_rating) or a fixed-core column
  // (checkin_probe.pain_discomfort_level).
  const probeValuesByDate = new Map<string, [string, unknown][]>();
  for (const row of probeRows ?? []) {
    const date = row.local_date as string;
    const existing = probeValuesByDate.get(date) ?? [];
    existing.push([row.question_key as string, row.value]);
    probeValuesByDate.set(date, existing);
  }

  const checkinByDate = new Map<string, DailyCheckin>();
  for (const checkin of checkins) checkinByDate.set(checkin.local_date, checkin);

  const probesByDate = new Map<string, CheckinEntry['probeAnswers']>();
  for (const [date, values] of probeValuesByDate) {
    const answered = answeredMapForDay(
      (checkinByDate.get(date) ?? null) as Record<string, unknown> | null,
      values
    );

    for (const [key, stored] of values) {
      const definition = questions.get(key);
      const answer = probeAnswer(stored, {
        responseType: definition?.responseType ?? 'unknown',
        options: definition?.options ?? [],
      });

      // A follow-up she was never asked is left out entirely, not listed as
      // "Not answered". Found live on 2026-08-30: "Where is it, mainly?"
      // sat in a coach's history on a day the member had reported no pain
      // at all, because the check-in writes an empty answer to clear any
      // location she had picked earlier the same day. A row that was never
      // applicable AND says nothing was never a question she skipped.
      // Something she did answer is always kept, whatever the rules say
      // about it now, because it is still something she entered.
      if (answer === null && definition && !wasApplicable(definition, answered)) continue;

      const existing = probesByDate.get(date) ?? [];
      existing.push({
        key,
        // A question that has since been deleted from the bank still had an
        // answer given to it, so the answer is kept and the key stands in for
        // the prompt rather than the whole row being dropped.
        question: definition?.prompt ?? key,
        answer,
      });
      probesByDate.set(date, existing);
    }
  }

  const items: CheckinEntry[] = checkins.map((checkin) => {
    const readiness = readinessAnswers(checkin);
    return {
      localDate: checkin.local_date,
      recordedAt: checkin.recorded_at,
      editedAt: checkin.edited_at,
      answers: checkinAnswers(checkin),
      readiness: anyAnswered(readiness) ? readiness : [],
      probeAnswers: (probesByDate.get(checkin.local_date) ?? []).sort((a, b) =>
        a.question.localeCompare(b.question)
      ),
      note: checkin.optional_notes,
      flaggedNewOrWorseningConcern: checkin.new_or_worsening_concern === true,
    };
  });

  return { available: true, items };
}

// ---------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------

/**
 * Everything she has ever stated as a goal, newest first.
 *
 * The table is insert-only (migration 104), so a changed goal is a new row
 * and the earlier one is not stale data to hide: it is what she used to say,
 * and a coach seeing a goal change is seeing something real.
 *
 * Reachable by a coach only since migration 158, which added the assigned
 * coach read policy this query depends on.
 */
export async function readGoals(
  supabase: SupabaseClient,
  memberId: string
): Promise<SectionResult<GoalEntry>> {
  const { data, error } = await supabase
    .from('member_goal_selections')
    .select('id, goals, primary_goal, goals_other, source, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) return { available: false, reason: error.message };

  const items: GoalEntry[] = (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    goals: goalLabels(Array.isArray(row.goals) ? (row.goals as unknown[]).map(String) : []),
    primaryGoal: goalLabel((row.primary_goal as string | null) ?? null),
    goalsOther: (row.goals_other as string | null) ?? null,
    source: goalSourceLabel(row.source as string),
  }));

  return { available: true, items: sortGoalsNewestFirst(items) };
}

// ---------------------------------------------------------------------
// Completed questionnaires and experiences
// ---------------------------------------------------------------------

/**
 * What she has finished, newest first, as a list of links rather than a
 * second rendering of her answers.
 *
 * DELIBERATELY NOT DUPLICATED. Every kind below already has a coach reader
 * that renders her real answers in full, most of them built around the
 * questionnaire's own definition. Re-rendering those answers here would mean
 * two places that must agree about what a question was and what an answer
 * meant, and they would eventually not. So this section answers "what has she
 * completed, and when" and hands off to the existing screen for "what did she
 * say".
 */
export async function readSubmissions(
  supabase: SupabaseClient,
  memberId: string
): Promise<SectionResult<CompletedSubmission>> {
  const items: CompletedSubmission[] = [];

  const { data: onboarding, error: onboardingError } = await supabase
    .from('onboarding_submissions')
    .select('id, submitted_at, assessment_type')
    .eq('user_id', memberId)
    .order('submitted_at', { ascending: false });

  if (onboardingError) return { available: false, reason: onboardingError.message };

  for (const row of onboarding ?? []) {
    const type = (row.assessment_type as string | null) ?? 'baseline';
    items.push({
      id: row.id as string,
      title: type === 'reassessment' ? 'Health Check-In Questionnaire, repeated' : 'Health Check-In Questionnaire',
      kind: 'Questionnaire',
      completedAt: row.submitted_at as string,
      href: `/coach/clients/${memberId}/assessments/${row.id}`,
    });
  }

  // Every guided experience lives in one table, keyed to its definition, so
  // this is one query rather than one per experience and a new experience
  // appears here the day it is published without this file changing. The
  // definition's `key` is also its coach route segment, which is why the
  // link can be built without a second lookup table of paths.
  const { data: sessions, error: sessionError } = await supabase
    .from('unified_assessment_sessions')
    .select('id, completed_at, unified_assessment_definitions!inner(key, title)')
    .eq('member_id', memberId)
    .eq('status', 'completed')
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false });

  if (sessionError) return { available: false, reason: sessionError.message };

  for (const row of sessions ?? []) {
    const definition = row.unified_assessment_definitions as unknown as
      | { key: string; title: string }
      | { key: string; title: string }[]
      | null;
    const resolved = Array.isArray(definition) ? definition[0] : definition;
    if (!resolved) continue;
    items.push({
      id: row.id as string,
      title: resolved.title,
      kind: 'Experience',
      completedAt: row.completed_at as string,
      href: `/coach/clients/${memberId}/${resolved.key}/${row.id}`,
    });
  }

  items.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return { available: true, items };
}

// ---------------------------------------------------------------------
// Conversations with Root
// ---------------------------------------------------------------------

/**
 * Her conversations with Root, newest session first and newest message first
 * inside each.
 *
 * Only what was actually said. `member_visible` false and archived messages
 * are excluded because they were never part of the conversation she had, and
 * showing a coach a message his member never saw would misrepresent it.
 */
export async function readConversations(
  supabase: SupabaseClient,
  memberId: string,
  limitSessions = 10
): Promise<SectionResult<ConversationSessionEntry>> {
  const { data: sessions, error: sessionError } = await supabase
    .from('conversation_sessions')
    .select('id, started_at')
    .eq('member_id', memberId)
    .order('started_at', { ascending: false })
    .limit(limitSessions);

  if (sessionError) return { available: false, reason: sessionError.message };
  if ((sessions ?? []).length === 0) return { available: true, items: [] };

  const sessionIds = (sessions ?? []).map((session) => session.id as string);
  const { data: messages, error: messageError } = await supabase
    .from('conversation_messages')
    .select('id, session_id, role, content, created_at')
    .in('session_id', sessionIds)
    .eq('member_visible', true)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  if (messageError) return { available: false, reason: messageError.message };

  const bySession = new Map<string, ConversationSessionEntry['messages']>();
  for (const row of messages ?? []) {
    const sessionId = row.session_id as string;
    const existing = bySession.get(sessionId) ?? [];
    const role = row.role as string;
    existing.push({
      id: row.id as string,
      sessionId,
      // 'system' rows are not part of the conversation either side had, so
      // anything that is not hers is attributed to Root rather than invented
      // a third speaker for.
      role: role === 'member' ? 'member' : 'root',
      content: row.content as string,
      createdAt: row.created_at as string,
    });
    bySession.set(sessionId, existing);
  }

  const items: ConversationSessionEntry[] = (sessions ?? []).map((session) => ({
    id: session.id as string,
    startedAt: session.started_at as string,
    messages: bySession.get(session.id as string) ?? [],
  }));

  return { available: true, items };
}

// ---------------------------------------------------------------------
// The whole page
// ---------------------------------------------------------------------

export async function readMemberEntries(
  supabase: SupabaseClient,
  memberId: string,
  options: { displayName: string | null; today: string; days?: number }
): Promise<MemberEntries> {
  const days = clampDays(options.days);
  const end = options.today;
  const start = shiftDate(end, -(days - 1));

  const [checkins, submissions, goals, conversations] = await Promise.all([
    readCheckins(supabase, memberId, start, end),
    readSubmissions(supabase, memberId),
    readGoals(supabase, memberId),
    readConversations(supabase, memberId),
  ]);

  return {
    memberId,
    displayName: options.displayName,
    checkins,
    submissions,
    goals,
    conversations,
    range: { start, end, days },
  };
}
