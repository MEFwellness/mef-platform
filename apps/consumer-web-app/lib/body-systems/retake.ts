/**
 * What changed between two sittings.
 *
 * TWO COMPARISONS, AND THEY ARE NOT THE SAME COMPARISON.
 *
 *   The MEMBER's compare view is per SECTION, in loudness language only:
 *   this time next to last time, quieter, unchanged or louder. Nothing
 *   about a pattern, an association or a cause.
 *
 *   The COACH's comparison is per PATTERN. Every association that fired
 *   last time or this time is classified quieter, unchanged, louder,
 *   resolved, or joined by new related signals.
 *
 * WHAT "QUIETER" MEANS IS ONE RULE, WRITTEN ONCE. A section moved when its
 * rounded percentage moved by at least the stored threshold
 * (body_systems_settings, 'compare.min_delta_percent'). A pattern moved
 * when its own section moved, which keeps the member's word and the
 * coach's word about the same body system from ever disagreeing.
 *
 * A pattern with no section of its own (a cross system meta pattern) is
 * compared on how many answers it cites instead, which is the only thing
 * about it that can honestly be said to have grown or shrunk.
 */

import type { BodySystemsResults, FiredAssociation, SectionResult } from './types';

export type Direction = 'quieter' | 'unchanged' | 'louder';

export type SectionComparison = {
  sectionKey: string;
  /** Her rounded percentage in the sitting being read. */
  currentPercent: number;
  /** Her rounded percentage last time, or null when this section has no prior. */
  previousPercent: number | null;
  currentBandKey: string;
  previousBandKey: string | null;
  /** Null when there is no prior to compare against. */
  direction: Direction | null;
};

/** How many whole percentage points count as a move. Read from body_systems_settings. */
export const DEFAULT_MIN_DELTA_PERCENT = 1;

export function directionFor(
  currentPercent: number,
  previousPercent: number,
  minDelta: number
): Direction {
  const delta = currentPercent - previousPercent;
  if (delta <= -minDelta) return 'quieter';
  if (delta >= minDelta) return 'louder';
  return 'unchanged';
}

/**
 * Every section of the current sitting, next to the same section last
 * time.
 *
 * Order follows the CURRENT sitting, loudest first, because that is the
 * order both screens draw and a compare view that reordered itself would
 * be a second order for one fact.
 */
export function compareSections(input: {
  current: BodySystemsResults;
  previous: BodySystemsResults | null;
  minDelta?: number;
}): SectionComparison[] {
  const minDelta = input.minDelta ?? DEFAULT_MIN_DELTA_PERCENT;
  const previousBySection = new Map<string, SectionResult>(
    (input.previous?.sections ?? []).map((section) => [section.sectionKey, section])
  );

  return input.current.sections.map((section) => {
    const previous = previousBySection.get(section.sectionKey) ?? null;
    return {
      sectionKey: section.sectionKey,
      currentPercent: section.percent,
      previousPercent: previous?.percent ?? null,
      currentBandKey: section.bandKey,
      previousBandKey: previous?.bandKey ?? null,
      direction: previous ? directionFor(section.percent, previous.percent, minDelta) : null,
    };
  });
}

export type PatternChange =
  | 'quieter'
  | 'unchanged'
  | 'louder'
  | 'resolved'
  | 'joined_by_new_related_signals';

export type PatternComparison = {
  entryCode: string;
  title: string;
  sectionKey: string | null;
  sectionName: string | null;
  change: PatternChange;
  /** Present for a pattern that still fires. Null for one that has resolved. */
  current: FiredAssociation | null;
};

/**
 * Every pattern that fired in either sitting, classified.
 *
 * The five outcomes, and exactly when each one is reached:
 *
 *   resolved      fired last time, does not fire now.
 *   joined by     fires now, fired last time, and a DIFFERENT pattern in
 *   new related   the same section fires now that did not fire last time.
 *   signals       Checked before direction, because "something new turned
 *                 up beside it" is the more useful thing to say about a
 *                 pattern than "and it is two points louder".
 *   louder        fires now, and its section moved up by the threshold
 *   quieter       fires now, and its section moved down by the threshold
 *   unchanged     fires now, and its section did not move. A pattern that
 *                 fires for the FIRST time is 'louder': it was not there
 *                 and now it is, which is the only honest direction for
 *                 something that has appeared.
 */
export function comparePatterns(input: {
  current: FiredAssociation[];
  previous: FiredAssociation[];
  sectionComparisons: SectionComparison[];
}): PatternComparison[] {
  const previousCodes = new Set(input.previous.map((entry) => entry.entryCode));
  const currentCodes = new Set(input.current.map((entry) => entry.entryCode));
  const directionBySection = new Map(
    input.sectionComparisons.map((entry) => [entry.sectionKey, entry.direction])
  );

  const newCodesBySection = new Map<string, number>();
  for (const entry of input.current) {
    if (previousCodes.has(entry.entryCode)) continue;
    const key = entry.sectionKey ?? '';
    newCodesBySection.set(key, (newCodesBySection.get(key) ?? 0) + 1);
  }

  const out: PatternComparison[] = [];

  for (const entry of input.current) {
    const wasThere = previousCodes.has(entry.entryCode);

    if (!wasThere) {
      out.push({
        entryCode: entry.entryCode,
        title: entry.title,
        sectionKey: entry.sectionKey,
        sectionName: entry.sectionName,
        change: 'louder',
        current: entry,
      });
      continue;
    }

    const newBeside = newCodesBySection.get(entry.sectionKey ?? '') ?? 0;
    if (newBeside > 0) {
      out.push({
        entryCode: entry.entryCode,
        title: entry.title,
        sectionKey: entry.sectionKey,
        sectionName: entry.sectionName,
        change: 'joined_by_new_related_signals',
        current: entry,
      });
      continue;
    }

    const direction = entry.sectionKey ? directionBySection.get(entry.sectionKey) : null;
    out.push({
      entryCode: entry.entryCode,
      title: entry.title,
      sectionKey: entry.sectionKey,
      sectionName: entry.sectionName,
      change: direction ?? 'unchanged',
      current: entry,
    });
  }

  for (const entry of input.previous) {
    if (currentCodes.has(entry.entryCode)) continue;
    out.push({
      entryCode: entry.entryCode,
      title: entry.title,
      sectionKey: entry.sectionKey,
      sectionName: entry.sectionName,
      change: 'resolved',
      current: null,
    });
  }

  return out;
}

/** The copy key holding each outcome's word. */
export const PATTERN_CHANGE_COPY_KEY: Readonly<Record<PatternChange, string>> = {
  quieter: 'coach.pattern_quieter',
  unchanged: 'coach.pattern_unchanged',
  louder: 'coach.pattern_louder',
  resolved: 'coach.pattern_resolved',
  joined_by_new_related_signals: 'coach.pattern_joined',
};

/** The copy key holding each member facing direction's word. */
export const DIRECTION_COPY_KEY: Readonly<Record<Direction, string>> = {
  quieter: 'member.compare_quieter',
  unchanged: 'member.compare_unchanged',
  louder: 'member.compare_louder',
};
