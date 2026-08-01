/**
 * Guard tests for the Root Map redesign's member-facing descriptions
 * (Part 1). MEMBER_DOMAIN_DESCRIPTIONS is what app/root-map/page.tsx
 * renders via RootMapFindingCard/RootMapBuildingRow — the coach-facing
 * `definition` field (lib/investigation-engine/domains.ts) is untouched
 * and still says "the member" in several places by design.
 */
import { describe, it, expect } from 'vitest';
import { COACHING_DOMAINS } from '../lib/investigation-engine/domains';
import { MEMBER_DOMAIN_DESCRIPTIONS } from '../lib/root-map/memberCopy';

describe('MEMBER_DOMAIN_DESCRIPTIONS', () => {
  it('has an entry for every Coaching Domain', () => {
    for (const info of COACHING_DOMAINS) {
      expect(MEMBER_DOMAIN_DESCRIPTIONS[info.domain]).toBeTruthy();
    }
  });

  it('never contains the string "the member" — every description is second person', () => {
    for (const info of COACHING_DOMAINS) {
      expect(MEMBER_DOMAIN_DESCRIPTIONS[info.domain].toLowerCase()).not.toContain('the member');
    }
  });

  it('matches the exact copy specified for the redesign', () => {
    expect(MEMBER_DOMAIN_DESCRIPTIONS.sleep_circadian_rhythm).toBe(
      'How well you sleep, when you sleep, and whether your body clock is running on time.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.movement_physical_capacity).toBe(
      'How strong you feel, how freely you move, and how often you move.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.recovery_energy_regulation).toBe(
      'Whether your energy holds up through the day and how well you bounce back.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.pain_structural_integrity).toBe(
      'Where you hurt, how you hold yourself, and what your posture is telling us.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.nutrition_metabolic_health).toBe(
      'What and when you eat, and how your body handles it.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.digestion_gut_health).toBe(
      'How your gut feels day to day, and what tends to set it off.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.relationships_social_connection).toBe(
      'The people around you, and whether you feel supported by them.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.environment_daily_rhythm).toBe(
      'Your home and work setup, your daily routine, and the light you get.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.stress_nervous_system).toBe(
      "How much pressure you're under, and how well you come down from it."
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.emotional_resilience_mood).toBe(
      'Your mood over time, and what you do when it dips.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.identity_self_concept).toBe(
      'How you see yourself and your body right now, and what past attempts taught you.'
    );
    expect(MEMBER_DOMAIN_DESCRIPTIONS.purpose_motivation).toBe(
      'Your why: what matters to you, and what a good week actually looks like.'
    );
  });
});
