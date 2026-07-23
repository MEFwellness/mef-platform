/**
 * Investigation Engine — domain-level Confidence aggregation (Focused
 * Investigation Library §6). Reuses the exact real formulas already in
 * production rather than inventing new ones:
 *
 *  - `CONFIDENCE_THRESHOLDS` (lib/scoring/config.ts) for the numeric ->
 *    label mapping, the one standard used everywhere else in the codebase.
 *  - The exact cross-instrument corroboration formula already live in
 *    `lib/intelligence-engine/crossAssessmentCorrelations.ts`:
 *    `min(0.9, average(confidenceA, confidenceB) + 0.1)`.
 *
 * Library §6's rule: a Coaching Domain's Confidence label is the HIGHER of
 * (a) the numeric-threshold label of its single strongest active entry,
 * and (b) a `moderate` floor granted only when two or more entries from
 * DIFFERENT `source_feature` values (i.e. different investigations, not
 * two items within the same instrument) are both active in that domain.
 * A single instrument, no matter how deep, cannot corroborate itself.
 *
 * Scope note: this reads only the current snapshot of active findings —
 * it does not yet apply Method §7 step 3's recency decay (a domain
 * untouched for N days should also lose confidence). That's a real,
 * intentionally deferred next step, not an oversight — see the
 * corresponding note in unlockEngine.ts's Priority function.
 */

import type { RegistryEntry } from '@mef/shared-types-contracts';
import { CONFIDENCE_THRESHOLDS } from '../scoring/config';
import { COACHING_DOMAIN_TO_REGISTRY_DOMAIN } from './domains';
import type { CoachingDomain } from './domains';

export type ConfidenceLabel = 'building' | 'low' | 'moderate' | 'high';

export type DomainConfidence = {
  label: ConfidenceLabel;
  numeric: number;
  /** True when 2+ distinct investigations each have an active entry in this domain. */
  corroborated: boolean;
};

export function labelForNumericConfidence(value: number): ConfidenceLabel {
  if (value >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (value >= CONFIDENCE_THRESHOLDS.moderate) return 'moderate';
  if (value >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'building';
}

export function computeDomainConfidence(
  domain: CoachingDomain,
  activeFindings: RegistryEntry[]
): DomainConfidence {
  const registryDomains = new Set(COACHING_DOMAIN_TO_REGISTRY_DOMAIN[domain]);
  const matching = activeFindings.filter((f) => f.status === 'active' && registryDomains.has(f.domain));

  if (matching.length === 0) {
    return { label: 'building', numeric: 0, corroborated: false };
  }

  const strongest = matching.reduce((max, f) => (f.confidence > max.confidence ? f : max));

  // Strongest entry per distinct source (investigation) — corroboration
  // requires two DIFFERENT investigations, never two items within one.
  const strongestBySource = new Map<string, RegistryEntry>();
  for (const f of matching) {
    const existing = strongestBySource.get(f.source_feature);
    if (!existing || f.confidence > existing.confidence) strongestBySource.set(f.source_feature, f);
  }

  const corroborated = strongestBySource.size >= 2;
  let numeric = strongest.confidence;

  if (corroborated) {
    const [top, second] = [...strongestBySource.values()].sort((a, b) => b.confidence - a.confidence);
    const corroboratedNumeric =
      Math.round(Math.min(0.9, (top!.confidence + second!.confidence) / 2 + 0.1) * 100) / 100;
    // Library §6's "moderate floor granted" — corroboration guarantees at
    // least CONFIDENCE_THRESHOLDS.moderate regardless of the computed
    // corroboration value, matching the spec's literal wording.
    numeric = Math.max(numeric, corroboratedNumeric, CONFIDENCE_THRESHOLDS.moderate);
  }

  return { label: labelForNumericConfidence(numeric), numeric, corroborated };
}
