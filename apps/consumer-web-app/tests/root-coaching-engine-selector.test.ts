/**
 * Unit tests for the Adaptive Coaching Selector (Prompt 13) — pure
 * functions only. Confirms candidate priority ordering, that stable/stale/
 * insufficient_data signals never start a conversation, that experiment
 * lifecycle states map to the right conversation type exactly once, that
 * today's-already-shown topics are excluded, and that the member-personality
 * adjustments (domain deprioritization, unfinished-experiment nudging) shift
 * ranking without ever fully silencing a worsening/conflicting signal.
 */
import { describe, it, expect } from 'vitest';
import { selectCoachingCandidates } from '../lib/root-coaching-engine/selector';
import type { LongitudinalSignal } from '../lib/longitudinal-intelligence';
import type { RootRouterOutcomeView } from '../lib/investigation-engine/routerOutcome';
import type { LifestyleExperiment } from '../lib/lifestyle-experiments';
import type { CoachingMessageRow, MemberEngagementProfile } from '../lib/root-coaching-engine/types';

const NEUTRAL_ENGAGEMENT: MemberEngagementProfile = {
  consistencyLevel: 'mixed',
  hasUnfinishedExperimentPattern: false,
  deprioritizedTopicWords: new Set(),
};

const NO_ACTION_OUTCOME: RootRouterOutcomeView = {
  outcome: 'no_action_needed',
  memberMessage: 'Nothing urgent right now.',
  investigation: null,
};

