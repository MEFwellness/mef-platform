/**
 * Universal Registry adapter — the Unified Adaptive Assessment Runtime
 * (lib/assessment-runtime/). Follows lib/registry/adapters/
 * questionnaireEngine.ts's exact template: dedup on source_record_id
 * (never re-registers the same completed session twice), supersede a
 * prior active entry for the same (member, domain, code) rather than
 * duplicating it, compute trend_status via the same shared primitive every
 * other adapter uses.
 *
 * What actually decides "is this a finding" lives in
 * lib/assessment-runtime/findings.ts (pure, no I/O, no registry-type
 * dependency) — this file's only job is turning an already-derived
 * finding into a real registry_entries row, validating the question's
 * authored concern_category is a real RegistryDomain (never guessed) and
 * skipping anything that isn't.
 *
 * Only "findings" get a real registry write here — per the Prompt 2 audit,
 * observations/patterns/recommendations are already derived FROM registry
 * findings by the existing intelligence pipeline
 * (lib/intelligence-engine/memberFacingNoticing.ts,
 * crossAssessmentCorrelations.ts, lib/recommendation-engine/) once a
 * finding exists — building a second, separate publish path for those
 * would duplicate that pipeline rather than plug into it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistryDomain } from '@mef/shared-types-contracts';
import type { DerivedFinding } from '../../assessment-runtime/types';
import { findActiveRegistryEntry, insertRegistryEntry } from '../data';
import { computeFindingTrendStatus } from '../trendStatus';
import type { RegistryEntryDraft } from '../types';

const VALID_DOMAINS = new Set<RegistryDomain>([
  'posture',
  'movement',
  'breathing',
  'questionnaire',
  'sleep',
  'stress',
  'nutrition',
  'wearable',
  'lab',
  'hormone',
]);

function isRegistryDomain(value: string): value is RegistryDomain {
  return VALID_DOMAINS.has(value as RegistryDomain);
}

/** Confidence is grounded only in the authored severity tier (never a fabricated score), same [0.55, 0.9]-family range every other adapter in this codebase uses. */
function confidenceForSeverity(severity: DerivedFinding['severity']): number {
  if (severity === 'significant') return 0.75;
  if (severity === 'moderate') return 0.65;
  return 0.55;
}

export async function publishUnifiedAssessmentFindings(
  supabase: SupabaseClient,
  memberId: string,
  sessionId: string,
  findings: DerivedFinding[]
): Promise<number> {
  let published = 0;

  for (const finding of findings) {
    if (!isRegistryDomain(finding.domain)) continue; // authored concern_category isn't a real registry domain — skip rather than guess

    const domain = finding.domain;
    const existing = await findActiveRegistryEntry(supabase, memberId, domain, finding.code);
    if (existing && existing.source_record_id === sessionId) continue; // already registered this session

    const draft: RegistryEntryDraft = {
      entry_kind: 'finding',
      domain,
      code: finding.code,
      label: finding.label,
      severity: finding.severity,
      numeric_value: null,
      unit: null,
      confidence: confidenceForSeverity(finding.severity),
      narrative: `${finding.label} flagged during the latest assessment.`,
      evidence_refs: [{ type: 'unified_assessment_session', id: sessionId }],
      source_feature: 'unified_assessment_finding',
      source_record_id: sessionId,
      member_visible: true,
      coach_context: null,
      coach_reviewed_by: null,
      coach_reviewed_at: null,
      trend_status: computeFindingTrendStatus(existing, { severity: finding.severity }),
      recorded_at: new Date().toISOString(),
    };

    await insertRegistryEntry(supabase, memberId, draft, { supersedesId: existing?.id ?? null });
    published += 1;
  }

  return published;
}
