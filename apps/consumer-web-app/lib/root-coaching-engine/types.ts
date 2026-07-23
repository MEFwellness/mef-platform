/**
 * Root Coaching Conversation Engine (Prompt 13) — the conversation layer
 * sitting on top of every engine this series already built. Nothing here
 * classifies a new signal, ranks a new recommendation, or decides a new
 * next-investigation: every field on CoachingCandidate traces back to an
 * already-computed LongitudinalSignal (lib/longitudinal-intelligence/), a
 * LifestyleExperiment (lib/lifestyle-experiments/), or a RootRouterOutcomeView
 * (lib/investigation-engine/routerOutcome.ts). This module's only job is
 * turning "what do we already know" into a short, coach-voiced message with
 * a reason behind it.
 */

import type { LifestyleExperimentOutcome } from '@/lib/lifestyle-experiments';

export type ConversationType =
  | 'first_observation'
  | 'repeated_signal'
  | 'improving_trend'
  | 'worsening_trend'
  | 'conflicting_information'
  | 'new_assessment_available'
  | 'reassessment'
  | 'experiment_follow_up'
  | 'experiment_success'
  | 'experiment_unsuccessful';

/** One thing Root could bring up today, ranked and reasoned — never a random pick. */
export type CoachingCandidate = {
  conversationType: ConversationType;
  /** Stable dedup/memory key — a LongitudinalSignal.signalKey, "experiment::<id>::outcome|overdue|midpoint", or "router::reassessment|investigation::<AssessmentKey>". Never shown to the member. */
  topicKey: string;
  /** Member-safe topic phrase, e.g. "your sleep" or "Shoulder discomfort" or an experiment's own title — never a raw code, domain key, or confidence number. */
  topicLabel: string;
  priority: number;
  /** Days since this topic was first observed/started — drives "I remember/last month" phrasing. */
  historyDepthDays: number;
  occurrenceCount: number;
  /** Coach-facing only (Coach Workspace), e.g. the SignalState or RootRouterOutcome this traces to — never rendered to a member. */
  sourceState: string;
  experimentOutcome?: LifestyleExperimentOutcome | null;
};

export type ComposedCoachingMessage = {
  /** 1 sentence — dashboard card. */
  dashboardLine: string;
  /** 2-3 sentences — chat preview. */
  chatPreview: string;
  /** Observation -> explanation -> action -> encouragement, max 120 words. */
  coachingCard: string;
};

export type CoachingMessageView = ComposedCoachingMessage & {
  conversationType: ConversationType;
};

export type ConsistencyLevel = 'high' | 'mixed' | 'low';

/** Reused member history, adapted tone only — never a new engine, never shaming language. */
export type MemberEngagementProfile = {
  consistencyLevel: ConsistencyLevel;
  /** Starts experiments but rarely finishes one — nudge toward closing the loop before opening a new one. */
  hasUnfinishedExperimentPattern: boolean;
  /** Domain words (e.g. "sleep") the member has repeatedly disengaged from — new low-urgency topics in these areas are deprioritized, never fully hidden. */
  deprioritizedTopicWords: ReadonlySet<string>;
};

export type SuggestedDiscussionTopic = {
  conversationType: ConversationType;
  topicLabel: string;
  sourceState: string;
  questions: string[];
};

export type CoachWorkspaceSummary = {
  conversationSummary: string;
  currentPriorities: string[];
  recentCoachingThemes: string[];
  suggestedDiscussionTopics: SuggestedDiscussionTopic[];
};

export type CoachingMessageRow = {
  id: string;
  memberId: string;
  topicKey: string;
  conversationType: ConversationType;
  messageText: string;
  messageHash: string;
  sourceState: string | null;
  shownAt: string;
  createdAt: string;
};
