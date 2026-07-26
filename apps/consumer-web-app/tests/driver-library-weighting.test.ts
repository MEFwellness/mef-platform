import { describe, it, expect } from 'vitest';
import {
  BROAD_SAMPLING_SCORE,
  GOAL_WEIGHT_SCORE,
  goalWeightScoreForDriver,
  realWeightingGoals,
} from '../lib/driver-library/weighting';
import type { DriverGoalWeight } from '../lib/driver-library/types';

const WEIGHTS: DriverGoalWeight[] = [
  { driverId: 'STR-1', goalKey: 'reduce_pain', weight: 'high' },
  { driverId: 'STR-1', goalKey: 'increase_energy', weight: 'high' },
  { driverId: 'SLP-2', goalKey: 'reduce_pain', weight: 'high' },
  { driverId: 'SLP-2', goalKey: 'increase_energy', weight: 'high' },
  { driverId: 'SLP-2', goalKey: 'sleep_better', weight: 'high' },
  { driverId: 'MEC-4', goalKey: 'improve_posture_movement', weight: 'medium' },
];

describe('realWeightingGoals — Part 3\'s three special goals', () => {
  it('drops work_with_coach even alongside real goals', () => {
    expect(realWeightingGoals(['reduce_pain', 'work_with_coach'])).toEqual(['reduce_pain']);
  });

  it('drops understand_my_body and something_else too', () => {
    expect(realWeightingGoals(['understand_my_body', 'something_else', 'sleep_better'])).toEqual([
      'sleep_better',
    ]);
  });
});

describe('goalWeightScoreForDriver', () => {
  it('a driver unlisted for the member\'s goal scores "low"', () => {
    expect(goalWeightScoreForDriver('MEC-2', ['reduce_pain'], WEIGHTS)).toBe(GOAL_WEIGHT_SCORE.low);
  });

  it('a driver listed "high" for the member\'s goal scores "high"', () => {
    expect(goalWeightScoreForDriver('STR-1', ['reduce_pain'], WEIGHTS)).toBe(GOAL_WEIGHT_SCORE.high);
  });

  it('a driver shared across several selected goals rises to the top automatically — no extra logic', () => {
    // SLP-2 is 'high' under all three of pain/energy/sleep; a member who
    // picked only sleep_better should score the same as one who picked
    // all three, since "high" is already the ceiling — the real test is
    // that adding more goals never *lowers* the score.
    const oneGoal = goalWeightScoreForDriver('SLP-2', ['sleep_better'], WEIGHTS);
    const threeGoals = goalWeightScoreForDriver('SLP-2', ['reduce_pain', 'increase_energy', 'sleep_better'], WEIGHTS);
    expect(threeGoals).toBe(oneGoal);
    expect(threeGoals).toBe(GOAL_WEIGHT_SCORE.high);
  });

  it('takes the highest weight when goals disagree (medium goal + high goal on the same driver)', () => {
    const weights: DriverGoalWeight[] = [
      { driverId: 'MOV-6', goalKey: 'sleep_better', weight: 'medium' },
      { driverId: 'MOV-6', goalKey: 'healthier_habits', weight: 'high' },
    ];
    expect(goalWeightScoreForDriver('MOV-6', ['sleep_better', 'healthier_habits'], weights)).toBe(
      GOAL_WEIGHT_SCORE.high
    );
  });

  it('"Better understand my body" samples broadly rather than following a fixed weight table', () => {
    expect(goalWeightScoreForDriver('STR-1', ['understand_my_body'], WEIGHTS)).toBe(BROAD_SAMPLING_SCORE);
    expect(goalWeightScoreForDriver('MEC-2', ['understand_my_body'], WEIGHTS)).toBe(BROAD_SAMPLING_SCORE);
  });

  it('"Work directly with a coach" alone (no real goal) also falls back to broad sampling', () => {
    expect(goalWeightScoreForDriver('STR-1', ['work_with_coach'], WEIGHTS)).toBe(BROAD_SAMPLING_SCORE);
  });

  it('no goals on file at all also falls back to broad sampling, never zero', () => {
    expect(goalWeightScoreForDriver('STR-1', [], WEIGHTS)).toBe(BROAD_SAMPLING_SCORE);
  });

  it('"work directly with a coach" is ignored for weighting when real goals are also present, using the others instead', () => {
    const withCoach = goalWeightScoreForDriver('STR-1', ['reduce_pain', 'work_with_coach'], WEIGHTS);
    const withoutCoach = goalWeightScoreForDriver('STR-1', ['reduce_pain'], WEIGHTS);
    expect(withCoach).toBe(withoutCoach);
  });
});
