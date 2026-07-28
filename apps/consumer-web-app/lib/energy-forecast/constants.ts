/**
 * Forecast & Calibration Loop — named thresholds, all in one place per
 * this codebase's own convention (see correlation-engine/evidence.ts).
 */

/**
 * Root will not produce a forecast at all until it has at least this many
 * real, previously-recorded energy_level values to average — a rolling
 * mean of fewer than 3 points is not a genuine basis, it's an echo of
 * whatever the last one or two days happened to be. Deliberately much
 * lower than the correlation engine's MIN_PAIRED_OBSERVATIONS (21,
 * "roughly three weeks") — a next-day energy forecast is a much smaller
 * claim than a correlation, and the whole point of this loop is to give
 * her a working return hook well before three weeks of history exists.
 */
export const ROOT_FORECAST_MIN_HISTORY_DAYS = 3;

/** How many of her most recent real energy_level values feed Root's rolling-average forecast. */
export const ROOT_FORECAST_WINDOW_DAYS = 7;

/**
 * Fewer than this many scored forecasts and a percentage is noise, not a
 * finding — 1/1 or 2/3 swings too wildly to mean anything. Chosen small
 * enough to be reachable inside two weeks of normal use, but large enough
 * that the number stops flipping wildly with every new result. Applies
 * identically to her calibration and Root's — the calibration section
 * (percentages + chart) only ever renders once BOTH clear this bar, so
 * the two are always shown side by side, never one alone.
 */
export const MIN_SCORED_FORECASTS_FOR_CALIBRATION = 5;

/** A scored forecast counts as "accurate" when it lands within this many points of the real answer, on the 1-5 scale. */
export const ACCURACY_TOLERANCE = 1;

/**
 * Population standard deviation ceiling, on the 1-5 scale, above which
 * Root's recent history is too erratic to have a stable center to call —
 * same discipline as ROOT_FORECAST_MIN_HISTORY_DAYS, just gating on shape
 * instead of count. A history that alternates between 1 and 5 has a
 * population stddev of 2; one that alternates between adjacent points
 * (e.g. 2,3,2,3) is close to 0.5. 1.4 sits between "normal day-to-day
 * variation" and "no real center," chosen so a genuinely bouncing history
 * abstains rather than reporting a mean that isn't a real prediction of
 * anything.
 */
export const ROOT_FORECAST_MAX_VOLATILITY = 1.4;
