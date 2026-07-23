/**
 * The Member Root Map (Method §2, §4 stage 2; Root Model and Router §16
 * closing recommendation 6: "Build a genuine member-facing Root Map — the
 * coach-facing Root Cause Signals view is real and rich; nothing
 * equivalent renders to the member today"). Computed on read, never
 * persisted — the same precedent MemberHealthProfile and Root Score both
 * already established (a plain read composition, not a stored composite
 * row); Root Model and Router §11's "no new stored enum should be created
 * to unify these vocabularies" applies here too.
 */

import type { CoachingDomain } from '../investigation-engine/domains';
import type { CoachingPriorityLevel } from '../investigation-engine/types';
import type { DomainConfidence } from '../investigation-engine/confidence';
import type { PatternInsight } from '../intelligence-engine/types';
import type { RootRouterOutcomeView } from '../investigation-engine/routerOutcome';

/**
 * A lightweight, non-persisted inference over today's signals only —
 * Method Recommendation 8 calls for pressure-testing per-domain Stage
 * (Method §10's full five-stage model) against real member data before
 * committing it to schema. This deliberately only ever infers the first
 * three of the Method's five stages; Integration and Renewal both require
 * real longitudinal per-domain history nothing in this codebase tracks
 * yet, so this never claims either rather than guessing.
 */
export type RootMapStage = 'discovery' | 'stabilization' | 'optimization';

export type RootMapDomainView = {
  domain: CoachingDomain;
  label: string;
  definition: string;
  isUninstrumented: boolean;
  stage: RootMapStage;
  confidence: DomainConfidence;
  priority: CoachingPriorityLevel;
  /** Plain-language observations already gathered — empty when nothing qualifies yet. */
  whatWeUnderstand: string[];
  /** Always present — an honest, member-safe sentence about what's still uncertain here. */
  whatWereStillLearning: string;
  /** One short, plain-language line — always present, derived from this domain's own confidence/priority, never a fabricated specific action. */
  currentRecommendation: string;
  /** Always present — the concrete next step that follows from currentRecommendation. */
  nextSuggestedStep: string;
  /**
   * Best-effort match against this domain's own vocabulary tokens — see
   * builder.ts's docblock for why this isn't a strict foreign-key
   * relationship (PatternInsight carries no CoachingDomain field today).
   */
  patterns: PatternInsight[];
};

export type RootMapView = {
  generatedAt: string;
  /** Always all twelve Coaching Domains — uninstrumented domains are shown, never hidden (Method Recommendation 2: they're real coaching territory the platform doesn't instrument yet, not domains to bury). */
  domains: RootMapDomainView[];
  /** The one member-wide "what's next," from the Root Router's outcome classification. */
  routerOutcome: RootRouterOutcomeView;
  safetyGated: boolean;
  /** Only ever populated for the coach-view variant — a member never sees the raw restricted-topic list about themselves. */
  restrictedTopics: string[];
};
