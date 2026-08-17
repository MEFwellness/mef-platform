/**
 * The twelve coaching domain names, and the one switch that decides which
 * set is shown.
 *
 * JUDGMENT ITEM 1, AWAITING A DECISION. See docs/BUILD_STATUS.md for the
 * two options written out in full.
 *
 * Three of the twelve read clinically on the Root Map ring: "Pain &
 * Structural Integrity", "Nutrition & Metabolic Health", "Stress & Nervous
 * System Regulation". They are also the coach's taxonomy, straight out of
 * docs/rooted-reset-method/METHODOLOGY.md, and they are the vocabulary a
 * coach and a member are supposed to share when they discuss one finding.
 * Renaming them is therefore not a find-and-replace: it is a choice between
 * one vocabulary for both audiences and two vocabularies, one per audience,
 * and either choice has a real cost. That is why this file exists and why
 * nothing here has been switched on yet.
 *
 * What IS done, so that either answer is a one-line change:
 *
 *   - `coachingDomainLabel(domain, audience)` is the single accessor. Every
 *     surface that prints a domain name calls it, so there is exactly one
 *     place to change.
 *   - Both candidate name sets are written out below, in full, and both are
 *     asserted against docs/NAMING-STANDARD.md by the test suite. The
 *     plain set is real, finished copy, not a sketch.
 *   - `DOMAIN_NAME_MODE` is the switch. Flipping it to 'plain_for_members'
 *     is the entire implementation of option B.
 */

import { COACHING_DOMAINS, type CoachingDomain } from '../investigation-engine/domains';

export type NameAudience = 'member' | 'coach';

/**
 * 'shared' (current): one vocabulary, the coaching taxonomy, for everybody.
 * 'plain_for_members': members read PLAIN_DOMAIN_NAMES, coaches keep the
 * taxonomy.
 *
 * A third mode, "rename the taxonomy itself for everybody", is option A and
 * is implemented by editing COACHING_DOMAINS rather than by adding a mode,
 * because in that world there is only ever one set of names again.
 */
export const DOMAIN_NAME_MODE: 'shared' | 'plain_for_members' = 'shared';

/**
 * The plain set. Written for a member reading a ring segment on her own
 * screen with no coach next to her.
 *
 * The four uninstrumented domains keep names close to their originals
 * because none of them was ever clinical; only their coverage was the
 * problem, and that is already stated honestly on the card.
 */
export const PLAIN_DOMAIN_NAMES: Readonly<Record<CoachingDomain, string>> = {
  identity_self_concept: 'How you see yourself', // was "Identity & Self-Concept"
  purpose_motivation: 'What matters to you', // was "Purpose & Motivation"
  stress_nervous_system: 'Stress and how you settle', // was "Stress & Nervous System Regulation"
  emotional_resilience_mood: 'Mood and steadiness', // was "Emotional Resilience & Mood"
  sleep_circadian_rhythm: 'Sleep and your daily rhythm', // was "Sleep & Circadian Rhythm"
  movement_physical_capacity: 'Movement and what your body can do', // was "Movement & Physical Capacity"
  recovery_energy_regulation: 'Energy and recovery', // was "Recovery & Energy Regulation"
  pain_structural_integrity: 'Aches and how you hold yourself', // was "Pain & Structural Integrity"
  nutrition_metabolic_health: 'Food and how it fuels you', // was "Nutrition & Metabolic Health"
  digestion_gut_health: 'Digestion and how it settles', // was "Digestion & Gut Health"
  relationships_social_connection: 'People around you', // was "Relationships & Social Connection"
  environment_daily_rhythm: 'Your surroundings and daily routine', // was "Environment & Daily Rhythm"
};

/** The coaching taxonomy's own names, read from the one place they are defined. */
export function taxonomyDomainName(domain: CoachingDomain): string {
  const info = COACHING_DOMAINS.find((d) => d.domain === domain);
  if (!info) throw new Error(`Unknown CoachingDomain: ${domain}`);
  return info.label;
}

/**
 * The name to show for one coaching domain.
 *
 * Every surface that prints a domain name goes through here. Today both
 * audiences get the same answer, which is deliberate and is the thing under
 * decision, not an oversight.
 */
export function coachingDomainLabel(
  domain: CoachingDomain,
  audience: NameAudience = 'member'
): string {
  if (DOMAIN_NAME_MODE === 'plain_for_members' && audience === 'member') {
    return PLAIN_DOMAIN_NAMES[domain];
  }
  return taxonomyDomainName(domain);
}