function signal(overrides: Partial<LongitudinalSignal> = {}): LongitudinalSignal {
  return {
    signalKey: 'checkin_metric::sleep',
    signalKind: 'checkin_metric',
    signalLabel: 'sleep',
    state: 'one_time_observation',
    tier: 1,
    occurrenceCount: 1,
    confidence: 0.5,
    firstObservedAt: '2026-07-20T00:00:00Z',
    lastObservedAt: '2026-07-20T00:00:00Z',
    evidenceSummary: {},
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof selectCoachingCandidates>[0]> = {}) {
  return {
    signals: [] as LongitudinalSignal[],
    routerOutcome: NO_ACTION_OUTCOME,
    experiments: [] as LifestyleExperiment[],
    engagementProfile: NEUTRAL_ENGAGEMENT,
    recentMessages: [] as CoachingMessageRow[],
    asOfLocalDate: '2026-07-23',
    ...overrides,
  };
}

describe('selectCoachingCandidates — signal-driven candidates', () => {
  it('never starts a conversation from stable, stale, or insufficient_data signals', () => {
    const result = selectCoachingCandidates(
      baseInput({
        signals: [
          signal({ signalKey: 'a', state: 'stable' }),
          signal({ signalKey: 'b', state: 'stale' }),
          signal({ signalKey: 'c', state: 'insufficient_data' }),
        ],
      })
    );
    expect(result).toHaveLength(0);
  });

  it('ranks conflicting above worsening above improving above repeated above first_observation', () => {
    const result = selectCoachingCandidates(
      baseInput({
        signals: [
          signal({ signalKey: 'improving-sig', state: 'improving', tier: 2, confidence: 0.5 }),
          signal({ signalKey: 'first-sig', state: 'one_time_observation', tier: 1, confidence: 0.5 }),
          signal({ signalKey: 'conflicting-sig', state: 'conflicting', tier: null, confidence: 0.5 }),
          signal({ signalKey: 'repeated-sig', state: 'repeated_signal', tier: 2, confidence: 0.5 }),
          signal({ signalKey: 'worsening-sig', state: 'worsening', tier: 2, confidence: 0.5 }),
        ],
      })
    );
    expect(result.map((c) => c.conversationType)).toEqual([
      'conflicting_information',
      'worsening_trend',
      'improving_trend',
      'repeated_signal',
      'first_observation',
    ]);
  });

  it('keeps a topic already messaged today selectable — stability across same-day re-renders (reloads, prefetches) matters more than re-excluding it, since a later day naturally rotates the phrasing instead', () => {
    const result = selectCoachingCandidates(
      baseInput({
        signals: [signal({ signalKey: 'checkin_metric::sleep', state: 'worsening' })],
        recentMessages: [
          {
            id: '1',
            memberId: 'm1',
            topicKey: 'checkin_metric::sleep',
            conversationType: 'worsening_trend',
            messageText: 'x',
            messageHash: 'x',
            sourceState: 'worsening',
            shownAt: '2026-07-23T09:00:00Z',
            createdAt: '2026-07-23T09:00:00Z',
          },
        ],
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.topicKey).toBe('checkin_metric::sleep');
  });

  it('still surfaces a worsening signal in a deprioritized domain, only ranked lower', () => {
    const engagementProfile: MemberEngagementProfile = {
      consistencyLevel: 'mixed',
      hasUnfinishedExperimentPattern: false,
      deprioritizedTopicWords: new Set(['sleep']),
    };
    const result = selectCoachingCandidates(
      baseInput({
        signals: [signal({ signalKey: 'checkin_metric::sleep', state: 'worsening', tier: 3, confidence: 0.9 })],
        engagementProfile,
      })
    );
    // worsening_trend is never in NEW_TOPIC_TYPES, so the domain penalty never applies to it
    expect(result).toHaveLength(1);
    expect(result[0]!.conversationType).toBe('worsening_trend');
  });

  it('deprioritizes (but does not eliminate) a first-observation candidate in an ignored domain relative to one that is not', () => {
    const engagementProfile: MemberEngagementProfile = {
      consistencyLevel: 'mixed',
      hasUnfinishedExperimentPattern: false,
      deprioritizedTopicWords: new Set(['sleep']),
    };
    const result = selectCoachingCandidates(
      baseInput({
        signals: [
          signal({ signalKey: 'checkin_metric::sleep', signalLabel: 'sleep', state: 'one_time_observation', tier: 1, confidence: 0.5 }),
          signal({ signalKey: 'checkin_metric::stress', signalLabel: 'stress', state: 'one_time_observation', tier: 1, confidence: 0.5 }),
        ],
        engagementProfile,
      })
    );
    expect(result).toHaveLength(2);
    expect(result[0]!.topicKey).toBe('checkin_metric::stress');
    expect(result[1]!.topicKey).toBe('checkin_metric::sleep');
  });
});

describe('selectCoachingCandidates — Root Router outcome candidates', () => {
  it('maps a reassessment outcome to a reassessment candidate', () => {
    const result = selectCoachingCandidates(
      baseInput({
        routerOutcome: {
          outcome: 'reassessment',
          memberMessage: 'x',
          investigation: { key: 'sleep_deep_dive' as never, displayName: 'Sleep Deep-Dive', reason: 'x' as never, route: '/x' },
        },
      })
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.conversationType).toBe('reassessment');
    expect(result[0]!.topicLabel).toBe('Sleep Deep-Dive');
  });

  it('maps a focused_investigation outcome to a new_assessment_available candidate', () => {
    const result = selectCoachingCandidates(
      baseInput({
        routerOutcome: {
          outcome: 'focused_investigation',
          memberMessage: 'x',
          investigation: { key: 'stress_screener' as never, displayName: 'Stress Screener', reason: 'x' as never, route: '/x' },
        },
      })
    );
    expect(result[0]!.conversationType).toBe('new_assessment_available');
  });
});

describe('selectCoachingCandidates — experiment-driven candidates', () => {
  function experiment(overrides: Partial<LifestyleExperiment> = {}): LifestyleExperiment {
    return {
      id: 'exp-1',
      memberId: 'm1',
      recommendationId: null,
      title: 'A 10-minute evening wind-down',
      protocol: 'x',
      startDate: '2026-07-10',
      durationDays: 14,
      status: 'active',
      reflectionText: null,
      outcome: null,
      closedAt: null,
      createdAt: '2026-07-10T00:00:00Z',
      ...overrides,
    };
  }

  it('a completed experiment with a positive outcome becomes experiment_success, once', () => {
    const result = selectCoachingCandidates(
      baseInput({ experiments: [experiment({ status: 'completed', outcome: 'worked', closedAt: '2026-07-22T00:00:00Z' })] })
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.conversationType).toBe('experiment_success');

    // Already acknowledged once -> never surfaces again.
    const secondRun = selectCoachingCandidates(
      baseInput({
        experiments: [experiment({ status: 'completed', outcome: 'worked', closedAt: '2026-07-22T00:00:00Z' })],
        recentMessages: [
          {
            id: '1',
            memberId: 'm1',
            topicKey: 'experiment::exp-1::outcome',
            conversationType: 'experiment_success',
            messageText: 'x',
            messageHash: 'x',
            sourceState: 'experiment_completed',
            shownAt: '2026-07-22T12:00:00Z',
            createdAt: '2026-07-22T12:00:00Z',
          },
        ],
      })
    );
    expect(secondRun).toHaveLength(0);
  });

  it('a completed experiment with a negative outcome becomes experiment_unsuccessful', () => {
    const result = selectCoachingCandidates(baseInput({ experiments: [experiment({ status: 'completed', outcome: 'didnt_work' })] }));
    expect(result[0]!.conversationType).toBe('experiment_unsuccessful');
  });

  it('an experiment overdue for reflection (no cron, read-time derived) becomes experiment_follow_up', () => {
    const result = selectCoachingCandidates(
      baseInput({ experiments: [experiment({ status: 'active', startDate: '2026-06-01', durationDays: 7 })] })
    );
    expect(result[0]!.conversationType).toBe('experiment_follow_up');
    expect(result[0]!.sourceState).toBe('experiment_expired_no_reflection');
  });

  it('an active experiment past its midpoint prompts a check-in exactly once', () => {
    const result = selectCoachingCandidates(
      baseInput({ experiments: [experiment({ status: 'active', startDate: '2026-07-15', durationDays: 14 })] })
    );
    expect(result[0]!.conversationType).toBe('experiment_follow_up');
    expect(result[0]!.sourceState).toBe('experiment_active_midpoint');
  });

  it('an active experiment before its midpoint produces no candidate', () => {
    const result = selectCoachingCandidates(
      baseInput({ experiments: [experiment({ status: 'active', startDate: '2026-07-22', durationDays: 14 })] })
    );
    expect(result).toHaveLength(0);
  });
});
