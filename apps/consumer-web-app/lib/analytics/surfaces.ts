/**
 * Product Analytics, the allowlists.
 *
 * Every value an analytics payload may ever carry is declared here, as a
 * closed set. Two reasons this is a hard allowlist rather than a free
 * string:
 *
 *   1. Safety. Client components call the analytics server actions, so the
 *      surface/feature/action strings arrive from the browser. Validating
 *      against these lists is what guarantees a caller can never smuggle
 *      health content (a check-in answer, a pain location, free text) into
 *      an analytics payload. This is the hard line the instrumentation
 *      brief draws, enforced in code rather than by convention.
 *   2. Queryability. A closed set means an analytics query can group by
 *      `payload->>'surface'` and get stable, comparable buckets instead of
 *      whatever string a call site happened to type that day.
 *
 * Adding a value here is the deliberate act of deciding a new behavioral
 * bucket exists. Never add anything that describes what a member answered,
 * only what they opened, tapped, or finished.
 */

/** Every major surface a member can open. One `surface_viewed` event type, the surface name in the payload. */
export const PRODUCT_SURFACES = [
  'home',
  'daily_reset',
  'daily_reset_evening',
  'food_lens',
  'progress',
  'today',
  'your_case',
  'movement',
  'questionnaires',
  'questionnaire',
  'conversation',
  'reset_plan',
  'root_score',
  'insights',
  'noticing',
  'recommendations',
  'membership',
  'profile',
  'body_assessment',
] as const;

export type ProductSurface = (typeof PRODUCT_SURFACES)[number];

export function isProductSurface(value: unknown): value is ProductSurface {
  return typeof value === 'string' && (PRODUCT_SURFACES as readonly string[]).includes(value);
}

/**
 * Features that emit a `feature_engaged` event, "the member did something
 * here", as distinct from "the member opened this", which is
 * `surface_viewed`. Today's Focus and the Reset Plan are the two the
 * instrumentation brief names explicitly; the rest are the surfaces that
 * already had a real, discrete interaction worth separating from a view.
 */
export const ENGAGEABLE_FEATURES = [
  'todays_focus',
  'reset_plan',
  'food_lens',
  'daily_reset',
  'questionnaire',
] as const;

export type EngageableFeature = (typeof ENGAGEABLE_FEATURES)[number];

export function isEngageableFeature(value: unknown): value is EngageableFeature {
  return typeof value === 'string' && (ENGAGEABLE_FEATURES as readonly string[]).includes(value);
}

/**
 * What a member did, for `feature_engaged`. Deliberately generic verbs, not
 * content: "answered" never carries the answer, "opened_item" never carries
 * which health topic the item was about.
 */
export const ENGAGEMENT_ACTIONS = [
  'opened_item',
  'completed_item',
  'dismissed_item',
  'started',
  'advanced',
  'completed',
  'logged_day',
  'chose_focus',
  'chose_action_tier',
  'acknowledged',
] as const;

export type EngagementAction = (typeof ENGAGEMENT_ACTIONS)[number];

export function isEngagementAction(value: unknown): value is EngagementAction {
  return typeof value === 'string' && (ENGAGEMENT_ACTIONS as readonly string[]).includes(value);
}

/**
 * Priority Card — which rule in the selection hierarchy won today. Exactly
 * the vocabulary migration 147's own `rule` check constraint uses and
 * lib/priority/types.ts's PriorityRule declares, so an analytics rollup
 * groups by the same buckets the engine actually decided between.
 *
 * A rule name says which KIND of thing Root chose, never what the thing
 * was: 'implicated_driver' records that a driver won, never which driver,
 * never its evidence, never the finding sentence shown alongside it.
 */
export const PRIORITY_RULES = [
  're_entry',
  'reset_plan_commitment',
  'implicated_driver',
  'incomplete_action',
  'todays_focus',
  'daily_reset',
  'gentle_focus',
] as const;

export type PriorityRuleSlug = (typeof PRIORITY_RULES)[number];

export function isPriorityRule(value: unknown): value is PriorityRuleSlug {
  return typeof value === 'string' && (PRIORITY_RULES as readonly string[]).includes(value);
}

/**
 * How the priority reached the member. 'popup' is the Root pop-up chain on
 * open, 'inline' is the card sitting on Home or Today. Recorded once per
 * member per day, so this answers "did she meet her priority as an
 * interruption or by browsing to it" without ever double-counting one
 * day's card as several priorities.
 */
export const PRIORITY_PRESENTATIONS = ['popup', 'inline'] as const;

export type PriorityPresentation = (typeof PRIORITY_PRESENTATIONS)[number];

export function isPriorityPresentation(value: unknown): value is PriorityPresentation {
  return typeof value === 'string' && (PRIORITY_PRESENTATIONS as readonly string[]).includes(value);
}

/** The Priority Card's three buttons, carried in the payload's `action` field. */
export const PRIORITY_ACTIONS = ['done', 'help', 'save'] as const;

export type PriorityActionSlug = (typeof PRIORITY_ACTIONS)[number];

export function isPriorityAction(value: unknown): value is PriorityActionSlug {
  return typeof value === 'string' && (PRIORITY_ACTIONS as readonly string[]).includes(value);
}

/**
 * Why a locked or premium marker was shown. Mirrors the existing
 * `lockReasonKind` values lib/assessment-registry/status.ts already
 * produces, so a paywall event lines up with the gating system that caused
 * it rather than inventing a parallel vocabulary.
 */
export const PAYWALL_LOCK_REASONS = [
  'membership',
  'not_assigned',
  'program_enrollment',
  'program_phase',
  'prerequisite',
  'free_tier_preview',
] as const;

export type PaywallLockReason = (typeof PAYWALL_LOCK_REASONS)[number];

export function isPaywallLockReason(value: unknown): value is PaywallLockReason {
  return typeof value === 'string' && (PAYWALL_LOCK_REASONS as readonly string[]).includes(value);
}

/**
 * Which feature a paywall was blocking. Registry assessment keys are the
 * common case, so rather than duplicating that list here, a paywall feature
 * is validated as "a bounded, lowercase slug", it always originates from a
 * registry key or one of the fixed strings below, never from member input.
 */
const PAYWALL_FEATURE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isPaywallFeature(value: unknown): value is string {
  return typeof value === 'string' && PAYWALL_FEATURE_PATTERN.test(value);
}
