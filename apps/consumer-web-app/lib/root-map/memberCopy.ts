/**
 * Root Map — member-facing dimension descriptions (Root Map redesign,
 * 2026-07-28). Separate from `CoachingDomainInfo.definition`
 * (lib/investigation-engine/domains.ts), which stays exactly as-is for the
 * coach-facing Root Map (RootMapPanel.tsx) and RootMapDomainCard.tsx. These
 * are second person, written for the member reading about themselves —
 * `definition` is third person ("the member"), written for a coach reading
 * about a client. Never merge the two: a member should never see internal
 * schema language like "the member" on their own screen.
 */

import type { CoachingDomain } from '../investigation-engine/domains';

export const MEMBER_DOMAIN_DESCRIPTIONS: Record<CoachingDomain, string> = {
  sleep_circadian_rhythm:
    'How well you sleep, when you sleep, and whether your body clock is running on time.',
  movement_physical_capacity: 'How strong you feel, how freely you move, and how often you move.',
  recovery_energy_regulation:
    'Whether your energy holds up through the day and how well you bounce back.',
  pain_structural_integrity: 'Where you hurt, how you hold yourself, and what your posture is telling us.',
  nutrition_metabolic_health: 'What and when you eat, and how your body handles it.',
  digestion_gut_health: 'How your gut feels day to day, and what tends to set it off.',
  relationships_social_connection: 'The people around you, and whether you feel supported by them.',
  environment_daily_rhythm: 'Your home and work setup, your daily routine, and the light you get.',
  stress_nervous_system: "How much pressure you're under, and how well you come down from it.",
  emotional_resilience_mood: 'Your mood over time, and what you do when it dips.',
  identity_self_concept: 'How you see yourself and your body right now, and what past attempts taught you.',
  purpose_motivation: 'Your why: what matters to you, and what a good week actually looks like.',
};

// ---------------------------------------------------------------------
// The one line of orientation above the map (2026-09-05).
// ---------------------------------------------------------------------

/**
 * What the map is, and how much of it has anything on it yet.
 *
 * A COUNT, NOT A CLAIM, and it names the population it counted, which is
 * the standing rule for any counted sentence a member reads. "Something
 * has been noticed in 3 of your 12 areas" says exactly what the gold
 * segments say and nothing more: not that three things are wrong, not that
 * nine are fine, not that anything has been measured. The number comes
 * from the same predicate that colours the ring
 * (components/root-map/ringDomains.ts's `colorFor`), so the sentence and
 * the picture cannot disagree.
 *
 * Zero is its own sentence rather than "0 of 12", because a member on her
 * first week is not looking at a score of nought. It says what will make
 * the map fill in, which is the only honest thing available.
 */
export function buildRootMapOrientationLine(noticedCount: number, totalAreas: number): string {
  if (noticedCount <= 0) {
    return `Your wellbeing across ${totalAreas} areas. Nothing has been noticed in any of them yet, and this fills in as you check in.`;
  }
  if (noticedCount === 1) {
    return `Your wellbeing across ${totalAreas} areas. Gold marks the one where something has been noticed so far.`;
  }
  return `Your wellbeing across ${totalAreas} areas. Gold marks the ${noticedCount} where something has been noticed so far.`;
}

/** The reveal that holds the twelve entries, and the key that names them. */
export const ROOT_MAP_ALL_AREAS_LABEL = 'See all 12 areas';

/** How to use the map, once the key is a tap away rather than under it. */
export const ROOT_MAP_TAP_HINT =
  'Tap a segment on the map, or a name in the key below, to jump to that area.';
