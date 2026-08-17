/**
 * The Visibility Layer — the public surface.
 *
 * One place decides what a member can see. Not "does this feature exist",
 * which is a question about the product, but "does this member need this
 * now", which is a question about her.
 *
 * The five rules the whole layer exists to hold:
 *
 *   1. The default is hidden. A thing renders because a rule says she needs
 *      it now, not because it exists.
 *   2. Nothing she has started, completed or logged data in ever
 *      disappears. Everything touched is grandfathered; hiding applies to
 *      the untouched.
 *   3. Revealed stays revealed, unless she or a coach hides it. No
 *      flickering in and out as her data moves.
 *   4. A coach may reveal or hide anything for anyone, and that wins.
 *   5. Safety is exempt in both directions. Safety features and the
 *      check-ins that feed safety monitoring can never be hidden from
 *      anyone, and a safety concern can reveal anything it needs to.
 */

export * from './types';
export * from './rules';
export * from './resolve';
export {
  VISIBILITY_CATALOG,
  DRIVER_DOMAIN_TO_FEATURE,
  F,
  INTAKE,
  getFeatureDefinition,
  listFeatureKeys,
  safetyCriticalKeys,
} from './catalog';
export { buildVisibilityContext, fetchIntakeAnswers } from './context';
export {
  fetchStoredVisibility,
  recordReveals,
  acknowledgeReveals,
  setFeatureVisibilityAsCoach,
  hideFeatureAsMember,
} from './data';
export {
  getMemberVisibility,
  buildMemberVisibility,
  canSee,
  featuresWithNoInferredRule,
} from './service';
