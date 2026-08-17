/**
 * Member Interpretation Layer — language must match tier.
 *
 * Below "supported by repeated check-ins", copy about a finding may not use
 * the words pattern, strength, corroborated or confirmed, or their
 * synonyms. A single assessment result is never called a pattern.
 *
 * Two mechanisms, and the first is the one that matters:
 *
 *   1. The layer AUTHORS its own statements from tier-scoped templates
 *      (./copy.ts), so the ordinary path produces compliant copy by
 *      construction rather than by inspection afterwards.
 *   2. `enforceTierLanguage` is the backstop for copy that came from
 *      somewhere else (a migrated surface, a stored narrative written by an
 *      adapter years ago). It does not attempt to rewrite prose, because a
 *      find-and-replace on a sentence about health is how you end up with a
 *      sentence that no longer means anything. It swaps the whole statement
 *      for an honest one at the right tier.
 *
 * The word list is scoped to copy ABOUT A FINDING. It is deliberately not
 * applied to the whole app: "consistency" is a real Root Score domain name
 * and "pattern" is a legitimate word once a signal has earned it.
 */

import { isSupportedOrBetter } from './tiers';
import type { EvidenceTier } from './types';

/**
 * The forbidden vocabulary below the supported tier, as data.
 *
 * Grouped by what each group claims, because the groups are the reason the
 * list is what it is rather than a longer or shorter list of words:
 *
 *   REPETITION   claims the thing has happened more than once
 *   ENDORSEMENT  claims the thing is good about her
 *   CERTAINTY    claims someone or something has checked it
 */
export const FORBIDDEN_BELOW_SUPPORTED: readonly string[] = [
  // Repetition
  'pattern',
  'patterns',
  'trend',
  'trends',
  'recurring',
  'recurrent',
  'consistently',
  'repeatedly',
  'habitually',
  'tendency',
  // Endorsement
  'strength',
  'strengths',
  'strong suit',
  'a real strength',
  'standout',
  // Certainty
  'corroborated',
  'confirmed',
  'confirms',
  'verified',
  'substantiated',
  'established',
  'proven',
  'definitive',
  'definitively',
  'certainly',
  'clearly shows',
  'reliable',
  'reliably',
];

/**
 * Word-boundary match, case-insensitive, so "patterns" is caught and
 * "patterned" is not a false positive on the plural. Multi-word entries are
 * matched as phrases.
 */
function occurrencesOf(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/** Every forbidden term present in this text, for a test to report on rather than just fail. */
export function forbiddenTermsIn(text: string, tier: EvidenceTier): string[] {
  if (isSupportedOrBetter(tier)) return [];
  return FORBIDDEN_BELOW_SUPPORTED.filter((term) => occurrencesOf(text, term));
}

export function violatesTierLanguage(text: string, tier: EvidenceTier): boolean {
  return forbiddenTermsIn(text, tier).length > 0;
}

/**
 * The backstop. Returns the text when it is compliant, and an honest
 * replacement when it is not.
 *
 * The replacement names the label and says what the evidence actually is,
 * which is the Case View voice: it is early, that is expected, and here is
 * what we do have. It never silently drops the finding, because a finding
 * that exists and is hidden is worse than one described modestly.
 */
export function enforceTierLanguage(text: string, tier: EvidenceTier, label: string): string {
  if (!violatesTierLanguage(text, tier)) return text;
  return tier === 'early_indication'
    ? `${label}: this came up once so far, so it is a direction rather than a conclusion.`
    : `${label}: this has come up more than once, and there is not enough behind it yet to lean on.`;
}
