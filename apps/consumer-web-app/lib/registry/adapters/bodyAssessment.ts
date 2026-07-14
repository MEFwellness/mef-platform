/**
 * Universal Registry adapter — Body Assessment Framework.
 *
 * Maps confirmed/coach-overridden body_assessment_findings rows into
 * registry_entries. Never re-derives a finding (the vision provider /
 * coach already decided finding_type/severity/confidence) — this is a pure
 * reshape into the registry's one common contract, same discipline
 * lib/intelligence-engine/patterns.ts uses when re-shaping wellness_insights
 * into PatternInsight.
 *
 * Only coach-gated findings (status 'confirmed' or 'coach_overridden') are
 * registered — a 'pending_review'/'dismissed'/'draft' finding hasn't
 * cleared the coach review gate this milestone's "after a coach publishes
 * an approved assessment" requirement anchors on, and shouldn't yet surface
 * to the MEF Intelligence Engine / Intelligence Core as a real fact about
 * the member.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PostureFindingType, RegistryDomain } from '@mef/shared-types-contracts';
import { listFindings } from '../../body-assessment/data';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import type { RegistryEntryDraft } from '../types';

const REGISTERED_FINDING_STATUSES = new Set(['confirmed', 'coach_overridden']);

const DOMAIN_BY_FINDING_TYPE: Partial<Record<PostureFindingType, RegistryDomain>> = {
  breathing_pattern: 'breathing',
  knee_valgus: 'movement',
  foot_turnout: 'movement',
  weight_shift: 'movement',
  hip_asymmetry: 'movement',
};

function domainForFindingType(findingType: PostureFindingType): RegistryDomain {
  return DOMAIN_BY_FINDING_TYPE[findingType] ?? 'posture';
}

export async function upsertRegistryEntriesFromBodyAssessment(
  supabase: SupabaseClient,
  memberId: string,
  assessmentId: string
): Promise<void> {
  const findings = await listFindings(supabase, assessmentId, { activeOnly: true });
  const registerable = findings.filter((f) => REGISTERED_FINDING_STATUSES.has(f.status));

  for (const finding of registerable) {
    const domain = domainForFindingType(finding.finding_type);
    const existing = await findActiveRegistryEntry(supabase, memberId, domain, finding.finding_type);
    if (existing && existing.source_record_id === finding.id) continue; // already registered, nothing changed

    const draft: RegistryEntryDraft = {
      entry_kind: 'finding',
      domain,
      code: finding.finding_type,
      label: finding.finding_type.replace(/_/g, ' '),
      severity: finding.severity,
      numeric_value: null,
      unit: null,
      confidence: finding.confidence,
      narrative: finding.narrative,
      evidence_refs: finding.evidence,
      source_feature: 'body_assessment_finding',
      source_record_id: finding.id,
      member_visible: true,
      coach_context: finding.coach_override_notes,
      coach_reviewed_by: finding.coach_reviewed_by,
      coach_reviewed_at: finding.coach_reviewed_at,
      recorded_at: finding.updated_at,
    };

    await insertRegistryEntry(supabase, memberId, draft, {
      supersedesId: existing?.id ?? null,
    });
  }
}
