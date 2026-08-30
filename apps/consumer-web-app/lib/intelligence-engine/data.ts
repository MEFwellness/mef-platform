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

/**
 * Who wrote a row, so the engine's own sweep can tell its recomputed
 * conditions apart from the events another caller raised. Migration 192.
 */
export type CoachAlertProducer = 'intelligence_engine' | 'coaching_direction';

/** Postgres' unique violation. Migration 192 made (member_id, alert_key) unique across open and acknowledged rows. */
const UNIQUE_VIOLATION = '23505';

async function insertAlert(
  supabase: SupabaseClient,
  memberId: string,
  draft: CoachAlertDraft,
  producedBy: CoachAlertProducer
): Promise<{ duplicate: boolean }> {
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
    produced_by: producedBy,
  });

  // Two recalculations for the same member ran at once and both read "no
  // open alert with this key" before either wrote. That is exactly what
  // put five identical "No recent check-in" rows on one member's page
  // (found 2026-08-30). The index now refuses the second write, and the
  // second writer touches the row the first one made instead.
  if (error?.code === UNIQUE_VIOLATION) return { duplicate: true };
  if (error) console.error('insertAlert failed', error);
  return { duplicate: false };
}

async function touchAlert(
  supabase: SupabaseClient,
  alertId: string,
  draft: CoachAlertDraft
): Promise<void> {
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
    .eq('id', alertId);
  if (error) console.error('upsertCoachAlert touch failed', error);
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
  draft: CoachAlertDraft,
  producedBy: CoachAlertProducer = 'intelligence_engine'
): Promise<void> {
  const existing = await findAlertByKey(supabase, memberId, draft.alertKey);

  if (existing && REOPENABLE_STATUSES.includes(existing.status)) {
    await touchAlert(supabase, existing.id, draft);
    return;
  }

  if (existing?.status === 'dismissed') return; // protected — a coach's dismissal is never silently reopened

  const { duplicate } = await insertAlert(supabase, memberId, draft, producedBy);
  if (!duplicate) return;

  // Someone else won the race. Their row is the one that exists, so this
  // run updates it rather than leaving a second, slightly different copy
  // of the same alert on the coach's screen.
  const winner = await findAlertByKey(supabase, memberId, draft.alertKey);
  if (winner && REOPENABLE_STATUSES.includes(winner.status)) {
    await touchAlert(supabase, winner.id, draft);
  }
}

/**
 * Close every alert this engine raised whose condition has stopped being
 * true.
 *
 * The rules in ./alerts.ts only ever speak when something IS wrong, so
 * nothing used to close an alert when it came right. A member who stopped
 * checking in for a fortnight and then came back kept an open "No recent
 * check-in" row on her coach's screen, still saying twelve days, forever
 * (found live 2026-08-30). Every draft is recomputed from current data on
 * every run, so a key that is absent from this run is a condition that no
 * longer holds.
 *
 * Resolved, not dismissed: it was true and has been handled by reality, and
 * the same alert must be free to open again if it recurs, which is exactly
 * what a resolved row already allows. Dismissed is a coach's own judgement
 * and is never written here.
 *
 * Only rows this engine produced. The coaching-direction notifications
 * (a thread that stopped landing, an unacknowledged safety flag) are events
 * nothing recomputes, so they are not this function's to close.
 */
export async function reconcileCoachAlerts(
  supabase: SupabaseClient,
  memberId: string,
  liveAlertKeys: readonly string[]
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('intelligence_coach_alerts')
    .select('id, alert_key')
    .eq('member_id', memberId)
    .eq('produced_by', 'intelligence_engine')
    .in('status', REOPENABLE_STATUSES);

  if (readError) {
    console.error('reconcileCoachAlerts read failed', readError);
    return;
  }

  // Which rows to close is decided here rather than in a negated SQL
  // filter: an alert key is free-form text (a pattern key, a driver id),
  // and a "not in this list" filter has to be hand-quoted, which is a
  // silent way to close the wrong rows.
  const live = new Set(liveAlertKeys);
  const staleIds = (data ?? [])
    .filter((row) => !live.has(row.alert_key as string))
    .map((row) => row.id as string);
  if (staleIds.length === 0) return;

  const { error } = await supabase
    .from('intelligence_coach_alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolution_note: 'Closed automatically: what raised this is no longer true.',
      updated_at: new Date().toISOString(),
    })
    .in('id', staleIds);

  if (error) console.error('reconcileCoachAlerts failed', error);
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
