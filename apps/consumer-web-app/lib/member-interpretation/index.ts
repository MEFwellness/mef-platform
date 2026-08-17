/**
 * Member Interpretation Layer — the public surface.
 *
 * One source of truth for what a member's data means. Every surface reads
 * from here instead of computing its own verdict: the Root Map, What We're
 * Noticing, Coaching Insights, the Wellness Profile, the Narrative, the
 * Recommendation Engine, Home and the Daily Brief, Root Score, and Talk to
 * Root.
 *
 * The three rules the whole layer exists to hold:
 *
 *   1. One source answer produces one canonical finding. It may be relevant
 *      to several domains and appear on several cards, cross referenced,
 *      and it counts once in every tally.
 *   2. Every finding carries one of exactly four evidence tiers, and a tier
 *      can only rise on member-provided evidence or coach confirmation.
 *      A background run can never raise one.
 *   3. A domain with active findings can never resolve to a quiet verdict.
 */

export * from './config';
export * from './types';
export * from './tiers';
export * from './language';
export * from './domainMap';
export * from './evidence';
export * from './copy';
export * from './findings';
export * from './domains';
export * from './dataFloor';
export * from './focus';
export { buildMemberInterpretation, getMemberInterpretation, fetchInterpretationCheckins } from './service';
