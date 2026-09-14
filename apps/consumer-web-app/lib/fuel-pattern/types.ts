/** Rooted Reset Fuel Pattern Assessment — the shapes the scoring engine produces and the results row stores. */

/** The three internal scoring directions. Raw scores are never shown to a member. */
export type FuelDirection = 'protein' | 'balanced' | 'carb';

/**
 * What one answer is worth.
 *
 *   protein    Protein +2, Balanced +1, Carb +0
 *   balanced   Protein +1, Balanced +2, Carb +1
 *   carb       Protein +0, Balanced +1, Carb +2
 *   neutral    "It varies", "I am not sure", "no pattern", "no difference".
 *              Zero points, and it counts toward the zero weight share
 *              that can make the result Flexible Fuel.
 *   tendency   An answer that describes neither direction (skips
 *              breakfast, wants something salty, appetite drops under
 *              stress). Zero points, stored as a response tendency, and
 *              it counts toward the same zero weight share.
 *   unscored   Never scored and never counted at all: the digestive
 *              discomfort option on Question 21, and every answer to
 *              Question 23.
 */
export type FpaWeightClass = 'protein' | 'balanced' | 'carb' | 'neutral' | 'tendency' | 'unscored';

export type FuelPattern = 'protein_supportive' | 'balanced_fuel' | 'carb_supportive' | 'flexible_fuel';

export type FpaConfidence = 'high' | 'moderate' | 'low';

export type FpaScores = Record<FuelDirection, number>;

export type FpaScoring = {
  pattern: FuelPattern;
  confidence: FpaConfidence;
  scores: FpaScores;
  /**
   * How many of the 23 scoring questions she answered with an answer that
   * carried a weight class other than 'unscored'. The denominator for
   * both the zero weight share and the confidence rule.
   */
  scoredQuestionCount: number;
  /** How many of those carried zero points (neutral or tendency). */
  zeroWeightCount: number;
  /** zeroWeightCount / scoredQuestionCount, or 0 when nothing was scored. */
  zeroWeightShare: number;
  /** (top - second) / top, or 0 when the top score is 0. */
  leadShare: number;
  /** Tendency codes she selected, in question order. Coach facing only. */
  tendencies: string[];
  /** True when she chose the Question 21 digestive discomfort option. */
  digestiveDiscomfort: boolean;
  /** Her Question 23 answer, or null when she did not answer it. */
  vitalityResponse: string | null;
  /** Every answer she gave, question key to stored value. */
  responses: Record<string, string>;
};
