/**
 * What an experiment is ABOUT, said in one vocabulary that every experience
 * shares.
 *
 * The bug this exists for: the Readiness Pulse deliberately targets the
 * Life Signal Check's own loudest signal (lib/readiness-pulse/scoring.ts,
 * `targetSignal`) and inherits its hardest-time-of-day for the timing
 * phrase. So a member who finishes both is GUARANTEED two offers for the
 * same behavior, worded from two parallel copy tables: "take a genuine
 * 5-minute break in the mornings" from one and "take a real 5-minute break
 * in the mornings" from the other. Both guards that existed were scoped to
 * a single `source_experience_key`, so neither could see the other, and the
 * 2-active cap permits exactly two. Three production accounts were holding
 * that pair.
 *
 * A subject key is therefore NOT the source experience and NOT the title.
 * It names the thing itself, so "the Life Signal Check's Energy experiment"
 * and "the Readiness Pulse's Energy experiment" collide the way they
 * should, while "Daily Noticing" (the Readiness Pulse's own answer for a
 * member who is still deciding) stays a genuinely different offer and does
 * not.
 */

import { SIGNAL_BY_LABEL, type Signal } from '../life-signal-check/constants';
import { areaFromLabel, type ValueArea } from '../core-values-snapshot/constants';

/** A signal-shaped experiment: the Life Signal Check's chosen signal and the Readiness Pulse's target signal share this namespace on purpose, because they are the same behavior. */
export function signalSubjectKey(signal: Signal): string {
  return `signal:${signal}`;
}

/** A Core Values Snapshot experiment, named by the value area it protects. */
export function valueAreaSubjectKey(area: ValueArea): string {
  return `value:${area}`;
}

/**
 * An experience that has exactly one experiment of its own and never
 * targets a signal or a value: the five Happiness deep-dives, the Stress &
 * Load Deep-Dive, and the Readiness Pulse's two noticing patterns. Two
 * different experiences never collide here, which is correct, because they
 * really are asking for different things.
 */
export function experienceSubjectKey(experienceKey: string): string {
  return `experience:${experienceKey}`;
}

/** A Recommendation Engine experiment. One open experiment per recommendation, which is what the recommendation itself already means. */
export function recommendationSubjectKey(recommendationId: string): string {
  return `recommendation:${recommendationId}`;
}

/** The Readiness Pulse's "small" variant is the SAME subject as its full-size one: two honest minutes and five honest minutes are one behavior at two doses, so a member is never offered both. */
export function stripSmallSuffix(title: string): string {
  return title.replace(/ \(small\)$/, '');
}

/**
 * The subject of a row that was written before this column existed.
 *
 * Every pre-migration row has a null `subject_key` and is deliberately left
 * that way (backfilling would have meant rewriting a real member's running
 * experiment). Home still has to keep those rows from being duplicated by a
 * fresh offer, so their subject is recovered from what they already store:
 * a Life Signal Check or Readiness Pulse row's title is exactly
 * SIGNAL_LABEL[signal], and a Core Values Snapshot row's title is exactly
 * AREA_LABEL[area]. Both reverse lookups already existed for the daily
 * prompt; this is a third reader of them, not a second way of deriving it.
 */
export function resolveSubjectKey(experiment: {
  subjectKey: string | null;
  title: string;
  sourceExperienceKey: string | null;
  recommendationId: string | null;
}): string | null {
  if (experiment.subjectKey) return experiment.subjectKey;

  const { sourceExperienceKey, title, recommendationId } = experiment;

  if (sourceExperienceKey === 'life-signal-check' || sourceExperienceKey === 'readiness-pulse') {
    const signal = SIGNAL_BY_LABEL[stripSmallSuffix(title)];
    // A Readiness Pulse row titled "Daily Noticing" or "The Noticing" is
    // not signal-shaped and correctly falls through to its experience.
    if (signal) return signalSubjectKey(signal);
    return experienceSubjectKey(sourceExperienceKey);
  }

  if (sourceExperienceKey === 'core-values-snapshot') {
    const area = areaFromLabel(title);
    return area ? valueAreaSubjectKey(area) : experienceSubjectKey(sourceExperienceKey);
  }

  if (sourceExperienceKey) return experienceSubjectKey(sourceExperienceKey);
  if (recommendationId) return recommendationSubjectKey(recommendationId);
  return null;
}
