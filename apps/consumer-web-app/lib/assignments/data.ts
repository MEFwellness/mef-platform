/**
 * The assignment delivery receipt's one table
 * (member_assignment_deliveries, migration 210).
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what,
 * and a failed read reports that it failed rather than returning an empty
 * result that reads like a fact.
 *
 * A RECEIPT IS NOT AN ATTEMPT. Nothing in this file touches
 * assessment_assignments, member_stress_load_sessions or any other
 * completion table. It records that something reached her screen, and
 * nothing above it changes its answer because a receipt exists, which is
 * what keeps migration 144's auto-close trigger the one thing that ever
 * completes an assignment.
 *
 * NO RENDER WRITES THROUGH HERE. claimAssignmentDelivery is called from
 * exactly one place, the beacon action in
 * app/actions/assessmentAssignments.ts, which is reached from a mounted
 * effect on a surface that genuinely displayed the assignment. The rule
 * lib/weekly-reflection/data.ts states at length applies unchanged.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Which surface actually put it in front of her. Mirrors the CHECK constraint on the column. */
export const ASSIGNMENT_PRESENTATIONS = ['popup', 'home_card'] as const;
export type AssignmentPresentation = (typeof ASSIGNMENT_PRESENTATIONS)[number];

export function isAssignmentPresentation(value: unknown): value is AssignmentPresentation {
  return (
    typeof value === 'string' && (ASSIGNMENT_PRESENTATIONS as readonly string[]).includes(value)
  );
}

export type AssignmentDeliveryRecord = {
  assignmentId: string;
  deliveredAt: string;
  presentation: string;
};

const DELIVERY_COLUMNS = 'assignment_id, delivered_at, presentation';

type DeliveryRow = { assignment_id: string; delivered_at: string; presentation: string };

function fromRow(row: DeliveryRow): AssignmentDeliveryRecord {
  return {
    assignmentId: row.assignment_id,
    deliveredAt: row.delivered_at,
    presentation: row.presentation,
  };
}

/**
 * One assignment's receipt, with "no receipt" and "the read did not work"
 * kept apart.
 *
 * The reason is the reason fetchReflectionDelivery gives: the whole product
 * of this read is a sentence a coach believes, and a failed read reported
 * as "no receipt" becomes "they have not opened the app" on a screen, about
 * a member who may well have.
 */
export async function fetchAssignmentDelivery(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string
): Promise<{ ok: boolean; record: AssignmentDeliveryRecord | null }> {
  const { data, error } = await supabase
    .from('member_assignment_deliveries')
    .select(DELIVERY_COLUMNS)
    .eq('member_id', memberId)
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error('fetchAssignmentDelivery failed', error);
    return { ok: false, record: null };
  }
  if (!data) return { ok: true, record: null };
  return { ok: true, record: fromRow(data as unknown as DeliveryRow) };
}

/**
 * Every receipt for a set of assignments, in one round trip.
 *
 * The coach panel renders a whole list at once, and one query per row is
 * the shape the Home speed build spent a whole build removing. An empty
 * `assignmentIds` does not query at all.
 */
export async function listAssignmentDeliveries(
  supabase: SupabaseClient,
  memberId: string,
  assignmentIds: readonly string[]
): Promise<{ ok: boolean; byAssignmentId: Map<string, AssignmentDeliveryRecord> }> {
  if (assignmentIds.length === 0) return { ok: true, byAssignmentId: new Map() };

  const { data, error } = await supabase
    .from('member_assignment_deliveries')
    .select(DELIVERY_COLUMNS)
    .eq('member_id', memberId)
    .in('assignment_id', [...assignmentIds]);

  if (error) {
    console.error('listAssignmentDeliveries failed', error);
    return { ok: false, byAssignmentId: new Map() };
  }

  const byAssignmentId = new Map<string, AssignmentDeliveryRecord>();
  for (const row of (data ?? []) as unknown as DeliveryRow[]) {
    byAssignmentId.set(row.assignment_id, fromRow(row));
  }
  return { ok: true, byAssignmentId };
}

/**
 * Records that this assignment reached her, if it has no receipt yet.
 *
 * ONCE PER ASSIGNMENT, AND THE DATABASE IS WHAT ENFORCES IT. Home renders
 * the pop-up and the persistent card in the same pass, so two trackers
 * fire for one showing, and she can reopen the app tomorrow and see the
 * card again. All of those are the same assignment_id, so all of them
 * resolve to the one row that already exists. This is an insert-if-absent
 * for exactly that reason: never an upsert, because an upsert would move
 * delivered_at forward on the second showing and the receipt would stop
 * meaning "the first time it reached her".
 *
 * "NO ERROR" IS NOT "IT WORKED", so the insert returns what it wrote and a
 * caller that gets nothing back is told so rather than assuming success.
 */
export async function claimAssignmentDelivery(
  supabase: SupabaseClient,
  memberId: string,
  assignmentId: string,
  presentation: AssignmentPresentation
): Promise<{ record: AssignmentDeliveryRecord | null; created: boolean }> {
  const { data, error } = await supabase
    .from('member_assignment_deliveries')
    .insert({
      member_id: memberId,
      assignment_id: assignmentId,
      presentation,
      delivered_at: new Date().toISOString(),
    })
    .select(DELIVERY_COLUMNS)
    .maybeSingle();

  if (!error && data) {
    return { record: fromRow(data as unknown as DeliveryRow), created: true };
  }

  // Either the unique constraint rejected a second showing of the same
  // assignment, which is the ordinary and expected outcome, or the insert
  // wrote nothing. Both resolve the same way: read back whatever is
  // actually there, so the caller learns the truth rather than an
  // assumption.
  const existing = await fetchAssignmentDelivery(supabase, memberId, assignmentId);
  if (error && !existing.record) console.error('claimAssignmentDelivery insert failed', error);
  return { record: existing.record, created: false };
}
