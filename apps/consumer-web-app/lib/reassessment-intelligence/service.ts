/**
 * Reassessment Intelligence (Prompt 6) — "determine when reassessments are
 * appropriate using time elapsed, finding changes, daily check-ins, new
 * symptoms, wearables, coach actions. Do not rely only on calendar
 * dates." reassessment_schedules (migration 72) starts completely empty
 * and had no writer before this — every row this module creates records
 * *why*, via the new trigger_source/trigger_context columns (migration
 * 84), alongside the calendar-only convention that table already reserved
 * space for.
 *
 * This module's one real trigger today is a worsening finding: an active
 * registry_entries row (from any of the seven adapters — body assessment,
 * questionnaire engine, onboarding, primal pattern, wearables, food lens,
 * movement) whose trend_status is 'worsening' at real confidence is a
 * genuine "something changed for this member" signal — a calendar date
 * alone can't see that. Deliberately conservative: one suggestion per
 * (member, assessment) at a time (no duplicate pending schedules), and
 * only fires for a domain this codebase has an established
 * domain→assessment relationship for (the same DOMAIN_ROUTES vocabulary
 * as lib/assessment-registry/findingRecommendations.ts).
 */

import type { RegistryDomain, RegistryEntry } from '@mef/shared-types-contracts';
import type { AssessmentKey } from '../assessment-registry/types';
import { listInvestigationMetadata } from '../investigation-engine/registry';

const MIN_TRIGGER_CONFIDENCE = 0.6;

const DOMAIN_TO_ASSESSMENT: Partial<Record<RegistryDomain, AssessmentKey>> = {
  posture: 'body-assessment',
  movement: 'body-assessment',
  breathing: 'body-assessment',
  nutrition: 'chek-hlc1-nutrition-lifestyle',
  stress: 'four-doctors',
  sleep: 'four-doctors',
};

export type ReassessmentSuggestion = {
  assessmentKey: AssessmentKey;
  triggerSource: 'finding_change';
  reason: string;
  triggerContext: { findingCodes: string[]; confidence: number };
};

/**
 * Pure — no I/O. `existingPendingAssessmentKeys` is the set of
 * assessmentKeys that already have a pending reassessment_schedules row so
 * this never suggests (or the caller never writes) a duplicate.
 */
export function evaluateReassessmentTriggers(
  activeFindings: RegistryEntry[],
  existingPendingAssessmentKeys: ReadonlySet<AssessmentKey>
): ReassessmentSuggestion[] {
  const worsening = activeFindings.filter(
    (f) =>
      f.entry_kind === 'finding' &&
      f.status === 'active' &&
      f.trend_status === 'worsening' &&
      f.confidence >= MIN_TRIGGER_CONFIDENCE
  );

  const byAssessment = new Map<AssessmentKey, { codes: string[]; confidence: number }>();
  for (const finding of worsening) {
    const assessmentKey = DOMAIN_TO_ASSESSMENT[finding.domain];
    if (!assessmentKey || existingPendingAssessmentKeys.has(assessmentKey)) continue;

    const existing = byAssessment.get(assessmentKey);
    if (existing) {
      existing.codes.push(finding.code);
      existing.confidence = Math.max(existing.confidence, finding.confidence);
    } else {
      byAssessment.set(assessmentKey, { codes: [finding.code], confidence: finding.confidence });
    }
  }

  return [...byAssessment.entries()].map(([assessmentKey, { codes, confidence }]) => ({
    assessmentKey,
    triggerSource: 'finding_change' as const,
    reason: `${codes.length} worsening finding${codes.length === 1 ? '' : 's'} suggest${codes.length === 1 ? 's' : ''} it's time to reassess.`,
    triggerContext: { findingCodes: [...new Set(codes)], confidence },
  }));
}

export type CalendarReassessmentSuggestion = {
  assessmentKey: AssessmentKey;
  triggerSource: 'calendar';
  reason: string;
  triggerContext: { cadenceDays: number; lastCompletedAt: string };
};

/**
 * The other half of Method §6 field 3 / §9's cadence — a declared, per-
 * investigation calendar cadence (`InvestigationMetadata.reassessmentCadence`,
 * lib/investigation-engine/types.ts), distinct from this module's existing
 * finding-triggered evaluator above. Uses the same `reassessment_schedules`
 * table and the same `trigger_source` check-constraint value ('calendar')
 * migration 84 already reserved for exactly this — no schema change, no
 * second competing table. Pure — no I/O; `lastCompletedAtByKey` and
 * `existingPendingAssessmentKeys` are gathered by the caller (see
 * data.ts's `listLastCompletedAtByAssessmentKey`,
 * `listPendingReassessmentAssessmentKeys`).
 *
 * No live investigation declares a `calendar` cadence today (every real
 * instrument is currently member-initiated, unlimited retakes, no
 * cooldown — see lib/investigation-engine/registry.ts) — this evaluator
 * exists so a future investigation can declare one and start participating
 * immediately, with zero further wiring, per the prompt's "without
 * requiring future architectural changes" requirement.
 */
export function evaluateCalendarReassessmentTriggers(
  now: Date,
  lastCompletedAtByKey: ReadonlyMap<AssessmentKey, string>,
  existingPendingAssessmentKeys: ReadonlySet<AssessmentKey>
): CalendarReassessmentSuggestion[] {
  const suggestions: CalendarReassessmentSuggestion[] = [];

  for (const metadata of listInvestigationMetadata()) {
    if (metadata.reassessmentCadence.kind !== 'calendar') continue;
    if (existingPendingAssessmentKeys.has(metadata.key)) continue;

    const lastCompletedAt = lastCompletedAtByKey.get(metadata.key);
    if (!lastCompletedAt) continue;

    const dueAt = new Date(lastCompletedAt);
    dueAt.setUTCDate(dueAt.getUTCDate() + metadata.reassessmentCadence.days);
    if (dueAt > now) continue;

    suggestions.push({
      assessmentKey: metadata.key,
      triggerSource: 'calendar',
      reason: `It's been ${metadata.reassessmentCadence.days}+ days since your last check-in on this — worth a fresh look.`,
      triggerContext: { cadenceDays: metadata.reassessmentCadence.days, lastCompletedAt },
    });
  }

  return suggestions;
}
