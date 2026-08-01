/**
 * Body-Value Echo — the explicit adjacency mapping from a Core Values
 * Snapshot value area to the Life Signal Check signal(s) it's genuinely
 * adjacent to. Curious, never causal: this is a plausible, product-judgment
 * mapping (same "config in code" discipline as
 * lib/assessment-registry's relatedAssessmentKeys), not a derived or
 * statistical relationship. Not every signal has an adjacent value on
 * purpose — Sleep and Digestion don't map cleanly onto any of the six
 * Core Values Snapshot areas, so Body-Value Echo can never fire for those
 * two loudest signals, which is honest rather than a gap to fill.
 *
 *   health     (Health & Energy)          -> energy, body
 *     physical vitality and how the body is holding up are what this
 *     value is literally about.
 *   relationships (Close Relationships)    -> tension
 *     relational strain classically shows up as physical tension.
 *   growth     (Growth & Learning)         -> mind
 *     an unquiet, cluttered mind blocks the mental space growth needs.
 *   purpose    (Purpose & Meaningful Work) -> energy
 *     a purpose gap most often shows up as running out of steam.
 *   freedom    (Freedom & Play)            -> mind
 *     restlessness, an inability to settle, is the somatic signature of
 *     a life with no room for play.
 *   peace      (Peace & Calm)              -> mind, tension
 *     the build brief's own worked example.
 */

import type { ValueArea } from '../core-values-snapshot/constants';
import type { Signal } from './constants';

export const VALUE_ADJACENT_SIGNALS: Record<ValueArea, Signal[]> = {
  health: ['energy', 'body'],
  relationships: ['tension'],
  growth: ['mind'],
  purpose: ['energy'],
  freedom: ['mind'],
  peace: ['mind', 'tension'],
};

export function isAdjacent(topValue: ValueArea, signal: Signal): boolean {
  return VALUE_ADJACENT_SIGNALS[topValue].includes(signal);
}
