/**
 * Root Map builder — assembles the plain-language, per-domain view Method
 * §2 defines ("what a member sees; a human-readable projection of the Root
 * Model") entirely from data already computed elsewhere: domain Confidence
 * and Priority (lib/investigation-engine/), active Universal Registry
 * findings (lib/registry/), pattern insights (lib/intelligence-engine/),
 * and the Root Router's outcome classification (routerOutcome.ts). No new
 * scoring, no new persisted table — the same computed-view precedent
 * MemberHealthProfile and Root Score already established.
 *
 * Patterns are matched to a domain by checking whether a PatternInsight's
 * key/label/description mentions one of that domain's own real vocabulary
 * tokens (its WellnessMetricKey(s) or RegistryDomain(s), from
 * investigation-engine/domains.ts's reconciliation tables) — a best-effort
 * text match, not a strict foreign key, because PatternInsight carries no
 * CoachingDomain field of its own today. Flagged here rather than silently
 * assumed reliable; a pattern that doesn't textually reference a domain's
 * vocabulary simply won't surface there, which under-attributes rather
 * than mis-attributes.
 */

import type { RegistryEntry } from '@mef/shared-types-contracts';
import {
  COACHING_DOMAINS,
  COACHING_DOMAIN_TO_REGISTRY_DOMAIN,
  COACHING_DOMAIN_TO_WELLNESS_METRIC,
  type CoachingDomain,
} from '../investigation-engine/domains';
import { computeDomainConfidence, type DomainConfidence } from '../investigation-engine/confidence';
import { computeCoachingDomainPriority } from '../investigation-engine/unlockEngine';
import type { CoachingPriorityLevel } from '../investigation-engine/types';
import type { PatternInsight } from '../intelligence-engine/types';
import type { RootRouterOutcomeView } from '../investigation-engine/routerOutcome';
import type { RootMapDomainView, RootMapStage, RootMapView } from './types';

const GATHERING_INFO_MESSAGE =
  "Rooted Reset is still gathering information here — as you complete assessments and check-ins, this section will fill in.";

const UNINSTRUMENTED_MESSAGE =
  "This is real coaching territory — Rooted Reset doesn't have a dedicated assessment for it yet, so nothing here is tracked from your activity today.";

const SAFETY_SUPPRESSED_MESSAGE =
  'Your coach is reviewing something in this area with you right now, so specific details are paused here for the moment.';

function inferStage(
  isUninstrumented: boolean,
  confidence: DomainConfidence,
  priority: CoachingPriorityLevel
): RootMapStage {
  if (isUninstrumented || confidence.label === 'building' || confidence.label === 'low') {
    return 'discovery';
  }
  return priority === 'quiet' ? 'optimization' : 'stabilization';
}

/**
 * Per-domain "Current Recommendation" / "Next Suggested Step" — derived
 * only from this domain's own already-computed Confidence and Priority,
 * never from a fuzzy match against the Intelligence Engine's 14-value
 * RecommendationDomain vocabulary (which doesn't reconcile cleanly onto
 * the 12 Coaching Domains — see domains.ts's own reconciliation-table
 * discipline). Reliable and always honest, at the cost of being general
 * rather than maximally specific; the one specific, evidence-backed
 * recommendation the Root Map does surface is the member-wide
 * `routerOutcome` at the top of the view.
 */
function recommendationCopyForDomain(
  isUninstrumented: boolean,
  confidence: DomainConfidence,
  priority: CoachingPriorityLevel
): { currentRecommendation: string; nextSuggestedStep: string } {
  if (isUninstrumented) {
    return {
      currentRecommendation: 'No assessment covers this yet',
      nextSuggestedStep:
        "This will be added as Rooted Reset's assessment library expands — nothing to do here for now.",
    };
  }
  if (confidence.label === 'building') {
    return {
      currentRecommendation: 'Still gathering information',
      nextSuggestedStep: 'Complete more check-ins and assessments to build a clearer picture here.',
    };
  }
  if (priority === 'needs_attention_now') {
    return {
      currentRecommendation: 'Worth focused attention soon',
      nextSuggestedStep:
        'Your coach will likely bring this up, or a focused assessment may be suggested next.',
    };
  }
  if (priority === 'worth_watching') {
    return {
      currentRecommendation: 'Worth keeping an eye on',
      nextSuggestedStep: 'Keep tracking here — no urgent action needed yet.',
    };
  }
  return {
    currentRecommendation: 'Looking steady',
    nextSuggestedStep: 'Nothing specific needed here right now.',
  };
}

