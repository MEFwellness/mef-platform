/**
 * Universal Registry adapter — Movement Intelligence.
 *
 * Reshapes a just-completed movement_sessions row into a registry_entries
 * row (entry_kind='metric', domain='movement') — never re-derives a value,
 * same discipline as adapters/bodyAssessment.ts and adapters/wearables.ts.
 * Maintains a single current-snapshot-per-code entry (superseding the
 * previous one), so MemberHealthProfile / the Intelligence Engine / Coach
 * Intelligence see a member's latest movement adherence through the exact
 * same registry read path as every other domain, with zero changes to
 * those engines — the extension point lib/intelligence-engine/types.ts's
 * own docblock anticipated.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MovementSession } from '@mef/shared-types-contracts';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import type { RegistryEntryDraft } from '../types';

const MOVEMENT_SESSION_COMPLETED_CODE = 'movement_session_completed';

export async function upsertRegistryEntryFromMovementSession(
  supabase: SupabaseClient,
  memberId: string,
  session: MovementSession
): Promise<void> {
  if (session.status !== 'completed') return;

  const existing = await findActiveRegistryEntry(
    supabase,
    memberId,
    'movement',
    MOVEMENT_SESSION_COMPLETED_CODE
  );
  if (existing && existing.source_record_id === session.id) return;

  const draft: RegistryEntryDraft = {
    entry_kind: 'metric',
    domain: 'movement',
    code: MOVEMENT_SESSION_COMPLETED_CODE,
    label: 'Movement session completed',
    severity: null,
    numeric_value: session.movement_score,
    unit: session.movement_score != null ? 'movement_score' : null,
    confidence: 1,
    narrative: `Completed a ${session.estimated_duration_minutes}-minute movement session focused on ${session.focus_summary.toLowerCase()}.`,
    evidence_refs: [{ type: 'movement_session', id: session.id }],
    source_feature: 'movement_session_completed',
    source_record_id: session.id,
    member_visible: true,
    coach_context: null,
    coach_reviewed_by: null,
    coach_reviewed_at: null,
    trend_status: null,
    recorded_at: session.completed_at ?? new Date().toISOString(),
  };

  await insertRegistryEntry(supabase, memberId, draft, { supersedesId: existing?.id ?? null });
}
