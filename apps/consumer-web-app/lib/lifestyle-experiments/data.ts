/**
 * Database access for Lifestyle Experiments (lifestyle_experiments,
 * migration 92) — pure functions taking a SupabaseClient, RLS decides who
 * may read/write what. Same shape as lib/reassessment-intelligence/data.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LifestyleExperiment, LifestyleExperimentOutcome } from './types';
import { deriveEffectiveStatus, isExperimentOverdue, MAX_ACTIVE_EXPERIMENTS } from './lifecycle';

type Row = {
  id: string;
  member_id: string;
  recommendation_id: string | null;
  source_session_id: string | null;
  source_experience_key: string | null;
  day7_acknowledged_at: string | null;
  title: string;
  protocol: string;
  start_date: string;
  duration_days: number;
  status: string;
  reflection_text: string | null;
  outcome: string | null;
  closed_at: string | null;
  created_at: string;
};

function fromRow(row: Row): LifestyleExperiment {
  return {
    id: row.id,
    memberId: row.member_id,
    recommendationId: row.recommendation_id,
    sourceSessionId: row.source_session_id,
    sourceExperienceKey: row.source_experience_key,
    day7AcknowledgedAt: row.day7_acknowledged_at,
    title: row.title,
    protocol: row.protocol,
    startDate: row.start_date,
    durationDays: row.duration_days,
    status: row.status as LifestyleExperiment['status'],
    reflectionText: row.reflection_text,
    outcome: row.outcome as LifestyleExperiment['outcome'],
    closedAt: row.closed_at,
    createdAt: row.created_at,
  };
}

export async function startLifestyleExperiment(
  supabase: SupabaseClient,
  memberId: string,
  params: {
    recommendationId: string | null;
    title: string;
    protocol: string;
    startDate: string;
    durationDays: number;
    sourceSessionId?: string | null;
    sourceExperienceKey?: string | null;
  }
): Promise<LifestyleExperiment | null> {
  // Defensive re-check (Prompt 12, Part 3 guardrail) — the primary,
  // user-facing check lives in the action layer
  // (app/actions/lifestyleExperiments.ts::startMyExperiment), same "app
  // layer, never RLS" posture migration 91's own comment establishes for
  // this codebase's cross-row business-rule guardrails. This one exists so
  // no future caller can bypass the cap by skipping the action layer.
  const activeCount = await countActiveExperiments(supabase, memberId);
  if (activeCount >= MAX_ACTIVE_EXPERIMENTS) {
    console.error('startLifestyleExperiment refused — active experiment cap reached', memberId);
    return null;
  }

  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .insert({
      member_id: memberId,
      recommendation_id: params.recommendationId,
      source_session_id: params.sourceSessionId ?? null,
      source_experience_key: params.sourceExperienceKey ?? null,
      title: params.title,
      protocol: params.protocol,
      start_date: params.startDate,
      duration_days: params.durationDays,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    console.error('startLifestyleExperiment failed', error);
    return null;
  }
  return fromRow(data as Row);
}

export async function closeLifestyleExperiment(
  supabase: SupabaseClient,
  memberId: string,
  experimentId: string,
  params: { reflectionText: string; outcome: LifestyleExperimentOutcome; abandoned?: boolean }
): Promise<boolean> {
  const { error } = await supabase
    .from('lifestyle_experiments')
    .update({
      status: params.abandoned ? 'abandoned' : 'completed',
      reflection_text: params.reflectionText,
      outcome: params.outcome,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', experimentId)
    .eq('member_id', memberId);

  if (error) {
    console.error('closeLifestyleExperiment failed', error);
    return false;
  }
  return true;
}

/** Core Values Snapshot's day-7 "Got it" tap — the one thing that lets the day-7 reflection resolve and stop reappearing (on the dashboard and on the experiment page alike), the same role day3_response already plays for day 3. */
export async function markDay7Acknowledged(
  supabase: SupabaseClient,
  memberId: string,
  experimentId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('lifestyle_experiments')
    .update({ day7_acknowledged_at: new Date().toISOString() })
    .eq('id', experimentId)
    .eq('member_id', memberId);

  if (error) {
    console.error('markDay7Acknowledged failed', error);
    return false;
  }
  return true;
}

/**
 * Persists the read-time "past day 7 with no reflection" derivation
 * (lifecycle.ts's deriveEffectiveStatus) back onto the actual row, instead
 * of only ever recomputing it in memory. Real bug this fixes: a stray
 * 'active' row (started once during testing, or from any source, and never
 * revisited) went on counting against MAX_ACTIVE_EXPERIMENTS forever, even
 * long after its own 7-day window closed, because nothing ever wrote its
 * status back to 'expired_no_reflection' — the in-memory recompute in
 * countActiveExperiments already excluded it from that one count, but nothing
 * ever exposed it as expired anywhere else. Called at the top of every read
 * path below so any overdue row self-heals the moment anyone next looks,
 * with no cron required.
 */
export async function expireOverdueExperiments(supabase: SupabaseClient, memberId: string): Promise<void> {
  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('id, start_date, duration_days')
    .eq('member_id', memberId)
    .eq('status', 'active');

  if (error || !data || data.length === 0) return;

  const now = new Date();
  const overdueIds = (data as { id: string; start_date: string; duration_days: number }[])
    .filter((row) => isExperimentOverdue({ status: 'active', startDate: row.start_date, durationDays: row.duration_days }, now))
    .map((row) => row.id);

  if (overdueIds.length === 0) return;

  const { error: updateError } = await supabase
    .from('lifestyle_experiments')
    .update({ status: 'expired_no_reflection', updated_at: new Date().toISOString() })
    .in('id', overdueIds);

  if (updateError) console.error('expireOverdueExperiments failed', updateError);
}

/** Effective-status-aware count (an 'expired_no_reflection' experiment never counts as active — it stopped tracking, whether or not the member has closed it out yet) — the single count both the cap enforcement and the Root Router's adaptive context read. */
export async function countActiveExperiments(
  supabase: SupabaseClient,
  memberId: string
): Promise<number> {
  await expireOverdueExperiments(supabase, memberId);

  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('status, start_date, duration_days')
    .eq('member_id', memberId)
    .eq('status', 'active');

  if (error) {
    console.error('countActiveExperiments failed', error);
    return 0;
  }

  const now = new Date();
  return (data as { status: string; start_date: string; duration_days: number }[]).filter(
    (row) =>
      deriveEffectiveStatus(
        { status: row.status as LifestyleExperiment['status'], startDate: row.start_date, durationDays: row.duration_days },
        now
      ) === 'active'
  ).length;
}

export async function listMyLifestyleExperiments(
  supabase: SupabaseClient,
  memberId: string
): Promise<LifestyleExperiment[]> {
  await expireOverdueExperiments(supabase, memberId);

  const { data, error } = await supabase
    .from('lifestyle_experiments')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('listMyLifestyleExperiments failed', error);
    return [];
  }
  return (data as Row[]).map(fromRow);
}
