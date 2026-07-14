/**
 * Database access for the MEF Intelligence Engine — mirrors
 * lib/intelligence/data.ts's shape exactly: pure functions taking a
 * SupabaseClient, RLS (migration 34) decides who may read/write what.
 * Inserts generate their own id and skip `.select()` after writing, same
 * defensive discipline as wellness_insights/narrative_items (this table's
 * SELECT policies don't always match what the inserting session is
 * allowed to write).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type {
  IntelligenceAlertStatus,
  IntelligenceCoachAlert,
  IntelligenceProfileSnapshot,
} from '@mef/shared-types-contracts';
import type { CoachAlertDraft, MemberIntelligenceReport } from './types';

export async function insertProfileSnapshot(
  supabase: SupabaseClient,
  memberId: string,
  report: MemberIntelligenceReport
): Promise<IntelligenceProfileSnapshot | null> {
  const id = randomUUID();

  const { error } = await supabase.from('intelligence_profile_snapshots').insert({
    id,
    member_id: memberId,
    local_date: report.localDate,
    engine_version: 'v1',
    longitudinal: report.longitudinalTrends,
    patterns: report.patterns,
    hypotheses: report.hypotheses,
    priorities: report.priorities,
    recommendations: report.recommendations,
    member_summary: report.memberSummary,
    alert_count: report.alerts.length,
  });

  if (error) {
    console.error('insertProfileSnapshot failed', error);
    return null;
  }

  return {
    id,
    member_id: memberId,
    local_date: report.localDate,
    engine_version: 'v1',
    longitudinal: report.longitudinalTrends,
    patterns: report.patterns,
    hypotheses: report.hypotheses,
    priorities: report.priorities,
    recommendations: report.recommendations,
    member_summary: report.memberSummary,
    alert_count: report.alerts.length,
    created_at: new Date().toISOString(),
  };
}

export async function listProfileSnapshots(
  supabase: SupabaseClient,
  memberId: string,
  limit = 30
): Promise<IntelligenceProfileSnapshot[]> {
  const { data, error } = await supabase
    .from('intelligence_profile_snapshots')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('listProfileSnapshots failed', error);
    return [];
  }
  return data as IntelligenceProfileSnapshot[];
}

const REOPENABLE_STATUSES: IntelligenceAlertStatus[] = ['open', 'acknowledged'];

async function findAlertByKey(
  supabase: SupabaseClient,
  memberId: string,
  alertKey: string
): Promise<IntelligenceCoachAlert | null> {
  const { data, error } = await supabase
    .from('intelligence_coach_alerts')
    .select('*')
    .eq('member_id', memberId)
    .eq('alert_key', alertKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('findAlertByKey failed', error);
    return null;
  }
  return data as IntelligenceCoachAlert | null;
}

async function insertAlert(
  supabase: SupabaseClient,
  memberId: string,
  draft: CoachAlertDraft
): Promise<void> {
  const { error } = await supabase.from('intelligence_coach_alerts').insert({
    id: randomUUID(),
    member_id: memberId,
    alert_type: draft.alertType,
    severity: draft.severity,
    title: draft.title,
    reason: draft.reason,
    alert_key: draft.alertKey,
    evidence_refs: draft.evidenceRefs,
    source_refs: draft.sourceRefs,
    status: 'open',
  });
  if (error) console.error('insertAlert failed', error);
}

/**
 * Dedup/reopen model, same "coach correction must stick" trust boundary
 * as wellness_insights' coach_context protection: an open/acknowledged
 * alert with the same key is simply touched (fresh reason/evidence, same
 * row — no duplicate alert spam on every recalculation); a dismissed
 * alert is left alone (the coach already said "not relevant," and
 * recalculation must never silently reverse that); a resolved alert (the
 * coach already handled it) allows a genuinely new occurrence to open a
 * fresh row, since resolution means "handled then," not "can never recur."
 */
export async function upsertCoachAlert(
  supabase: SupabaseClient,
  memberId: string,
  draft: CoachAlertDraft
): Promise<void> {
  const existing = await findAlertByKey(supabase, memberId, draft.alertKey);

  if (existing && REOPENABLE_STATUSES.includes(existing.status)) {
    const { error } = await supabase
      .from('intelligence_coach_alerts')
      .update({
        title: draft.title,
        reason: draft.reason,
        severity: draft.severity,
        evidence_refs: draft.evidenceRefs,
        source_refs: draft.sourceRefs,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) console.error('upsertCoachAlert touch failed', error);
    return;
  }

  if (existing?.status === 'dismissed') return; // protected — a coach's dismissal is never silently reopened

  await insertAlert(supabase, memberId, draft);
}

export async function listCoachAlertsForMember(
  supabase: SupabaseClient,
  memberId: string,
  options: { statusFilter?: IntelligenceAlertStatus[] } = {}
): Promise<IntelligenceCoachAlert[]> {
  let query = supabase
    .from('intelligence_coach_alerts')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (options.statusFilter && options.statusFilter.length > 0) {
    query = query.in('status', options.statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error('listCoachAlertsForMember failed', error);
    return [];
  }
  return data as IntelligenceCoachAlert[];
}

async function setAlertStatus(
  supabase: SupabaseClient,
  alertId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from('intelligence_coach_alerts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', alertId);
  if (error) {
    console.error('setAlertStatus failed', error);
    return false;
  }
  return true;
}

export async function acknowledgeCoachAlert(
  supabase: SupabaseClient,
  alertId: string,
  coachId: string
): Promise<boolean> {
  return setAlertStatus(supabase, alertId, {
    status: 'acknowledged',
    acknowledged_by: coachId,
    acknowledged_at: new Date().toISOString(),
  });
}

export async function resolveCoachAlert(
  supabase: SupabaseClient,
  alertId: string,
  coachId: string,
  note: string | null
): Promise<boolean> {
  return setAlertStatus(supabase, alertId, {
    status: 'resolved',
    resolved_by: coachId,
    resolved_at: new Date().toISOString(),
    resolution_note: note,
  });
}

export async function dismissCoachAlert(
  supabase: SupabaseClient,
  alertId: string,
  coachId: string
): Promise<boolean> {
  return setAlertStatus(supabase, alertId, {
    status: 'dismissed',
    resolved_by: coachId,
    resolved_at: new Date().toISOString(),
  });
}
