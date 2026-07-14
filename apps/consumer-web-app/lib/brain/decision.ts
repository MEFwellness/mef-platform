/**
 * The Coaching Brain's pure orchestrator — combines the priority, mode,
 * challenge, risk, and celebration engines into the one structured Daily
 * Decision Object every coaching surface consumes. No I/O, no LLM, fully
 * deterministic and unit-testable without a database (see
 * tests/coaching-brain.test.ts). lib/brain/service.ts is the only caller
 * that gathers real signals and supplies them here.
 */

import { pickPriority } from './priorityEngine';
import { pickMode } from './modeEngine';
import { pickChallengeLevel } from './challengeEngine';
import { pickRiskLevel } from './riskEngine';
import { pickCelebration } from './celebrationEngine';
import { focusDisplayLabel, buildReasonText } from './copy';
import { dailyEncouragement } from '../feed/encouragement';
import { buildWearableCoachingBrief } from './wearableRecommendations';
import type { CoachingFocusDecision, CoachingSignals } from './types';

export function buildCoachingDecision(signals: CoachingSignals): CoachingFocusDecision {
  const priority = pickPriority(signals);
  const mode = pickMode(signals, priority);
  const challengeLevel = pickChallengeLevel(signals.adherence.level, mode);
  const riskLevel = pickRiskLevel(signals);
  const celebration = pickCelebration(signals);

  return {
    localDate: signals.localDate,
    focus: priority.focus,
    focusLabel: focusDisplayLabel(priority.focus, mode),
    reason: priority.reason,
    reasonText: buildReasonText(priority.reason, priority.focus, mode, signals),
    mode,
    challengeLevel,
    riskLevel,
    isCelebration: celebration.isCelebration,
    encouragement: celebration.text ?? dailyEncouragement(signals.localDate),
    coachInsight: null, // attached by lib/brain/service.ts, which has the Member Coaching Memory this needs
    wearableBrief: buildWearableCoachingBrief(signals.wearableSnapshot),
    wearableSnapshot: signals.wearableSnapshot,
    generatedAt: new Date().toISOString(),
  };
}
