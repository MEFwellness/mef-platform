/**
 * Root Score coaching copy — pure content, no calculation. Mirrors the
 * discipline lib/wellness/coaching.ts already established for the Daily
 * Wellness Index: supportive, correlation-worded, never shaming
 * ("your biggest opportunity is X", never "you failed at X"), and pain-
 * adjacent language always defers to a healthcare provider rather than
 * anything clinical. Callers pick which entries to use from real
 * calculated data (lib/scoring/explain.ts); nothing here decides which
 * domain is strongest or weakest.
 */

import type { ScoreDomainKey } from '@mef/shared-types-contracts';

export type DomainCopy = {
  /** e.g. "recovery deserves more attention" — used in the opportunity sentence. */
  opportunityPhrase: string;
  /** e.g. "your recovery is a real strength" — used in the strength sentence. */
  strengthPhrase: string;
  /** One concrete, doable next action tied to this domain. */
  nextAction: string;
  /**
   * Deep-link destination when one exists — never a dead route. Typed as
   * a literal union (not `string`) so Next's typedRoutes can verify each
   * one against the app's real route table at build time.
   */
  linkHref: '/checkin' | '/food-lens' | '/movement';
  linkLabel: string;
};

export const DOMAIN_COPY: Record<ScoreDomainKey, DomainCopy> = {
  recovery: {
    opportunityPhrase: 'recovery deserves more attention',
    strengthPhrase: 'your recovery is a real strength',
    nextAction: 'Wind down 30 minutes earlier tonight and keep tomorrow morning’s check-in consistent.',
    linkHref: '/checkin',
    linkLabel: 'Log tonight’s check-in',
  },
  stress: {
    opportunityPhrase: 'stress regulation is your clearest opportunity',
    strengthPhrase: 'your stress is well regulated',
    nextAction: 'Take 5 minutes for slow breathing or a short walk today.',
    linkHref: '/checkin',
    linkLabel: 'Log today’s check-in',
  },
  nutrition: {
    opportunityPhrase: 'nutrition patterns are your clearest opportunity',
    strengthPhrase: 'your nutrition patterns are a real strength',
    nextAction: 'Log your next meal in Food Lens so we can keep building an accurate picture.',
    linkHref: '/food-lens',
    linkLabel: 'Open Food Lens',
  },
  movement: {
    opportunityPhrase: 'movement consistency is your clearest opportunity',
    strengthPhrase: 'your movement consistency is a real strength',
    nextAction: 'Complete today’s movement session, even a short one.',
    linkHref: '/movement',
    linkLabel: 'Open Movement',
  },
  consistency: {
    opportunityPhrase: 'check-in consistency is your clearest opportunity',
    strengthPhrase: 'your check-in consistency is a real strength',
    nextAction: 'Check in today — consistency, not perfection, is what moves this score.',
    linkHref: '/checkin',
    linkLabel: 'Check in today',
  },
};

export const SAFETY_STATEMENT =
  'Root Score is a wellness coaching guide built from your own check-ins, activity, and assessments — it is not a medical diagnosis, a clinical measurement, or a prediction about your health.';
