/**
 * Rooted Reset Fuel Pattern Assessment, Build 4 — the shapes the 7 Day
 * Fuel Experiment is made of.
 *
 * PURE. Nothing in this file reaches a database, a clock or a random
 * number, so her browser and the server share it without either of them
 * dragging the other's dependencies along.
 *
 * THE THREE ANSWER SETS ARE CLOSED, AND THEY ARE THE SAME THREE THE
 * MIGRATION'S CHECK CONSTRAINTS NAME. tests/fuel-pattern-experiment.test.ts
 * asserts that, so a fourth option added here and not there cannot ship.
 */

/** How her energy was. */
export const FPA_ENERGY_ANSWERS = ['low', 'steady', 'great'] as const;
export type FpaEnergyAnswer = (typeof FPA_ENERGY_ANSWERS)[number];

/** How hungry she was two to three hours later. */
export const FPA_HUNGER_ANSWERS = ['hungry', 'comfortable', 'still_very_full'] as const;
export type FpaHungerAnswer = (typeof FPA_HUNGER_ANSWERS)[number];

/** How clearly she was thinking. */
export const FPA_CLARITY_ANSWERS = ['foggy', 'normal', 'clear'] as const;
export type FpaClarityAnswer = (typeof FPA_CLARITY_ANSWERS)[number];

/** One quick check, as everything downstream reads it. */
export type FpaExperimentCheck = {
  id: string;
  /** The calendar day she logged it on, in her own timezone. */
  loggedOn: string;
  energy: FpaEnergyAnswer;
  hunger: FpaHungerAnswer;
  clarity: FpaClarityAnswer;
  /** The part of the day, when she said. Null is a real answer, not a gap. */
  mealType: string | null;
  /** A library meal id, when she tagged one. Always accompanied by its own meal type. */
  mealId: string | null;
  createdAt: string;
};

/** Why a run was put away. Never because it finished: a finished run stays finished. */
export type FpaExperimentArchiveReason = 'restarted' | 'retake';

/** How long one run lasts, in calendar days. */
export const FPA_EXPERIMENT_DAYS = 7;

/**
 * Where a run stands today.
 *
 *   active    day 1 through day 7, whether or not she has logged anything
 *   complete  the seventh day has passed
 *   archived  she restarted, or a retake ended it
 *
 * Only the last of those is stored. The other two are a question about
 * today's date, asked by fpaExperimentDayNumber.
 */
export type FpaExperimentStatus = 'active' | 'complete' | 'archived';
