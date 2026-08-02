import type { Signal } from '../life-signal-check/constants';
import type { ValueArea } from '../core-values-snapshot/constants';
import type { CvsScoring } from '../core-values-snapshot/types';
import type { LscScoring } from '../life-signal-check/types';
import type { RplScoring } from '../readiness-pulse/types';
import type { Q6Answer, ReadinessPattern } from '../readiness-pulse/constants';
import type { ActionTier, ResetPlanDailyState, ResetPlanDay3Response, ResetPlanScreen, ResetPlanStatus } from './constants';

/**
 * The accuracy backbone — recomputed once at plan creation from each
 * experience's own real, completed session via its own real scoring
 * engine. Every field degrades gracefully to null when that experience
 * has no completed session, rather than ever being invented.
 */
export type ResetPlanSnapshot = {
  topValue: ValueArea | null;
  loudestSignal: Signal | null;
  finalReadinessPattern: ReadinessPattern | null;
  q6Obstacle: Q6Answer | null;
  /** Readiness Pulse's own targetSignal when a Readiness Pulse session exists, otherwise Life Signal Check's own loudestSignal, otherwise null. The real proposal candidate for Screen 2. */
  targetSignal: Signal | null;
  cvs: CvsScoring | null;
  lsc: LscScoring | null;
  rpl: RplScoring | null;
  computedAt: string | null;
};

export const EMPTY_RESET_PLAN_SNAPSHOT: ResetPlanSnapshot = {
  topValue: null,
  loudestSignal: null,
  finalReadinessPattern: null,
  q6Obstacle: null,
  targetSignal: null,
  cvs: null,
  lsc: null,
  rpl: null,
  computedAt: null,
};

export type ResetPlan = {
  id: string;
  memberId: string;
  status: ResetPlanStatus;
  currentScreen: ResetPlanScreen;
  focusSignal: Signal | null;
  actionTier: ActionTier | null;
  snapshot: ResetPlanSnapshot;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  /** The member's own local date the plan went active — day-3/day-7 eligibility is computed from this. Null until activation. */
  startLocalDate: string | null;
  day7AcknowledgedAt: string | null;
};

export type ResetPlanDailyLog = {
  id: string;
  planId: string;
  planVersionId: string;
  localDate: string;
  /** Null when this row exists only to carry a day3Response, or once existed before a state was ever tapped — never treated as an implicit "not_today". */
  state: ResetPlanDailyState | null;
  day3Response: ResetPlanDay3Response | null;
  loggedAt: string;
};

export type ResetPlanVersion = {
  id: string;
  planId: string;
  changeType: 'created' | 'focus_chosen' | 'action_tier_chosen' | 'activated';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  decisionEvidence: Record<string, unknown> | null;
  changedAt: string;
};

/** Screen 2's decision — never written as tone-preference evidence. */
export type FocusDecisionEvidence = {
  proposedSignal: Signal | null;
  chosenSignal: Signal;
  followedProposal: boolean;
};

/** Screen 4's decision — never written as tone-preference evidence. */
export type ActionTierDecisionEvidence = {
  proposedTier: ActionTier;
  chosenTier: ActionTier;
  shrunk: boolean;
};
