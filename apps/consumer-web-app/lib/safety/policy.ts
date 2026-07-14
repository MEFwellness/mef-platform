/**
 * Bump this whenever CONCERN_CATEGORIES or the classification logic in
 * classifier.ts changes in a way that could change a real classification
 * decision — every safety_classifications row stores the version that
 * produced it, so past decisions stay auditable against the policy that
 * was actually in effect at the time, even after this changes.
 */
export const SAFETY_POLICY_VERSION = 'safety-policy-v1';
