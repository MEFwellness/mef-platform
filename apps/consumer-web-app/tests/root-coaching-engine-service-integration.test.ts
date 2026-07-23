/**
 * Integration test for the Root Coaching Conversation Engine's orchestrator
 * (Prompt 13, lib/root-coaching-engine/service.ts) — exercises the
 * Adaptive Coaching Selector, Coaching Message Composer, and Coach Summary
 * Generator together over a single realistic fixture, the same way
 * app/actions/rootCoaching.ts calls them in production. No database: every
 * input here is the shape gatherAndPlan() would have already fetched.
 */
import { describe, it, expect } from 'vitest';
import { planCoachingConversation } from '../lib/root-coaching-engine/service';
import type { LongitudinalSignal } from '../lib/longitudinal-intelligence';
import type { RootRouterOutcomeView } from '../lib/investigation-engine/routerOutcome';
import type { MemberEngagementProfile } from '../lib/root-coaching-engine/types';

const NO_ACTION_OUTCOME: RootRouterOutcomeView = {
  outcome: 'no_action_needed',
  memberMessage: 'Nothing urgent right now.',
  investigation: null,
};

const NEUTRAL_ENGAGEMENT: MemberEngagementProfile = {
  consistencyLevel: 'mixed',
  hasUnfinishedExperimentPattern: false,
  deprioritizedTopicWords: new Set(),
};

describe('planCoachingConversation', () => {
  it('returns a null message and an honest empty-state summary when nothing is worth a conversation', () => {
    const plan = planCoachingConversation({
      signals: [],
      routerOutcome: NO_ACTION_OUTCOME,
      experiments: [],
      engagementProfile: NEUTRAL_ENGAGEMENT,
      recentMessages: [],
      asOfLocalDate: '2026-07-23',
    });

    expect(plan.chosenCandidate).toBeNull();
    expect(plan.message).toBeNull();
    expect(plan.workspaceSummary.currentPriorities).toHaveLength(0);
    expect(plan.workspaceSummary.suggestedDiscussionTopics).toHaveLength(0);
  });

  it('picks the highest-priority signal for the member message, and lists the rest as suggested discussion topics for the coach', () => {
    const signals: LongitudinalSignal[] = [
      {
        signalKey: 'checkin_metric::stress',
        signalKind: 'checkin_metric',
        signalLabel: 'stress',
        state: 'worsening',
        tier: 3,
        occurrenceCount: 4,
        confidence: 0.8,
        firstObservedAt: '2026-06-20T00:00:00Z',
        lastObservedAt: '2026-07-22T00:00:00Z',
        evidenceSummary: {},
      },
      {
        signalKey: 'checkin_metric::mood',
        signalKind: 'checkin_metric',
        signalLabel: 'mood',
        state: 'one_time_observation',
        tier: 1,
        occurrenceCount: 1,
        confidence: 0.4,
        firstObservedAt: '2026-07-22T00:00:00Z',
        lastObservedAt: '2026-07-22T00:00:00Z',
        evidenceSummary: {},
      },
    ];

    const plan = planCoachingConversation({
      signals,
      routerOutcome: NO_ACTION_OUTCOME,
      experiments: [],
      engagementProfile: NEUTRAL_ENGAGEMENT,
      recentMessages: [],
      asOfLocalDate: '2026-07-23',
    });

    expect(plan.chosenCandidate?.topicKey).toBe('checkin_metric::stress');
    expect(plan.message?.conversationType).toBe('worsening_trend');
    expect(plan.message?.coachingCard.toLowerCase()).toContain('stress');

    expect(plan.workspaceSummary.suggestedDiscussionTopics.map((t) => t.topicLabel)).toContain('your mood');
    expect(plan.workspaceSummary.currentPriorities[0]).toContain('your stress levels');
  });

  it('rotates phrasing based on how many times this exact topic has already been messaged', () => {
    const signal: LongitudinalSignal = {
      signalKey: 'checkin_metric::sleep',
      signalKind: 'checkin_metric',
      signalLabel: 'sleep',
      state: 'repeated_signal',
      tier: 2,
      occurrenceCount: 2,
      confidence: 0.6,
      firstObservedAt: '2026-07-10T00:00:00Z',
      lastObservedAt: '2026-07-21T00:00:00Z',
      evidenceSummary: {},
    };

    const freshPlan = planCoachingConversation({
      signals: [signal],
      routerOutcome: NO_ACTION_OUTCOME,
      experiments: [],
      engagementProfile: NEUTRAL_ENGAGEMENT,
      recentMessages: [],
      asOfLocalDate: '2026-07-22',
    });

    const laterPlan = planCoachingConversation({
      signals: [signal],
      routerOutcome: NO_ACTION_OUTCOME,
      experiments: [],
      engagementProfile: NEUTRAL_ENGAGEMENT,
      recentMessages: [
        {
          id: '1',
          memberId: 'm1',
          topicKey: 'checkin_metric::sleep',
          conversationType: 'repeated_signal',
          messageText: freshPlan.message!.coachingCard,
          messageHash: 'x',
          sourceState: 'repeated_signal',
          shownAt: '2026-07-21T09:00:00Z',
          createdAt: '2026-07-21T09:00:00Z',
        },
      ],
      // A different local date than the prior message's shown date, so this
      // topic isn't excluded by the same-day de-dup rule.
      asOfLocalDate: '2026-07-23',
    });

    expect(laterPlan.message).not.toBeNull();
    // Not a strict guarantee for every possible template, but true for this
    // fixture's rotation pools — asserts the mechanism actually engages
    // rather than silently reusing rotation index 0 every time.
    expect(laterPlan.message!.coachingCard).not.toBe(freshPlan.message!.coachingCard);
  });
});
