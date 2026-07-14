/**
 * Universal Registry findings, re-shaped into this engine's own report
 * types — never re-derived. A registry_entries row (see lib/registry/) is
 * already a finished finding (a body-assessment posture finding, or a
 * coach-published AI observation); this module's only job is to fold that
 * finding into PatternInsight[]/CoachAlertDraft[] using the exact same
 * "careful, non-causal language" and confidence/evidence-ref passthrough
 * every other detector in this file already follows. No new detection
 * logic, no new intelligence engine — see patterns.ts's own docblock for
 * why every pattern here traces back to something already computed
 * elsewhere.
 */

import type { MemberHealthProfile, CoachAlertDraft, PatternInsight } from './types';

const PATTERN_SEVERITIES = new Set(['mild', 'moderate', 'significant']);

export function buildRegistryPatternInsights(profile: MemberHealthProfile): PatternInsight[] {
  return profile.registryEntries
    .filter((e) => e.entry_kind === 'finding' && e.status === 'active' && e.severity && PATTERN_SEVERITIES.has(e.severity))
    .map((entry) => ({
      key: `registry_${entry.domain}_${entry.code}`,
      kind: 'body_assessment_finding' as const,
      label: entry.label,
      description: entry.narrative ?? entry.label,
      confidence: entry.confidence,
      evidenceRefs: [...entry.evidence_refs, { type: 'registry_entry', id: entry.id }],
      sourceInsightId: null,
    }));
}

export function buildRegistryCoachAlertDrafts(profile: MemberHealthProfile): CoachAlertDraft[] {
  return profile.registryEntries
    .filter((e) => e.entry_kind === 'finding' && e.status === 'active' && e.severity === 'significant')
    .map((entry) => ({
      alertType: 'assessment_finding_requires_attention' as const,
      severity: 'important' as const,
      title: `Assessment finding needs attention: ${entry.label}`,
      reason: entry.narrative ?? `A significant-severity ${entry.domain} finding ("${entry.label}") was registered from ${entry.source_feature}.`,
      alertKey: `assessment_finding_${entry.code}`,
      evidenceRefs: [...entry.evidence_refs, { type: 'registry_entry', id: entry.id }],
      sourceRefs: [{ type: 'registry_entry', id: entry.id }],
    }));
}
