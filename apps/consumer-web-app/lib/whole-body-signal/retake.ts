/**
 * What changed between two sittings. COACH ONLY.
 *
 * ONE RULE FOR "CHANGED", WRITTEN ONCE. A section moved when its rounded
 * percentage moved by at least the stored threshold
 * (whole_body_signal_settings, 'compare.min_delta_percent'). Everything
 * that says a section got quieter or louder reads that one rule, so two
 * places on one screen can never disagree about the same section.
 *
 * THE CHANGE IS PRINTED SIGNED AND WHOLE. 88 to 57 is minus 31, from the
 * two rounded numbers a coach can see, rather than from a difference of
 * two unrounded ones that would not add up on the screen.
 *
 * A SECTION WITH NO PRIOR IS NOT A CHANGE OF NOUGHT. It carries a null
 * previous and a null direction, because "this section did not exist in
 * the last sitting" and "this section has not moved" are different facts.
 */

import type { SectionResult, SignalLoad, WbsResults } from './types';

export type Direction = 'quieter' | 'unchanged' | 'louder';

export type SectionComparison = {
  sectionKey: string;
  currentPercent: number;
  previousPercent: number | null;
  currentBandKey: string;
  previousBandKey: string | null;
  /** Signed, in whole percentage points. Null when there is no prior. */
  delta: number | null;
  direction: Direction | null;
  /** True only when the band itself changed, which is what a contributor shift is shown for. */
  changedBand: boolean;
};

export function directionFor(delta: number, minDelta: number): Direction {
  if (delta <= -minDelta) return 'quieter';
  if (delta >= minDelta) return 'louder';
  return 'unchanged';
}

/**
 * Every section of the current sitting, next to the same section last time.
 *
 * Order follows the CURRENT sitting, loudest first, because that is the
 * order every other block on the coach's page draws in.
 */
export function compareSections(input: {
  current: WbsResults;
  previous: WbsResults | null;
  minDelta: number;
}): SectionComparison[] {
  const previousByKey = new Map<string, SectionResult>(
    (input.previous?.sections ?? []).map((section) => [section.sectionKey, section])
  );

  return input.current.sections.map((section) => {
    const prior = previousByKey.get(section.sectionKey) ?? null;
    if (!prior) {
      return {
        sectionKey: section.sectionKey,
        currentPercent: section.percent,
        previousPercent: null,
        currentBandKey: section.bandKey,
        previousBandKey: null,
        delta: null,
        direction: null,
        changedBand: false,
      };
    }
    const delta = section.percent - prior.percent;
    return {
      sectionKey: section.sectionKey,
      currentPercent: section.percent,
      previousPercent: prior.percent,
      currentBandKey: section.bandKey,
      previousBandKey: prior.bandKey,
      delta,
      direction: directionFor(delta, input.minDelta),
      changedBand: section.bandKey !== prior.bandKey,
    };
  });
}

export type ZoneShift = {
  previousZoneKey: string | null;
  currentZoneKey: string | null;
  /** False when either side is missing: an absence is not a shift. */
  changed: boolean;
};

/** The primary Zone last time beside the primary Zone this time, stated plainly. */
export function compareZones(current: WbsResults, previous: WbsResults | null): ZoneShift {
  const currentKey = current.zones[0]?.zoneKey ?? null;
  const previousKey = previous?.zones[0]?.zoneKey ?? null;
  return {
    previousZoneKey: previousKey,
    currentZoneKey: currentKey,
    changed: previousKey !== null && currentKey !== null && previousKey !== currentKey,
  };
}

export type LoadTrend = {
  current: SignalLoad;
  previous: SignalLoad | null;
  /** Signed whole points. Null when there is no prior sitting. */
  delta: number | null;
};

export function compareLoad(current: WbsResults, previous: WbsResults | null): LoadTrend {
  if (!previous) return { current: current.load, previous: null, delta: null };
  return {
    current: current.load,
    previous: previous.load,
    delta: current.load.value - previous.load.value,
  };
}