function patternsForDomain(domain: CoachingDomain, patterns: PatternInsight[]): PatternInsight[] {
  const tokens = [
    ...COACHING_DOMAIN_TO_WELLNESS_METRIC[domain],
    ...COACHING_DOMAIN_TO_REGISTRY_DOMAIN[domain],
  ].map((t) => t.toLowerCase());
  if (tokens.length === 0) return [];

  return patterns.filter((p) => {
    const haystack = `${p.key} ${p.label} ${p.description}`.toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });
}

function buildDomainView(
  domain: CoachingDomain,
  activeFindings: RegistryEntry[],
  patterns: PatternInsight[],
  suppressDetail: boolean
): RootMapDomainView {
  const info = COACHING_DOMAINS.find((d) => d.domain === domain)!;
  const confidence = computeDomainConfidence(domain, activeFindings);
  const priority = computeCoachingDomainPriority(domain, activeFindings);
  const stage = inferStage(info.isUninstrumented, confidence, priority);

  const registryDomains = new Set(COACHING_DOMAIN_TO_REGISTRY_DOMAIN[domain]);
  const matchingFindings = activeFindings.filter(
    (f) => f.status === 'active' && f.member_visible && registryDomains.has(f.domain)
  );

  let whatWeUnderstand: string[] = [];
  let whatWereStillLearning: string;

  if (suppressDetail) {
    whatWereStillLearning = SAFETY_SUPPRESSED_MESSAGE;
  } else if (info.isUninstrumented) {
    whatWereStillLearning = UNINSTRUMENTED_MESSAGE;
  } else if (matchingFindings.length === 0) {
    whatWereStillLearning = GATHERING_INFO_MESSAGE;
  } else {
    whatWeUnderstand = matchingFindings.map((f) => f.narrative ?? f.label);
    whatWereStillLearning =
      confidence.label === 'high'
        ? "We have a clear, corroborated picture here — we'll keep watching for anything that changes."
        : "We're building a clearer picture here as more information comes in.";
  }

  const { currentRecommendation, nextSuggestedStep } = suppressDetail
    ? { currentRecommendation: 'Paused for coach review', nextSuggestedStep: SAFETY_SUPPRESSED_MESSAGE }
    : recommendationCopyForDomain(info.isUninstrumented, confidence, priority);

  return {
    domain,
    label: info.label,
    definition: info.definition,
    isUninstrumented: info.isUninstrumented,
    stage,
    confidence,
    priority,
    whatWeUnderstand,
    whatWereStillLearning,
    currentRecommendation,
    nextSuggestedStep,
    patterns: suppressDetail ? [] : patternsForDomain(domain, patterns),
  };
}

const PRIORITY_RANK: Record<CoachingPriorityLevel, number> = {
  needs_attention_now: 2,
  worth_watching: 1,
  quiet: 0,
};

const CONFIDENCE_RANK: Record<DomainConfidence['label'], number> = {
  building: 0,
  low: 1,
  moderate: 2,
  high: 3,
};

export function buildRootMap(input: {
  activeFindings: RegistryEntry[];
  patterns: PatternInsight[];
  routerOutcome: RootRouterOutcomeView;
  safetyGated: boolean;
  restrictedTopics: string[];
  /** Coach-view: no suppression, and restrictedTopics is echoed back for the coach's own awareness. Member-view (default): suppressed when any restricted topic is open. */
  coachView?: boolean;
}): RootMapView {
  const suppressDetail = !input.coachView && input.restrictedTopics.length > 0;

  const domains = COACHING_DOMAINS.map((info) =>
    buildDomainView(info.domain, input.activeFindings, input.patterns, suppressDetail)
  ).sort((a, b) => {
    const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return CONFIDENCE_RANK[a.confidence.label] - CONFIDENCE_RANK[b.confidence.label];
  });

  return {
    generatedAt: new Date().toISOString(),
    domains,
    routerOutcome: input.routerOutcome,
    safetyGated: input.safetyGated,
    restrictedTopics: input.coachView ? input.restrictedTopics : [],
  };
}
