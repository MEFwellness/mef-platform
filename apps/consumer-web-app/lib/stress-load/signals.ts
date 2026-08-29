/**
 * Q5's eight answers, mapped onto vocabularies this app already has.
 *
 * TWO MAPS, AND EACH ONE IS HONEST ABOUT WHAT IT CANNOT MAP.
 *
 * The first maps her answers onto the six Life Signal Check signals
 * (lib/life-signal-check/constants.ts), so Root can cross-reference what
 * her body says under load against what the Life Signal Check already
 * heard. Five of the eight correspond. "I get irritable or my mood shifts",
 * "Cravings show up" and "I get sick more easily" do NOT: the Life Signal
 * Check has no mood signal, no cravings signal and no illness signal, and
 * inventing a correspondence would put a member's answer under a heading
 * she never chose. They map to null, which reads as "no cross reference
 * available", never as "she did not say it".
 *
 * The second maps her answers onto the daily check-in's own wellness
 * metrics (lib/wellness/wellness-index.ts), which is what the check-in
 * cross-reference sentence actually reads. Five correspond, and the same
 * three do not, plus "My mind races", which no daily metric measures.
 *
 * Both maps are exhaustive over the option list, so adding a ninth answer
 * to Q5 forces a decision here rather than falling into a default.
 */

import type { Signal } from '../life-signal-check/constants';
import type { WellnessMetricKey } from '../wellness/wellness-index';

/** Q5 option value -> the Life Signal Check signal it corresponds to, or null when none honestly does. */
export const LSC_SIGNAL_BY_BODY_SIGNAL: Record<string, Signal | null> = {
  sleep: 'sleep',
  tension: 'tension',
  energy: 'energy',
  digestion: 'digestion',
  mood: null,
  cravings: null,
  mind: 'mind',
  illness: null,
};

/** Q5 option value -> the daily check-in metric that measures the same thing, or null when none does. */
export const WELLNESS_METRIC_BY_BODY_SIGNAL: Record<string, WellnessMetricKey | null> = {
  sleep: 'sleep',
  // Tension, tightness and aches is what the daily pain and discomfort
  // question asks about. It is the closest real per-day measure, and it is
  // the one Root Map already files structural discomfort under.
  tension: 'pain',
  energy: 'energy',
  digestion: 'digestion',
  mood: 'mood',
  cravings: null,
  mind: null,
  illness: null,
};

/** The Life Signal Check signals her Q5 answers correspond to, in the order she picked them, with the unmappable ones dropped. */
export function lscSignalsFor(selected: readonly string[]): Signal[] {
  const out: Signal[] = [];
  for (const value of selected) {
    const signal = LSC_SIGNAL_BY_BODY_SIGNAL[value];
    if (signal && !out.includes(signal)) out.push(signal);
  }
  return out;
}

/** The daily check-in metrics her Q5 answers correspond to, in the order she picked them, with the unmappable ones dropped. */
export function wellnessMetricsFor(selected: readonly string[]): WellnessMetricKey[] {
  const out: WellnessMetricKey[] = [];
  for (const value of selected) {
    const metric = WELLNESS_METRIC_BY_BODY_SIGNAL[value];
    if (metric && !out.includes(metric)) out.push(metric);
  }
  return out;
}
