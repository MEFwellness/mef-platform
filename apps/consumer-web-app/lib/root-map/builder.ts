/**
 * Root Map builder — assembles the plain-language, per-domain view Method
 * §2 defines ("what a member sees; a human-readable projection of the Root
 * Model").
 *
 * MIGRATED to the Member Interpretation Layer (2026-08-17). This module no
 * longer computes a verdict of its own. It used to call
 * `computeDomainConfidence` and `computeCoachingDomainPriority` directly
 * over raw registry rows, and to fan a single finding out across every
 * coaching domain whose registry-domain list happened to contain that
 * finding's domain. Both of those are what the audit caught:
 *
 *   - "Ongoing discomfort in the hips" appeared under Recovery & Energy
 *     Regulation, Movement & Physical Capacity AND Pain & Structural
 *     Integrity, three times, from one slider answer.
 *   - Pain & Structural Integrity listed two active discomfort findings and
 *     said "LOOKING STEADY. Nothing specific needed here right now",
 *     because both were 'mild' and the priority function only promotes on
 *     'moderate' and above.
 *
 * Now it renders `DomainInterpretation[]` (lib/member-interpretation/), and
 * the two shim fields it still exposes (`priority`, `confidence`) are
 * mapped OUT of the layer's state and tier rather than computed here, so
 * the chip and the sentence beside it cannot disagree.
 *
 * Patterns are still matched to a domain by checking whether a
 * PatternInsight's key/label/description mentions one of that domain's own
 * real vocabulary tokens. That is unchanged and still a best-effort text
 * match, because PatternInsight carries no CoachingDomain field of its own
 * today. It under-attributes rather than mis-attributes.
 */

import {
  COACHING_DOMAIN_TO_REGISTRY_DOMAIN,
  COACHING_DOMAIN_TO_WELLNESS_METRIC,
  getCoachingDomainInfo,
  type CoachingDomain,
} from '../investigation-engine/domains';
import type { DomainConfidence } from '../investigation-engine/confidence';
import type { CoachingPriorityLevel } from '../investigation-engine/types';
import type { PatternInsight } from '../intelligence-engine/types';
import type { RootRouterOutcomeView } from '../investigation-engine/routerOutcome';
import type { DomainInterpretation, DomainState, EvidenceTier } from '../member-interpretation/types';
import type { RootMapDomainView, RootMapStage, RootMapView } from './types';
import { MEMBER_DOMAIN_DESCRIPTIONS } from './memberCopy';

/**
 * `state` -> the legacy CoachingPriorityLevel three-value scale.
 *
 * Note the shape of this table: no state that carries an active finding
 * maps to 'quiet'. That is what makes the "a domain with active findings
 * can never read as quiet" rule survive the trip through this shim, rather
 * than being reintroduced by the mapping itself.
 */
const PRIORITY_FOR_STATE: Record<DomainState, CoachingPriorityLevel> = {
  needs_attention: 'needs_attention_now',
  worth_watching: 'worth_watching',
  acknowledged: 'worth_watching',
  paused_for_coach: 'quiet',
  nothing_flagged_yet: 'quiet',
  too_early: 'quiet',
  no_data_yet: 'quiet',
  not_covered: 'quiet',
};

/**
 * `tier` -> the legacy DomainConfidence shape the coach card still reads.
 *
 * The numeric is a presentation artefact of that component's own chip and
 * is never shown to a member; it is derived from the tier so that the two
 * cannot drift, rather than being a second calculation.
 */
const CONFIDENCE_FOR_TIER: Record<EvidenceTier, DomainConfidence> = {
  early_indication: { label: 'low', numeric: 0.25, corroborated: false },
  emerging_pattern: { label: 'moderate', numeric: 0.5, corroborated: false },
  supported_by_checkins: { label: 'high', numeric: 0.75, corroborated: true },
  coach_verified: { label: 'high', numeric: 0.9, corroborated: true },
};

const NO_TIER_CONFIDENCE: DomainConfidence = { label: 'building', numeric: 0, corroborated: false };

/**
 * The per-domain next step. One line per state, and there is no "Looking
 * steady / Nothing specific needed here right now" among them: that phrase
 * was the audit's own example of an absence of data being reported as an
 * absence of a problem, and it does not come back.
 */
