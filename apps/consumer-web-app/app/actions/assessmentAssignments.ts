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
import { findAssessmentRegistryEntry, listAssessmentRegistryEntries } from '@/lib/assessment-registry/registry';
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

  // Idempotent: one active (pending) assignment per member per
  // questionnaire, enforced for real at the DB level by a partial unique
  // index (migration 144). Checking first means a coach who assigns
  // something already pending never sees an error, they just get the
  // existing assignment back — same "an accidental duplicate click is not
  // a failure" posture as the rest of this app's write paths.
  const { data: existing } = await supabase
    .from('assessment_assignments')
    .select('id')
    .eq('member_id', clientId)
    .eq('assessment_definition_id', entry.databaseId)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) return {};

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

  // A race with another concurrent assign click hits the partial unique
  // index (migration 144) as a 23505 conflict — treated as success, same
  // idempotent outcome as the check above finding it first.
  if (error && error.code !== '23505') return { error: error.message };
  return {};
}

export type MyPendingQuestionnaireAssignment = {
  assignmentId: string;
  assessmentKey: AssessmentKey;
  displayName: string;
  /** Where the "Start now" pop-up CTA should send the member — the assessment's own registered overview route. */
  primaryHref: string;
};

/**
 * The signed-in member's own pending questionnaire assignments, oldest
 * first — the source list the Root pop-up chain (app/actions/
 * rootPopupMessages.ts) picks from for the "your coach assigned you a new
 * questionnaire" message. A separate, smaller query from
 * getMyQuestionnaireCatalog() on purpose: the pop-up only needs the
 * assignment id (to build a stable per-assignment message key) and enough
 * to render its copy/CTA, not the catalog's full per-type card-building
 * work (draft progress, latest result links, etc.).
 */
export async function getMyPendingQuestionnaireAssignments(): Promise<
  MyPendingQuestionnaireAssignment[]
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('assessment_assignments')
    .select('id, assessment_definition_id, created_at')
    .eq('member_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) console.error('TEMP_DEBUG getMyPendingQuestionnaireAssignments query error', error);
  console.error('TEMP_DEBUG getMyPendingQuestionnaireAssignments', { userId: user.id, rowCount: data?.length ?? 0, rows: data });
  if (error || !data) return [];

  const entriesByDatabaseId = new Map(
    listAssessmentRegistryEntries().map((entry) => [entry.databaseId, entry] as const)
  );

  const results: MyPendingQuestionnaireAssignment[] = [];
  for (const row of data) {
    const entry = entriesByDatabaseId.get(row.assessment_definition_id as string);
    if (!entry) continue;
    results.push({
      assignmentId: row.id as string,
      assessmentKey: entry.key,
      displayName: entry.displayName,
      primaryHref: entry.route,
    });
  }
  return results;
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
