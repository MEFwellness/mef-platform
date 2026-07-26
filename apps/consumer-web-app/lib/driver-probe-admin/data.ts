/**
 * Coach question-bank management — database access. Pure functions
 * taking a SupabaseClient; RLS decides who may write what (migration
 * 110 adds coach insert/update — never delete — on top of migration
 * 106's platform_admin-only policy). Every write here also inserts a
 * driver_probe_question_revisions row in the same call, under the same
 * caller-scoped client, so `changed_by` is always a real RLS-verified
 * auth.uid(), never a client-supplied value.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { FIXED_CORE_QUESTION_KEYS } from '../daily-checkin-adaptive/constants';
import type { DisplayStyle, DriverProbeQuestion, ProbeOption, ProbeResponseType, ProbeScreen } from '../daily-checkin-adaptive/types';
import type { CreateQuestionInput, QuestionWithStats, RevisionEntry, UpdateQuestionInput, UpdateQuestionResult } from './types';
import { isValidQuestionKey } from './slug';

/** The fixed set of real daily_checkins columns any driver_probe_questions row can point at (storage='daily_checkins_column') — every one of them predates this admin screen (migrations 63/106/109) and none can be created fresh from here; a coach-created question is always storage='probe_answer'. */
const DAILY_CHECKINS_PROBE_COLUMNS = [
  'night_waking_count',
  'night_sweats',
  'bowel_movement_status',
  'digestion_rating',
  'movement_today',
  'morning_soreness',
] as const;

type QuestionRow = {
  question_key: string;
  driver_id: string | null;
  prompt: string;
  response_type: ProbeResponseType;
  options: unknown;
  storage: 'daily_checkins_column' | 'probe_answer';
  daily_checkins_column: string | null;
  wearable_metric_code: string | null;
  requires: unknown;
  excludes: unknown;
  priority: number;
  active: boolean;
  screen: ProbeScreen;
  display_style: DisplayStyle | null;
};

function fromRow(row: QuestionRow): DriverProbeQuestion {
  return {
    questionKey: row.question_key,
    driverId: row.driver_id,
    prompt: row.prompt,
    responseType: row.response_type,
    options: Array.isArray(row.options) ? (row.options as ProbeOption[]) : [],
    storage: row.storage,
    dailyCheckinsColumn: row.daily_checkins_column,
    wearableMetricCode: row.wearable_metric_code,
    requires: Array.isArray(row.requires) ? (row.requires as DriverProbeQuestion['requires']) : [],
    excludes: Array.isArray(row.excludes) ? (row.excludes as DriverProbeQuestion['excludes']) : [],
    priority: row.priority,
    active: row.active,
    screen: row.screen,
    displayStyle: row.display_style ?? null,
  };
}

/** Every question — active AND retired, since the list screen shows retired ones in a de-emphasized group rather than hiding them. */
export async function listAllQuestions(supabase: SupabaseClient): Promise<DriverProbeQuestion[]> {
  const { data, error } = await supabase.from('driver_probe_questions').select('*').order('question_key');
  if (error) {
    console.error('listAllQuestions failed', error);
    return [];
  }
  return (data as QuestionRow[]).map(fromRow);
}

async function askedCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('member_daily_probe_selections')
    .select('question_key')
    .eq('kind', 'rotating_probe');
  if (error) {
    console.error('askedCounts failed', error);
    return new Map();
  }
  const counts = new Map<string, number>();
  for (const row of data as { question_key: string }[]) {
    counts.set(row.question_key, (counts.get(row.question_key) ?? 0) + 1);
  }
  return counts;
}

async function probeAnswerCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('daily_checkin_probe_answers').select('question_key');
  if (error) {
    console.error('probeAnswerCounts failed', error);
    return new Map();
  }
  const counts = new Map<string, number>();
  for (const row of data as { question_key: string }[]) {
    counts.set(row.question_key, (counts.get(row.question_key) ?? 0) + 1);
  }
  return counts;
}

