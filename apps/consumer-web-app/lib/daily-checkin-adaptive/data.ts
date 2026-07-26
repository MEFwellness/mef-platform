/**
 * Daily check-in adaptive picker — database access. Pure functions taking
 * a SupabaseClient, RLS decides who may read/write what, same shape as
 * every other data.ts in this codebase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Rule } from '../adaptive-assessment-engine/types';
import type { DriverProbeQuestion, ProbeOption, ProbeResponseType, ProbeScreen, ProbeStorage } from './types';

type DriverProbeQuestionRow = {
  question_key: string;
  driver_id: string | null;
  prompt: string;
  response_type: ProbeResponseType;
  options: unknown;
  storage: ProbeStorage;
  daily_checkins_column: string | null;
  wearable_metric_code: string | null;
  requires: unknown;
  excludes: unknown;
  priority: number;
  active: boolean;
  screen: ProbeScreen;
};

function fromRow(row: DriverProbeQuestionRow): DriverProbeQuestion {
  return {
    questionKey: row.question_key,
    driverId: row.driver_id,
    prompt: row.prompt,
    responseType: row.response_type,
    options: Array.isArray(row.options) ? (row.options as ProbeOption[]) : [],
    storage: row.storage,
    dailyCheckinsColumn: row.daily_checkins_column,
    wearableMetricCode: row.wearable_metric_code,
    requires: Array.isArray(row.requires) ? (row.requires as Rule[]) : [],
    excludes: Array.isArray(row.excludes) ? (row.excludes as Rule[]) : [],
    priority: row.priority,
    active: row.active,
    screen: row.screen,
  };
}

/** Every active rotating-probe bank row (driver_probe_questions, migration 106) — reference data, not member data. Editable with a plain insert/update, no deploy. */
export async function listActiveDriverProbeQuestions(supabase: SupabaseClient): Promise<DriverProbeQuestion[]> {
  const { data, error } = await supabase.from('driver_probe_questions').select('*').eq('active', true);

  if (error) {
    console.error('listActiveDriverProbeQuestions failed', error);
    return [];
  }
  return (data as DriverProbeQuestionRow[]).map(fromRow);
}

/** The most recent local_date each question_key was included in this member's check-in plan (any date, not just today) — what scoring.ts's recencyFactor reads. */
export async function lastAskedDatesForMember(
  supabase: SupabaseClient,
  memberId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('member_daily_probe_selections')
    .select('question_key, local_date')
    .eq('member_id', memberId)
    .order('local_date', { ascending: false });

  if (error) {
    console.error('lastAskedDatesForMember failed', error);
    return new Map();
  }

  const byQuestion = new Map<string, string>();
  for (const row of data as { question_key: string; local_date: string }[]) {
    // Rows arrive newest-first; keep only the first (most recent) date seen per key.
    if (!byQuestion.has(row.question_key)) byQuestion.set(row.question_key, row.local_date);
  }
  return byQuestion;
}

type SelectionKind = 'fixed_core' | 'rotating_probe';

/** Whatever plan was already recorded for this exact (member, date) — a repeat visit the same day must see the same plan, never a re-roll. Returns null when nothing has been recorded for that date yet. */
export async function existingPlanSelections(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<{ questionKey: string; kind: SelectionKind }[] | null> {
  const { data, error } = await supabase
    .from('member_daily_probe_selections')
    .select('question_key, kind')
    .eq('member_id', memberId)
    .eq('local_date', localDate);

  if (error) {
    console.error('existingPlanSelections failed', error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return (data as { question_key: string; kind: SelectionKind }[]).map((row) => ({
    questionKey: row.question_key,
    kind: row.kind,
  }));
}

/** Persists exactly which questions today's plan included — the recency read above, and the audit trail the "core is never excluded" test inspects. Idempotent: re-recording the same day's plan is a no-op via ON CONFLICT. */
export async function recordPlanSelections(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  selections: { questionKey: string; kind: SelectionKind }[]
): Promise<void> {
  if (selections.length === 0) return;
  const { error } = await supabase.from('member_daily_probe_selections').upsert(
    selections.map((s) => ({
      member_id: memberId,
      local_date: localDate,
      question_key: s.questionKey,
      kind: s.kind,
    })),
    { onConflict: 'member_id,local_date,question_key' }
  );
  if (error) console.error('recordPlanSelections failed', error);
}

/** Local follow-up answers with no dedicated daily_checkins column (e.g. pain location/aggravating factor). */
export async function upsertProbeAnswer(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  questionKey: string,
  value: unknown
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('daily_checkin_probe_answers').upsert(
    {
      member_id: memberId,
      local_date: localDate,
      question_key: questionKey,
      value,
    },
    { onConflict: 'member_id,local_date,question_key' }
  );
  return { error: error?.message ?? null };
}

export async function listProbeAnswersForDate(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<Map<string, unknown>> {
  const { data, error } = await supabase
    .from('daily_checkin_probe_answers')
    .select('question_key, value')
    .eq('member_id', memberId)
    .eq('local_date', localDate);

  if (error) {
    console.error('listProbeAnswersForDate failed', error);
    return new Map();
  }
  return new Map((data as { question_key: string; value: unknown }[]).map((row) => [row.question_key, row.value]));
}
