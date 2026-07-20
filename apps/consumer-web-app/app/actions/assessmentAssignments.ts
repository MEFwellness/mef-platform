/**
 * Coach assignment minimum interface (section 10) — assign a registered
 * assessment to a client, required/optional, with an availability/due
 * date and a short reason; cancel it; list what's assigned. RLS on
 * assessment_assignments (migration 77) is the real enforcement — every
 * action here just performs the write/read and reports whatever Postgres
 * allows, same "not this function's job to re-check the role" idiom as
 * every other coach action in app/actions/coach.ts.
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { findAssessmentRegistryEntry } from '@/lib/assessment-registry/registry';
import type { AssessmentKey } from '@/lib/assessment-registry/types';
import type { ActionResult } from './auth';

export type AssessmentAssignment = {
  id: string;
  assessmentDefinitionId: string;
  isRequired: boolean;
  reason: string | null;
  dueAt: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;
};

export async function getClientAssessmentAssignments(
  clientId: string
): Promise<AssessmentAssignment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, assessment_definition_id, is_required, reason, due_at, status, created_at')
    .eq('member_id', clientId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    assessmentDefinitionId: row.assessment_definition_id,
    isRequired: row.is_required,
    reason: row.reason,
    dueAt: row.due_at,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function assignAssessmentAction(
  clientId: string,
  assessmentKey: AssessmentKey,
  options: { isRequired: boolean; reason: string; dueAt: string; stage: string }
): Promise<ActionResult> {
  const entry = findAssessmentRegistryEntry(assessmentKey);
  if (!entry) return { error: 'Unknown assessment.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  // is_active_coach_for RLS (migration 77) is what actually rejects an
  // assignment for a client this coach isn't assigned to — not this check.
  const { error } = await supabase.from('assessment_assignments').insert({
    member_id: clientId,
    assessment_definition_id: entry.databaseId,
    assigned_by: user.id,
    is_required: options.isRequired,
    reason: options.reason.trim() || null,
    due_at: options.dueAt || null,
    stage: options.stage || 'standard',
  });

  if (error) return { error: error.message };
  return {};
}

export async function cancelAssessmentAssignmentAction(
  assignmentId: string
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('assessment_assignments')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id })
    .eq('id', assignmentId)
    .eq('status', 'pending');

  if (error) return { error: error.message };
  return {};
}