/** One count per real daily_checkins column this table can point at — a single row scan, not one query per column. */
async function dailyCheckinsColumnAnsweredCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('daily_checkins')
    .select(DAILY_CHECKINS_PROBE_COLUMNS.join(','));
  if (error) {
    console.error('dailyCheckinsColumnAnsweredCounts failed', error);
    return new Map();
  }
  const counts = new Map<string, number>();
  for (const column of DAILY_CHECKINS_PROBE_COLUMNS) counts.set(column, 0);
  for (const row of data as unknown as Record<string, unknown>[]) {
    for (const column of DAILY_CHECKINS_PROBE_COLUMNS) {
      if (row[column] !== null && row[column] !== undefined) {
        counts.set(column, (counts.get(column) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Every question plus how often it's been shown and answered — the data the list screen's "never asked yet" filter and per-row stats read. */
export async function listQuestionsWithStats(supabase: SupabaseClient): Promise<QuestionWithStats[]> {
  const [questions, asked, probeAnswered, columnAnswered] = await Promise.all([
    listAllQuestions(supabase),
    askedCounts(supabase),
    probeAnswerCounts(supabase),
    dailyCheckinsColumnAnsweredCounts(supabase),
  ]);

  return questions.map((question) => ({
    ...question,
    // Local follow-ups (driver_id null) are never recorded into
    // member_daily_probe_selections by design (see probeBank.ts) — asked
    // count is genuinely untracked for them, not zero.
    askedCount: question.driverId === null ? null : (asked.get(question.questionKey) ?? 0),
    answeredCount:
      question.storage === 'daily_checkins_column'
        ? (columnAnswered.get(question.dailyCheckinsColumn ?? '') ?? 0)
        : (probeAnswered.get(question.questionKey) ?? 0),
  }));
}

async function answeredCountFor(supabase: SupabaseClient, question: DriverProbeQuestion): Promise<number> {
  if (question.storage === 'daily_checkins_column' && question.dailyCheckinsColumn) {
    const { count, error } = await supabase
      .from('daily_checkins')
      .select('*', { count: 'exact', head: true })
      .not(question.dailyCheckinsColumn, 'is', null);
    if (error) {
      console.error('answeredCountFor (column) failed', error);
      return 0;
    }
    return count ?? 0;
  }
  const { count, error } = await supabase
    .from('daily_checkin_probe_answers')
    .select('*', { count: 'exact', head: true })
    .eq('question_key', question.questionKey);
  if (error) {
    console.error('answeredCountFor (probe_answer) failed', error);
    return 0;
  }
  return count ?? 0;
}

async function getQuestion(supabase: SupabaseClient, questionKey: string): Promise<DriverProbeQuestion | null> {
  const { data, error } = await supabase
    .from('driver_probe_questions')
    .select('*')
    .eq('question_key', questionKey)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as QuestionRow);
}

async function recordRevision(
  supabase: SupabaseClient,
  params: {
    questionKey: string;
    changeType: 'created' | 'updated' | 'retired' | 'restored';
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    changedBy: string;
  }
): Promise<void> {
  const { error } = await supabase.from('driver_probe_question_revisions').insert({
    question_key: params.questionKey,
    change_type: params.changeType,
    before: params.before,
    after: params.after,
    changed_by: params.changedBy,
  });
  if (error) console.error('recordRevision failed', error);
}

export async function listRevisions(supabase: SupabaseClient, questionKey: string): Promise<RevisionEntry[]> {
  const { data, error } = await supabase
    .from('driver_probe_question_revisions')
    .select('id, question_key, change_type, before, after, changed_by, changed_at')
    .eq('question_key', questionKey)
    .order('changed_at', { ascending: false });
  if (error) {
    console.error('listRevisions failed', error);
    return [];
  }
  type RevisionRow = {
    id: string;
    question_key: string;
    change_type: RevisionEntry['changeType'];
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    changed_by: string;
    changed_at: string;
  };
  const rows = data as RevisionRow[];

  // No direct FK from this table to `profiles` (only to auth.users, via
  // changed_by) for PostgREST to auto-embed — looked up separately and
  // merged here, same "fetch ids, fetch names, merge in JS" pattern
  // app/admin/AdminPanel.tsx already uses for coach/client display names.
  const changedByIds = [...new Set(rows.map((row) => row.changed_by))];
  const namesById = new Map<string, string>();
  if (changedByIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', changedByIds);
    for (const profile of (profileRows ?? []) as { id: string; display_name: string | null }[]) {
      if (profile.display_name) namesById.set(profile.id, profile.display_name);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    questionKey: row.question_key,
    changeType: row.change_type,
    before: row.before,
    after: row.after,
    changedBy: row.changed_by,
    changedByName: namesById.get(row.changed_by) ?? row.changed_by.slice(0, 8),
    changedAt: row.changed_at,
  }));
}

function rowSnapshot(question: DriverProbeQuestion): Record<string, unknown> {
  return {
    questionKey: question.questionKey,
    driverId: question.driverId,
    prompt: question.prompt,
    responseType: question.responseType,
    options: question.options,
    screen: question.screen,
    active: question.active,
  };
}

export async function createQuestion(
  supabase: SupabaseClient,
  input: CreateQuestionInput,
  coachId: string
): Promise<{ error: string | null }> {
  if (!isValidQuestionKey(input.questionKey)) {
    return { error: 'Question key must start with "checkin_probe." — adjust the wording so a valid key can be generated.' };
  }
  if ((FIXED_CORE_QUESTION_KEYS as readonly string[]).includes(input.questionKey)) {
    return { error: 'That key collides with a protected core question. Choose different wording.' };
  }
  const existing = await getQuestion(supabase, input.questionKey);
  if (existing) {
    return { error: 'A question with this key already exists. Adjust the wording or the key.' };
  }

  const { error } = await supabase.from('driver_probe_questions').insert({
    question_key: input.questionKey,
    driver_id: input.driverId,
    prompt: input.prompt,
    response_type: input.responseType,
    options: input.options,
    storage: 'probe_answer',
    daily_checkins_column: null,
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
    screen: input.screen,
  });
  if (error) return { error: error.message };

  await recordRevision(supabase, {
    questionKey: input.questionKey,
    changeType: 'created',
    before: null,
    after: { ...input },
    changedBy: coachId,
  });
  return { error: null };
}

/** response_type/options are locked once a question has at least one recorded answer — changing them would silently reinterpret every past answer's shape. Prompt/driver/screen stay editable regardless. */
export async function updateQuestion(
  supabase: SupabaseClient,
  questionKey: string,
  patch: UpdateQuestionInput,
  coachId: string
): Promise<UpdateQuestionResult> {
  if ((FIXED_CORE_QUESTION_KEYS as readonly string[]).includes(questionKey)) {
    return { ok: false, error: 'This is a protected core question and cannot be edited here.' };
  }
  const current = await getQuestion(supabase, questionKey);
  if (!current) return { ok: false, error: 'Question not found.' };

  const wantsShapeChange = patch.responseType !== undefined || patch.options !== undefined;
  if (wantsShapeChange) {
    const answered = await answeredCountFor(supabase, current);
    if (answered > 0) {
      return {
        ok: false,
        error: `This question already has ${answered} recorded answer${answered === 1 ? '' : 's'} — its answer type and choices are locked so past answers keep their meaning. Use "Retire and replace" to change the answer type instead.`,
        lockedFields: ['responseType', 'options'],
      };
    }
  }

  const update: Record<string, unknown> = {};
  if (patch.prompt !== undefined) update.prompt = patch.prompt;
  if (patch.driverId !== undefined) update.driver_id = patch.driverId;
  if (patch.screen !== undefined) update.screen = patch.screen;
  if (patch.responseType !== undefined) update.response_type = patch.responseType;
  if (patch.options !== undefined) update.options = patch.options;
  if (patch.requires !== undefined) update.requires = patch.requires;

  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from('driver_probe_questions').update(update).eq('question_key', questionKey);
  if (error) return { ok: false, error: error.message };

  await recordRevision(supabase, {
    questionKey,
    changeType: 'updated',
    before: rowSnapshot(current),
    after: rowSnapshot({ ...current, ...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}), ...(patch.driverId !== undefined ? { driverId: patch.driverId } : {}), ...(patch.screen !== undefined ? { screen: patch.screen } : {}), ...(patch.responseType !== undefined ? { responseType: patch.responseType } : {}), ...(patch.options !== undefined ? { options: patch.options } : {}) }),
    changedBy: coachId,
  });
  return { ok: true };
}

async function setActive(
  supabase: SupabaseClient,
  questionKey: string,
  active: boolean,
  coachId: string
): Promise<{ error: string | null }> {
  if ((FIXED_CORE_QUESTION_KEYS as readonly string[]).includes(questionKey)) {
    return { error: 'This is a protected core question and cannot be retired.' };
  }
  const current = await getQuestion(supabase, questionKey);
  if (!current) return { error: 'Question not found.' };

  const { error } = await supabase.from('driver_probe_questions').update({ active }).eq('question_key', questionKey);
  if (error) return { error: error.message };

  await recordRevision(supabase, {
    questionKey,
    changeType: active ? 'restored' : 'retired',
    before: rowSnapshot(current),
    after: rowSnapshot({ ...current, active }),
    changedBy: coachId,
  });
  return { error: null };
}

export async function retireQuestion(supabase: SupabaseClient, questionKey: string, coachId: string) {
  return setActive(supabase, questionKey, false, coachId);
}

export async function restoreQuestion(supabase: SupabaseClient, questionKey: string, coachId: string) {
  return setActive(supabase, questionKey, true, coachId);
}

/** "Retire and replace": for a question with recorded answers whose answer TYPE needs to change. Retires the old row (its historical answers keep meaning exactly as they were recorded) and inserts a fresh row with a new question_key pre-filled as a copy, so old and new answers are never mixed under one shape. */
export async function retireAndReplaceQuestion(
  supabase: SupabaseClient,
  questionKey: string,
  replacement: CreateQuestionInput,
  coachId: string
): Promise<{ error: string | null; newQuestionKey?: string }> {
  if ((FIXED_CORE_QUESTION_KEYS as readonly string[]).includes(questionKey)) {
    return { error: 'This is a protected core question and cannot be retired or replaced.' };
  }
  const current = await getQuestion(supabase, questionKey);
  if (!current) return { error: 'Question not found.' };

  const retireResult = await retireQuestion(supabase, questionKey, coachId);
  if (retireResult.error) return { error: retireResult.error };

  const { error: insertError } = await supabase.from('driver_probe_questions').insert({
    question_key: replacement.questionKey,
    driver_id: replacement.driverId,
    prompt: replacement.prompt,
    response_type: replacement.responseType,
    options: replacement.options,
    storage: 'probe_answer',
    daily_checkins_column: null,
    wearable_metric_code: null,
    requires: [],
    excludes: [],
    priority: 0,
    active: true,
    screen: replacement.screen,
    replaces_question_key: questionKey,
  });
  if (insertError) return { error: insertError.message };

  await recordRevision(supabase, {
    questionKey: replacement.questionKey,
    changeType: 'created',
    before: null,
    after: { ...replacement, replacesQuestionKey: questionKey },
    changedBy: coachId,
  });

  return { error: null, newQuestionKey: replacement.questionKey };
}
