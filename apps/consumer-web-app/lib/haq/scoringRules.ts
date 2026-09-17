/**
 * THE HAQ'S HIDDEN NUMBERS. Server and coach side only.
 *
 * Every number that decides a HAQ result lives here and nowhere else in the
 * code: the value behind each response, and each section's own cutoffs.
 * Migration 262 seeds `haq_response_scale` and `haq_section_cutoffs` from
 * this file (lib/haq/sql.ts), both tables have no member policy, and
 * tests/haq-member-safety.test.ts fails if any client component or any
 * member-safe HAQ module can reach this file through its imports.
 *
 * LOCKED RULES.
 * - Frequency: Never or rarely 0, Sometimes 1, Often 4, Very often 8.
 * - Yes / No: No 0, Yes 8.
 * - Each section uses only its own cutoffs. There is no universal range,
 *   no percentage, no overall combined score and no letter grade.
 * - Green is 0 to greenMax, Yellow is greenMax + 1 to yellowMax, Red is
 *   yellowMax + 1 and above.
 */

import type { HaqResponseType, HaqSectionId } from './types';

export const HAQ_HIDDEN_VALUES: {
  frequency: Record<'never_or_rarely' | 'sometimes' | 'often' | 'very_often', number>;
  yes_no: Record<'no' | 'yes', number>;
} = {
  frequency: { never_or_rarely: 0, sometimes: 1, often: 4, very_often: 8 },
  yes_no: { no: 0, yes: 8 },
};

export type HaqSectionCutoffs = { greenMax: number; yellowMax: number };

export const HAQ_SECTION_CUTOFFS: Record<HaqSectionId, HaqSectionCutoffs> = {
  haq_p1_a: { greenMax: 3, yellowMax: 7 },
  haq_p1_b: { greenMax: 3, yellowMax: 7 },
  haq_p1_c: { greenMax: 7, yellowMax: 15 },
  haq_p1_d: { greenMax: 7, yellowMax: 15 },
  haq_p2: { greenMax: 7, yellowMax: 15 },
  haq_p3_a: { greenMax: 15, yellowMax: 31 },
  haq_p3_b: { greenMax: 7, yellowMax: 15 },
  haq_p4_a: { greenMax: 15, yellowMax: 23 },
  haq_p4_b: { greenMax: 15, yellowMax: 23 },
  haq_p5_a: { greenMax: 7, yellowMax: 11 },
  haq_p5_b: { greenMax: 7, yellowMax: 15 },
  haq_p6_a: { greenMax: 11, yellowMax: 19 },
  haq_p6_b: { greenMax: 11, yellowMax: 19 },
  haq_p6_c: { greenMax: 7, yellowMax: 11 },
  haq_p7: { greenMax: 7, yellowMax: 11 },
  haq_p8: { greenMax: 7, yellowMax: 31 },
  haq_p9_a: { greenMax: 3, yellowMax: 7 },
  haq_p9_b: { greenMax: 3, yellowMax: 7 },
  haq_p9_c: { greenMax: 7, yellowMax: 15 },
  haq_p10_a: { greenMax: 7, yellowMax: 15 },
  haq_p10_b: { greenMax: 15, yellowMax: 31 },
};

/**
 * The hidden value of one response, or null when the response is not one
 * this response type accepts. Null is a refusal, never a zero.
 */
export function haqHiddenValue(responseType: HaqResponseType, response: string): number | null {
  const table = HAQ_HIDDEN_VALUES[responseType] as Record<string, number> | undefined;
  if (!table || !Object.prototype.hasOwnProperty.call(table, response)) return null;
  return table[response] ?? null;
}
