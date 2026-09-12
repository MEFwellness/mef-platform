/**
 * The editable numbers, named once, with the fallback each one takes when
 * its row is missing.
 *
 * WHY A TYPE AND NOT A BAG OF STRINGS. Every number this instrument
 * decides with is a row in whole_body_signal_settings, and a caller
 * reaching into a record by a string key is a typo away from silently
 * scoring with a nought. This resolves the whole set once, at load, so
 * every module downstream is handed real numbers.
 *
 * THE FALLBACKS ARE THE SPECIFICATION'S OWN VALUES. They exist so a
 * missing row degrades to the approved behaviour rather than to zero
 * weighting, and tests/whole-body-signal-content.test.ts fails if the
 * seeded row and the fallback here ever disagree.
 */

export type WbsSettings = {
  weightA: number;
  weightB: number;
  weightC: number;
  elevatedMinPercent: number;
  topComponentCount: number;
  secondaryZoneMinPercent: number;
  secondaryZoneMinRatio: number;
  zoneTopContributorCount: number;
  maxCoachingQuestions: number;
  maxPriorities: number;
  maxMemberThemes: number;
  strongMinSignal: number;
  moderateSignal: number;
  minDeltaPercent: number;
};

export const SETTING_KEYS: Record<keyof WbsSettings, string> = {
  weightA: 'load.weight_a',
  weightB: 'load.weight_b',
  weightC: 'load.weight_c',
  elevatedMinPercent: 'load.elevated_min_percent',
  topComponentCount: 'load.top_component_count',
  secondaryZoneMinPercent: 'zone.secondary_min_percent',
  secondaryZoneMinRatio: 'zone.secondary_min_ratio',
  zoneTopContributorCount: 'zone.top_contributor_count',
  maxCoachingQuestions: 'coaching.max_questions',
  maxPriorities: 'priorities.max',
  maxMemberThemes: 'member.max_themes',
  strongMinSignal: 'why.strong_min_signal',
  moderateSignal: 'why.moderate_signal',
  minDeltaPercent: 'compare.min_delta_percent',
};

export const DEFAULT_SETTINGS: WbsSettings = {
  weightA: 0.6,
  weightB: 0.25,
  weightC: 0.15,
  elevatedMinPercent: 50,
  topComponentCount: 3,
  secondaryZoneMinPercent: 25,
  secondaryZoneMinRatio: 0.6,
  zoneTopContributorCount: 3,
  maxCoachingQuestions: 6,
  maxPriorities: 2,
  maxMemberThemes: 3,
  strongMinSignal: 3,
  moderateSignal: 2,
  minDeltaPercent: 1,
};

/** Stored rows to real numbers, falling back one key at a time rather than all or nothing. */
export function resolveSettings(rows: Record<string, number>): WbsSettings {
  const out = { ...DEFAULT_SETTINGS };
  for (const name of Object.keys(SETTING_KEYS) as (keyof WbsSettings)[]) {
    const value = rows[SETTING_KEYS[name]];
    if (typeof value === 'number' && Number.isFinite(value)) out[name] = value;
  }
  return out;
}
