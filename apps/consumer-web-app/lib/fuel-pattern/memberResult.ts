/**
 * Rooted Reset Fuel Pattern Assessment — the member facing payload, and
 * the fence around it.
 *
 * =====================================================================
 * WHAT CROSSES TO HER SCREEN, AND NOTHING ELSE DOES.
 * =====================================================================
 *
 * Her stored row carries three raw scores, a confidence level, two
 * denominators, every tendency code, the digestive discomfort flag and
 * her vitality answer. None of that is hers to read. Rather than asking
 * each member component to remember that, the whole member surface is fed
 * by ONE object built here, and that object has exactly two fields.
 *
 * Two things follow, and both are deliberate:
 *   - A component cannot print a score it was never handed.
 *   - A new field on the stored row does not silently arrive on her
 *     screen: it has to be added here first, on purpose.
 *
 * tests/fuel-pattern-member-payload.test.ts is the guard: it builds the
 * payload from a sitting with a high confidence and non zero scores and
 * asserts that nothing in the serialized object mentions either.
 *
 * BUILT FROM THE STORED ROW, NEVER FROM A RECOMPUTE. Her pattern and her
 * observations both come from the answers as they were stored, so a later
 * change to the weight map or to an observation rule cannot rewrite a
 * reading she has already been given for a sitting she already finished.
 */

import { selectFpaObservations } from './observations';
import type { FuelPattern } from './types';

export type FpaMemberResult = {
  /** The only thing about her reading that a member screen is handed. */
  pattern: FuelPattern;
  /**
   * The approved observation lines her answers support, strongest first.
   * Two, three or four of them, or empty when fewer than two qualified,
   * which is its own honest state and has its own line on the page.
   */
  observations: string[];
};

/** The shape this builder needs from the stored row. Deliberately not the whole row. */
export type FpaStoredReading = {
  pattern: FuelPattern;
  responses: Record<string, string>;
};

export function buildFpaMemberResult(stored: FpaStoredReading): FpaMemberResult {
  return {
    pattern: stored.pattern,
    observations: selectFpaObservations(stored.responses, stored.pattern).map((o) => o.text),
  };
}
