/**
 * Database access for Lifestyle Experiments (lifestyle_experiments,
 * migration 92) — pure functions taking a SupabaseClient, RLS decides who
 * may read/write what. Same shape as lib/reassessment-intelligence/data.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LifestyleExperiment, LifestyleExperimentOutcome } from './types';

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