const NEXT_STEP_FOR_STATE: Record<DomainState, { currentRecommendation: string; nextSuggestedStep: string }> = {
  needs_attention: {
    currentRecommendation: 'Worth focused attention soon',
    nextSuggestedStep:
      'Your coach will likely bring this up, or a focused assessment may be suggested next.',
  },
  worth_watching: {
    currentRecommendation: 'Worth keeping an eye on',
    nextSuggestedStep: 'Keep logging this in your check-ins, that is what turns it into a clear read.',
  },
  acknowledged: {
    currentRecommendation: 'Noted, and not urgent',
    nextSuggestedStep:
      'Nothing here is asking for action today. Keep logging it and Root will say so if that changes.',
  },
  nothing_flagged_yet: {
    currentRecommendation: 'Nothing has flagged here yet',
    nextSuggestedStep:
      'You have logged real days here and nothing has come up. That is worth knowing, and it is not the same as this being finished.',
  },
  too_early: {
    currentRecommendation: 'Still early here',
    nextSuggestedStep: 'A few more logged days is what turns this into something worth reading.',
  },
  no_data_yet: {
    currentRecommendation: 'Nothing logged here yet',
    nextSuggestedStep:
      'There are no logged days behind this one, so there is nothing here to call good or otherwise. Logging it in a check-in is what starts the picture.',
  },
  not_covered: {
    currentRecommendation: 'No assessment covers this yet',
    nextSuggestedStep:
      "This will be added as Rooted Reset's assessment library expands, nothing to do here for now.",
  },
  paused_for_coach: {
    currentRecommendation: 'Paused for coach review',
    nextSuggestedStep:
      'Your coach is reviewing something in this area with you right now, so specific details are paused here for the moment.',
  },
};

function inferStage(state: DomainState, tier: EvidenceTier | null): RootMapStage {
  if (state === 'not_covered' || tier === null || tier === 'early_indication') return 'discovery';
  return state === 'needs_attention' || state === 'worth_watching' ? 'stabilization' : 'optimization';
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
  interpretation: DomainInterpretation,
  patterns: PatternInsight[]
): RootMapDomainView {
  const info = getCoachingDomainInfo(interpretation.domain);
  const { state, tier } = interpretation;
  const suppressed = state === 'paused_for_coach';

  // Only findings the member may see reach the member Root Map. A coach
  // reading the coach variant gets the full set, which is exactly the
  // distinction the layer's own memberVisible flag exists for.
  const visible = interpretation.findings.filter((f) => f.memberVisible && f.verdict !== 'resolved');
  const crossReferenced = interpretation.crossReferenced.filter(
    (f) => f.memberVisible && f.verdict !== 'resolved'
  );

  const { currentRecommendation, nextSuggestedStep } = NEXT_STEP_FOR_STATE[state];

  return {
    domain: interpretation.domain,
    label: info.label,
    definition: info.definition,
    memberDescription: MEMBER_DOMAIN_DESCRIPTIONS[interpretation.domain],
    isUninstrumented: info.isUninstrumented,
    stage: inferStage(state, tier),
    state,
    tier,
    tierLabel: interpretation.tierLabel,
    canonicalFindings: visible,
    crossReferenced,
    priority: PRIORITY_FOR_STATE[state],
    confidence: tier ? CONFIDENCE_FOR_TIER[tier] : NO_TIER_CONFIDENCE,
    // The statements the LAYER authored, not the narratives each adapter
    // stored years apart. One of those interpolated a raw enum into member
    // copy ("reported as 'poor' on the latest onboarding submission"); none
    // of them knew anything about tiers.
    whatWeUnderstand: visible.map((f) => f.statement),
    whatWereStillLearning: interpretation.statement,
    currentRecommendation,
    nextSuggestedStep,
    patterns: suppressed ? [] : patternsForDomain(interpretation.domain, patterns),
  };
}

/**
 * The Root Map, from the interpretation layer.
 *
 * `domains` arrives already ordered by the layer (urgency, then label), and
 * that order is kept rather than re-sorted here: two systems sorting the
 * same list by two rules is how the same member ends up with a different
 * "top area" on two screens.
 */
export function buildRootMap(input: {
  domains: DomainInterpretation[];
  patterns: PatternInsight[];
  routerOutcome: RootRouterOutcomeView;
  safetyGated: boolean;
  restrictedTopics: string[];
  /** Coach-view: restrictedTopics is echoed back for the coach's own awareness. Member-view (default) never shows a member her own restricted-topic list. */
  coachView?: boolean;
}): RootMapView {
  return {
    generatedAt: new Date().toISOString(),
    domains: input.domains.map((d) => buildDomainView(d, input.patterns)),
    routerOutcome: input.routerOutcome,
    safetyGated: input.safetyGated,
    restrictedTopics: input.coachView ? input.restrictedTopics : [],
  };
}
