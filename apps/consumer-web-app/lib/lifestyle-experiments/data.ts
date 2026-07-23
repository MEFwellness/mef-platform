/**
 * Database access for Lifestyle Experiments (lifestyle_experiments,
 * migration 92) — pure functions taking a SupabaseClient, RLS decides who
 * may read/write what. Same shape as lib/reassessment-intelligence/data.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LifestyleExperiment, LifestyleExperimentOutcome } from './types';
import { deriveEffectiveStatus, MAX_ACTIVE_EXPERIMENTS } from './lifecycle';

type Row = {
  id: string;
  member_id: string;
  recommendation_id: string | null;
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

/** Effective-status-aware count (an 'expired_no_reflection' experiment never counts as active — it stopped tracking, whether or not the member has closed it out yet) — the single count both the cap enforcement and the Root Router's adaptive context read. */
export async function countActiveExperiments(
  supabase: SupabaseClient,
  memberId: string
): Promise<number> {
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
