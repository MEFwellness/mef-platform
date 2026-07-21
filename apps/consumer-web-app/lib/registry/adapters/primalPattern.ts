/**
 * Universal Registry adapter — Primal Pattern Diet Type.
 *
 * Unlike the other two new adapters, a Primal Pattern result (polar /
 * variable / equatorial) is a classification, not a problem — there is no
 * "wrong" result, so this registers an `entry_kind: 'metric'` row (never
 * 'finding': no severity, per the registry's own entry_kind contract in
 * migration 40) rather than a finding. It exists so the Assessment
 * Relationships / recommendation layer and the Pattern Timeline can see
 * "this member has a completed Primal Pattern classification" as a real
 * registry fact, same as every other assessment, without inventing a
 * severity that doesn't apply here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrimalPatternResult } from '../../primal-pattern/types';
import { insertRegistryEntry, findActiveRegistryEntry } from '../data';
import type { RegistryEntryDraft } from '../types';

const RESULT_LABEL: Record<PrimalPatternResult, string> = {
  polar: 'Polar Diet Type',
  variable: 'Variable Diet Type',
  equatorial: 'Equatorial Diet Type',
};

export async function upsertRegistryEntryFromPrimalPatternAttempt(
  supabase: SupabaseClient,
  memberId: string,
  assessmentId: string,
  result: PrimalPatternResult,
  aCount: number,
  bCount: number
): Promise<void> {
  const code = 'primal_pattern_type';
  const existing = await findActiveRegistryEntry(supabase, memberId, 'nutrition', code);
  if (existing && existing.source_record_id === assessmentId) return;

  const draft: RegistryEntryDraft = {
    entry_kind: 'metric',
    domain: 'nutrition',
    code,
    label: RESULT_LABEL[result],
    severity: null,
    numeric_value: aCount - bCount,
    unit: 'a_minus_b_count',
    confidence: 0.7,
    narrative: `Classified as ${RESULT_LABEL[result]} on the latest attempt.`,
    evidence_refs: [{ type: 'primal_pattern_assessment', id: assessmentId }],
    source_feature: 'primal_pattern_classification',
    source_record_id: assessmentId,
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    trend_status: null, // a classification, not a finding — no trend to track
    recorded_at: new Date().toISOString(),
  };

  await insertRegistryEntry(supabase, memberId, draft, { supersedesId: existing?.id ?? null });
}
