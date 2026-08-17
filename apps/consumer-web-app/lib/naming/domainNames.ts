/**
 * The one place a coaching domain's name is read.
 *
 * DECIDED 2026-08-17: one vocabulary, for everybody.
 *
 * Three of the twelve read clinically on a member's own screen ("Pain &
 * Structural Integrity", "Nutrition & Metabolic Health", "Stress & Nervous
 * System Regulation"), and they were also the coach's taxonomy from
 * docs/rooted-reset-method/METHODOLOGY.md, which is what made this a
 * decision rather than a find-and-replace: rename them for everyone, or
 * keep two vocabularies and hand each audience its own.
 *
 * One vocabulary won. Two vocabularies is the shape that produced most of
 * what the adaptive-reveal audit found, and a member and her coach
 * discussing one finding under two different names is the exact failure the
 * whole direction exists to remove. The coach's own screen already carries
 * the plain sentence next to every finding, so nothing was actually lost.
 *
 * So the rename happened in `lib/investigation-engine/domains.ts`, where the
 * taxonomy is defined, and there is no second name set here any more and no
 * switch to flip. This file survives as the ACCESSOR, unchanged in shape,
 * because "every surface that prints a domain name goes through one
 * function" is worth keeping whether or not there is currently a decision
 * riding on it.
 */

import { COACHING_DOMAINS, type CoachingDomain } from '../investigation-engine/domains';

/**
 * Kept in the signature deliberately. Nothing branches on it today, and if a
 * future build ever does need to say something differently to a coach, this
 * is where that would go rather than in a second table somewhere else.
 */
export type NameAudience = 'member' | 'coach';

/** The name to show for one coaching domain. The same one, to everybody. */
export function coachingDomainLabel(
  domain: CoachingDomain,
  _audience: NameAudience = 'member'
): string {
  const info = COACHING_DOMAINS.find((d) => d.domain === domain);
  if (!info) throw new Error(`Unknown CoachingDomain: ${domain}`);
  return info.label;
}

/** Every domain name currently in use, for the test that checks them all. */
export function allCoachingDomainLabels(): string[] {
  return COACHING_DOMAINS.map((d) => d.label);
}
