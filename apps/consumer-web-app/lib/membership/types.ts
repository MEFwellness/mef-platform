/**
 * Membership access, the vocabulary.
 *
 * These five tiers, three sources and three statuses are exactly the ones
 * supabase/migrations/00000000000159_membership_access_and_trial.sql
 * declares (member_access_tiers, and the two check constraints on
 * member_subscriptions). Keeping the lists here as `as const` arrays rather
 * than loose strings is what lets a test assert the database and the app
 * agree, which tests/membership-access-integration.test.ts does.
 *
 * NOT the same thing as lib/assessment-registry/membership.ts. That module
 * answers "which assessments may this member open" on the free_trial /
 * membership / holistic_reset vocabulary from migration 69, and it is
 * untouched by any of this. This module answers "may this member open the
 * app at all".
 */

/** The access tiers, in rank order. */
export const ACCESS_TIERS = ['none', 'trial', 'monthly', 'annual', 'program'] as const;
export type AccessTier = (typeof ACCESS_TIERS)[number];

export function isAccessTier(value: unknown): value is AccessTier {
  return typeof value === 'string' && (ACCESS_TIERS as readonly string[]).includes(value);
}

/**
 * How a tier was arrived at.
 *
 *   manual   Osei assigned it by hand. Protected at the database: nothing
 *            but the admin panel's own function can change it.
 *   billing  Reserved for the later in-app Stripe build. Nothing writes it
 *            today, and the app treats it identically to manual.
 *   system   The untouched 30 day trial stamped at account creation. Nobody
 *            assigned it, so a later billing build is free to convert it.
 */
export const ACCESS_SOURCES = ['manual', 'billing', 'system'] as const;
export type AccessSource = (typeof ACCESS_SOURCES)[number];

export function isAccessSource(value: unknown): value is AccessSource {
  return typeof value === 'string' && (ACCESS_SOURCES as readonly string[]).includes(value);
}

/** The assignment's own lifecycle. Present so the billing build has somewhere to record a cancellation or a failed renewal without a schema change. */
export const ACCESS_STATUSES = ['active', 'expired', 'canceled'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export function isAccessStatus(value: unknown): value is AccessStatus {
  return typeof value === 'string' && (ACCESS_STATUSES as readonly string[]).includes(value);
}

/** How each tier is named on a screen. The database carries the same strings in member_access_tiers.display_name. */
export const ACCESS_TIER_LABEL: Record<AccessTier, string> = {
  none: 'No access',
  trial: '30 day trial',
  monthly: 'Monthly',
  annual: 'Annual',
  program: '24 week program',
};

export const ACCESS_SOURCE_LABEL: Record<AccessSource, string> = {
  manual: 'Assigned by hand',
  billing: 'From billing',
  system: 'Automatic trial',
};

/**
 * One account's entitlement state, as the app reads it.
 *
 * Tied to the account and nothing else. There is deliberately no session,
 * token, cookie or request field anywhere in this shape: the same account
 * signed in on a second device resolves to the same row.
 */
export interface MemberSubscription {
  memberId: string;
  tier: AccessTier;
  source: AccessSource;
  status: AccessStatus;
  fullAccess: boolean;
  trialStartedAt: string;
  trialEndsAt: string;
}

/** What the app reads in one go: the subscription plus whether this is a seeded test account. */
export interface MemberAccessFacts {
  subscription: MemberSubscription | null;
  isTest: boolean;
}
