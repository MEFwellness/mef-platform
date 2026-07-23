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
import type { RecommendationDomain } from '../intelligence-engine/types';
import type { LifestyleExperimentOutcome } from '../lifestyle-experiments/types';
import type { LongitudinalSignal } from '../longitudinal-intelligence/types';

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

/**
 * Prompt 12, Part 7 extension — three new, focused (never full-
 * reinvestigation) triggers, still every one scoped to a single
 * AssessmentKey the same way the two evaluators above already are.
 * Reuses the same RecommendationDomain vocabulary
 * Prescription-Intelligence-adjacent modules already read
 * (lib/intelligence-engine/types.ts) rather than inventing a new mapping —
 * mirrors DOMAIN_TO_ASSESSMENT above, one vocabulary hop further out.
 */
const RECOMMENDATION_DOMAIN_TO_ASSESSMENT: Partial<Record<RecommendationDomain, AssessmentKey>> = {
  movement: 'body-assessment',
  recovery: 'body-assessment',
  breathing: 'body-assessment',
  nutrition: 'chek-hlc1-nutrition-lifestyle',
  hydration: 'chek-hlc1-nutrition-lifestyle',
  stress: 'four-doctors',
  sleep: 'four-doctors',
};

function registryDomainsForAssessment(assessmentKey: AssessmentKey): RegistryDomain[] {
  return (Object.entries(DOMAIN_TO_ASSESSMENT) as [RegistryDomain, AssessmentKey][])
    .filter(([, key]) => key === assessmentKey)
    .map(([domain]) => domain);
}

export type ExperimentOutcomeReassessmentSuggestion = {
  assessmentKey: AssessmentKey;
  triggerSource: 'experiment_outcome';
  reason: string;
  triggerContext: { outcome: LifestyleExperimentOutcome; sourceDomain: RecommendationDomain };
};

/**
 * A closed Lifestyle Experiment that didn't work, in a domain where the
 * finding that prompted it is still active — the experiment alone wasn't
 * enough, worth a fresh assessment rather than guessing at another
 * experiment. Pure — the caller (the daily cron) resolves each closed
 * experiment's source domain and passes it in; this function invents no
 * new domain lookup of its own.
 */
export function evaluateExperimentOutcomeReassessmentTriggers(
  closedExperiments: { sourceDomain: RecommendationDomain; outcome: LifestyleExperimentOutcome }[],
  activeFindings: RegistryEntry[],
  existingPendingAssessmentKeys: ReadonlySet<AssessmentKey>
): ExperimentOutcomeReassessmentSuggestion[] {
  const activeRegistryDomains = new Set(
    activeFindings.filter((f) => f.status === 'active' && f.entry_kind === 'finding').map((f) => f.domain)
  );

  const seen = new Set<AssessmentKey>();
  const suggestions: ExperimentOutcomeReassessmentSuggestion[] = [];

  for (const experiment of closedExperiments) {
    if (experiment.outcome !== 'didnt_work' && experiment.outcome !== 'partially_worked') continue;

    const assessmentKey = RECOMMENDATION_DOMAIN_TO_ASSESSMENT[experiment.sourceDomain];
    if (!assessmentKey || seen.has(assessmentKey) || existingPendingAssessmentKeys.has(assessmentKey)) continue;

    const stillActive = registryDomainsForAssessment(assessmentKey).some((d) => activeRegistryDomains.has(d));
    if (!stillActive) continue;

    seen.add(assessmentKey);
    suggestions.push({
      assessmentKey,
      triggerSource: 'experiment_outcome',
      reason: "A recent small change didn't fully resolve this — worth a fresh assessment to see what else might help.",
      triggerContext: { outcome: experiment.outcome, sourceDomain: experiment.sourceDomain },
    });
  }

  return suggestions;
}

export type RecommendationSequenceReassessmentSuggestion = {
  assessmentKey: AssessmentKey;
  triggerSource: 'recommendation_sequence';
  reason: string;
  triggerContext: { completedCount: number; sourceDomain: RecommendationDomain };
};

/** A member has completed several recommendations in the same domain — a real completed sequence, worth checking whether it moved the needle rather than continuing to recommend more of the same. */
const RECOMMENDATION_SEQUENCE_THRESHOLD = 3;

export function evaluateRecommendationSequenceReassessmentTriggers(
  completedCountBySourceDomain: { sourceDomain: RecommendationDomain; completedCount: number }[],
  existingPendingAssessmentKeys: ReadonlySet<AssessmentKey>
): RecommendationSequenceReassessmentSuggestion[] {
  const seen = new Set<AssessmentKey>();
  const suggestions: RecommendationSequenceReassessmentSuggestion[] = [];

  for (const { sourceDomain, completedCount } of completedCountBySourceDomain) {
    if (completedCount < RECOMMENDATION_SEQUENCE_THRESHOLD) continue;

    const assessmentKey = RECOMMENDATION_DOMAIN_TO_ASSESSMENT[sourceDomain];
    if (!assessmentKey || seen.has(assessmentKey) || existingPendingAssessmentKeys.has(assessmentKey)) continue;

    seen.add(assessmentKey);
    suggestions.push({
      assessmentKey,
      triggerSource: 'recommendation_sequence',
      reason: `You've completed ${completedCount} recommendations in this area — a good point to check in with a fresh assessment.`,
      triggerContext: { completedCount, sourceDomain },
    });
  }

  return suggestions;
}

/**
 * A repeated/established registry-finding signal (Longitudinal
 * Intelligence, lib/longitudinal-intelligence/) that the blunt
 * "trend_status === worsening" check above wouldn't catch on its own — a
 * pattern that's held for 3+ occurrences across 3+ weeks (established_pattern)
 * or one that looks to have resolved (worth confirming, not just assuming).
 * Deliberately does NOT attempt to detect a worsening->improving reversal
 * from a single current-state snapshot — member_pattern_states stores the
 * latest classification only, not a state-transition history, and
 * fabricating a reversal read from one snapshot would misrepresent what's
 * actually known; a real transition-history mechanism is future work, not
 * something to approximate here.
 */
export function evaluateLongitudinalReassessmentTriggers(
  signals: LongitudinalSignal[],
  existingPendingAssessmentKeys: ReadonlySet<AssessmentKey>
): ReassessmentSuggestion[] {
  const seen = new Set<AssessmentKey>();
  const suggestions: ReassessmentSuggestion[] = [];

  for (const signal of signals) {
    if (signal.signalKind !== 'registry_finding') continue;
    if (signal.state !== 'established_pattern' && signal.state !== 'resolved') continue;

    const registryDomain = signal.signalKey.split('::')[1] as RegistryDomain;
    const assessmentKey = DOMAIN_TO_ASSESSMENT[registryDomain];
    if (!assessmentKey || seen.has(assessmentKey) || existingPendingAssessmentKeys.has(assessmentKey)) continue;

    seen.add(assessmentKey);
    suggestions.push({
      assessmentKey,
      triggerSource: 'finding_change',
      reason:
        signal.state === 'resolved'
          ? 'Something that used to show up consistently looks like it may have settled down — worth confirming with a fresh look.'
          : "A pattern has held steady across several check-ins — worth a closer look at what has and hasn't changed.",
      triggerContext: {
        findingCodes: [String(signal.evidenceSummary.code ?? signal.signalLabel)],
        confidence: signal.confidence,
      },
    });
  }

  return suggestions;
}
