/**
 * A SECOND, INDEPENDENT COPY OF THE HAQ SPECIFICATION, for the tests.
 *
 * Typed from the build prompt separately from lib/haq/questionBank.ts and
 * lib/haq/scoringRules.ts, so a value typed wrongly in the authored content
 * (and therefore also in the migration generated from it) fails the suite
 * instead of agreeing with itself.
 */

/** Section id to the number of questions the prompt lists under it. */
export const SPEC_SECTION_QUESTION_COUNTS: Array<[string, number]> = [
  ['haq_p1_a', 7],
  ['haq_p1_b', 9],
  ['haq_p1_c', 10],
  ['haq_p1_d', 9],
  ['haq_p2', 16],
  ['haq_p3_a', 15],
  ['haq_p3_b', 12],
  ['haq_p4_a', 16],
  ['haq_p4_b', 10],
  ['haq_p5_a', 7],
  ['haq_p5_b', 12],
  ['haq_p6_a', 9],
  ['haq_p6_b', 14],
  ['haq_p6_c', 8],
  ['haq_p7', 31],
  ['haq_p8', 12],
  ['haq_p9_a', 9],
  ['haq_p9_b', 13],
  ['haq_p9_c', 16],
  ['haq_p10_a', 16],
  ['haq_p10_b', 9],
];

/** Every question the prompt marks [YES/NO]. Everything else is FREQUENCY. */
export const SPEC_YES_NO_KEYS = [
  'haq_p1_b_q6',
  'haq_p1_d_q8',
  'haq_p1_d_q9',
  'haq_p2_q15',
  'haq_p2_q16',
  'haq_p3_a_q10',
  'haq_p3_a_q11',
  'haq_p3_a_q12',
  'haq_p3_a_q13',
  'haq_p3_a_q14',
  'haq_p3_a_q15',
  'haq_p3_b_q8',
  'haq_p3_b_q12',
  'haq_p4_b_q8',
  'haq_p4_b_q9',
  'haq_p4_b_q10',
  'haq_p5_b_q10',
  'haq_p5_b_q11',
  'haq_p5_b_q12',
  'haq_p6_a_q7',
  'haq_p6_a_q8',
  'haq_p6_a_q9',
  'haq_p7_q6',
  'haq_p7_q8',
  'haq_p7_q12',
  'haq_p7_q13',
  'haq_p7_q14',
  'haq_p7_q15',
  'haq_p7_q30',
  'haq_p7_q31',
  'haq_p9_b_q12',
  'haq_p9_b_q13',
  'haq_p10_a_q13',
  'haq_p10_a_q14',
  'haq_p10_a_q15',
  'haq_p10_a_q16',
];

export const SPEC_SPOT_CHECKS: Array<[string, string, 'frequency' | 'yes_no']> = [
  ['haq_p1_a_q1', 'After eating, do you experience indigestion or feel or taste food coming back up?', 'frequency'],
  ['haq_p4_a_q16', 'Feeling clumsy or poorly coordinated?', 'frequency'],
  [
    'haq_p7_q31',
    'Do symptoms involving your eyes, ears, nose, throat, or lungs seem to change with the seasons?',
    'yes_no',
  ],
  ['haq_p10_b_q9', 'Do you have a low tolerance for stress or everyday problems?', 'frequency'],
];

/** Every id the prompt lists, derived from the per section counts above. */
export function specQuestionKeys(): string[] {
  return SPEC_SECTION_QUESTION_COUNTS.flatMap(([sectionId, count]) =>
    Array.from({ length: count }, (_, index) => `${sectionId}_q${index + 1}`)
  );
}

/**
 * Each section's four boundary totals, from the prompt's own cutoffs:
 * top of Green, bottom of Yellow, top of Yellow, bottom of Red.
 */
export const SPEC_BOUNDARIES: Array<[sectionId: string, greenTop: number, yellowBottom: number, yellowTop: number, redBottom: number]> = [
  ['haq_p1_a', 3, 4, 7, 8],
  ['haq_p1_b', 3, 4, 7, 8],
  ['haq_p1_c', 7, 8, 15, 16],
  ['haq_p1_d', 7, 8, 15, 16],
  ['haq_p2', 7, 8, 15, 16],
  ['haq_p3_a', 15, 16, 31, 32],
  ['haq_p3_b', 7, 8, 15, 16],
  ['haq_p4_a', 15, 16, 23, 24],
  ['haq_p4_b', 15, 16, 23, 24],
  ['haq_p5_a', 7, 8, 11, 12],
  ['haq_p5_b', 7, 8, 15, 16],
  ['haq_p6_a', 11, 12, 19, 20],
  ['haq_p6_b', 11, 12, 19, 20],
  ['haq_p6_c', 7, 8, 11, 12],
  ['haq_p7', 7, 8, 11, 12],
  ['haq_p8', 7, 8, 31, 32],
  ['haq_p9_a', 3, 4, 7, 8],
  ['haq_p9_b', 3, 4, 7, 8],
  ['haq_p9_c', 7, 8, 15, 16],
  ['haq_p10_a', 7, 8, 15, 16],
  ['haq_p10_b', 15, 16, 31, 32],
];

/** The expected color at each of the four boundaries, in order. */
export const SPEC_BOUNDARY_COLORS = ['green', 'yellow', 'yellow', 'red'] as const;

export const SPEC_HIDDEN_VALUES: Array<['frequency' | 'yes_no', string, number]> = [
  ['frequency', 'never_or_rarely', 0],
  ['frequency', 'sometimes', 1],
  ['frequency', 'often', 4],
  ['frequency', 'very_often', 8],
  ['yes_no', 'no', 0],
  ['yes_no', 'yes', 8],
];
