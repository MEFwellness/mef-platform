/**
 * Four Doctors premium results — the single centralized source of
 * per-category, per-zone guidance sentences shown on a Doctor Summary
 * Card's expanded state. Nothing in components/assessments/
 * four-doctors-results/ generates, infers, or composes guidance text of
 * its own, every card reads its one sentence from here, keyed by
 * `${categoryId}:${zoneId}`, and renders exactly what's here.
 *
 * None of this copy has been through content/coaching review yet, so
 * every entry is `approved: false` with placeholder text that says so
 * plainly rather than inventing something that reads as real coaching
 * advice. `getGuidance()` is the only way this file is read, so swapping
 * an entry to real, approved copy (and flipping `approved` to `true`) is
 * the entire follow-up task, no component changes needed.
 */

import type { ZoneId } from './zones';

export type GuidanceEntry = {
  approved: boolean;
  sentence: string;
};

type GuidanceKey = `${string}:${ZoneId}`;

function placeholder(categoryLabel: string, zoneLabel: string): GuidanceEntry {
  return {
    approved: false,
    sentence: `Draft placeholder: guidance for ${categoryLabel} in the ${zoneLabel} zone has not been written and approved yet.`,
  };
}

const CATEGORY_LABEL: Record<string, string> = {
  dr_happiness: 'Dr. Happiness',
  dr_quiet: 'Dr. Quiet',
  dr_diet: 'Dr. Diet',
  dr_movement: 'Dr. Movement',
};

const ZONE_LABEL: Record<ZoneId, string> = {
  work_in: 'Work-In',
  caution: 'Caution',
  workout_to_ability: 'Workout To Ability',
};

const GUIDANCE: Record<GuidanceKey, GuidanceEntry> = Object.fromEntries(
  Object.entries(CATEGORY_LABEL).flatMap(([categoryId, categoryLabel]) =>
    (Object.keys(ZONE_LABEL) as ZoneId[]).map((zoneId) => [
      `${categoryId}:${zoneId}` satisfies GuidanceKey,
      placeholder(categoryLabel, ZONE_LABEL[zoneId]),
    ])
  )
) as Record<GuidanceKey, GuidanceEntry>;

export function getGuidance(categoryId: string, zoneId: ZoneId): GuidanceEntry {
  return (
    GUIDANCE[`${categoryId}:${zoneId}`] ?? {
      approved: false,
      sentence: 'Draft placeholder: guidance for this category and zone has not been written yet.',
    }
  );
}
