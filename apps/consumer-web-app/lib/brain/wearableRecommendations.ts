/**
 * Wearable-informed Daily Coaching Brief lines (Part 5) — same
 * one-function-per-concern, pure, no-I/O style as celebrationEngine.ts/
 * riskEngine.ts. Each function decides a status from real
 * WearableDailySnapshot data and hands it to copy.ts's shared coaching
 * voice for the actual sentence — this module owns the threshold logic,
 * never the wording, same split decision.ts already keeps between
 * "which reason wins" (priorityEngine.ts) and "what that reason sounds
 * like" (copy.ts's buildReasonText). Returns null exactly when there
 * isn't real wearable data to speak from — never a guess.
 */

import { detectRecoveryLevel } from '../wearables/trends';
import {
  recoveryLevelText,
  movementRecommendationText,
  stressLevelRecommendationText,
  sleepDurationRecommendationText,
} from './copy';
import type { WearableDailySnapshot } from '../wearables/snapshot';

export type WearableCoachingBrief = {
  recoveryStatus: string | null;
  movementRecommendation: string | null;
  stressRecommendation: string | null;
  sleepRecommendation: string | null;
};

export function buildRecoveryStatus(snapshot: WearableDailySnapshot): string | null {
  const level = detectRecoveryLevel(snapshot.readinessScore);
  return level ? recoveryLevelText(level) : null;
}

export function buildMovementRecommendation(snapshot: WearableDailySnapshot): string | null {
  if (snapshot.steps === null) return null;
  return movementRecommendationText(snapshot.steps);
}

export function buildStressRecommendation(snapshot: WearableDailySnapshot): string | null {
  if (snapshot.stressScore === null) return null;
  return stressLevelRecommendationText(snapshot.stressScore);
}

export function buildSleepRecommendation(snapshot: WearableDailySnapshot): string | null {
  if (snapshot.sleepDurationMinutes === null) return null;
  return sleepDurationRecommendationText(snapshot.sleepDurationMinutes / 60);
}

export function buildWearableCoachingBrief(
  snapshot: WearableDailySnapshot | null
): WearableCoachingBrief | null {
  if (!snapshot) return null;

  return {
    recoveryStatus: buildRecoveryStatus(snapshot),
    movementRecommendation: buildMovementRecommendation(snapshot),
    stressRecommendation: buildStressRecommendation(snapshot),
    sleepRecommendation: buildSleepRecommendation(snapshot),
  };
}
