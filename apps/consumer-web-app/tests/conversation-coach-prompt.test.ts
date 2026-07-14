/**
 * Pure unit tests for lib/conversation-coach/prompt.ts — confirms the
 * system prompt is grounded in real, passed-in context (never invents
 * data), reflects the correct safety-mode instructions, and never leaks
 * internal-only fields (raw ids, confidence numbers, coach-only content)
 * into what would be sent to the model.
 */
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../lib/conversation-coach/prompt';
import type { ConversationContext } from '../lib/conversation-coach/context';
import type { CoachingFocusDecision } from '../lib/brain/types';
import type { CoachingPriorities } from '../lib/intelligence-engine/types';

function fakePriorities(overrides: Partial<CoachingPriorities> = {}): CoachingPriorities {
  return {
    primaryPriority: null,
    secondaryPriority: null,
    areaToMaintain: null,
    emergingConcern: null,
    strongestCurrentArea: null,
    recommendedCoachAttentionLevel: 'none',
    coachAttentionReason: null,
    ...overrides,
  };
}

function fakeDecision(overrides: Partial<CoachingFocusDecision> = {}): CoachingFocusDecision {
  return {
    localDate: '2026-07-12',
    focus: 'sleep',
    focusLabel: 'Sleep',
    reason: 'recent_checkins',
    reasonText: 'Your sleep has been inconsistent this week.',
    mode: 'encourage',
    challengeLevel: 'standard',
    riskLevel: 'none',
    isCelebration: false,
    encouragement: 'Small steps still count.',
    coachInsight: null,
    wearableBrief: null,
    wearableSnapshot: null,
    generatedAt: '2026-07-12T08:00:00.000Z',
    ...overrides,
  };
}

function fakeContext(overrides: Partial<ConversationContext> = {}): ConversationContext {
  return {
    memberFirstName: 'Jordan',
    localDate: '2026-07-12',
    dayOfWeek: 'Sunday',
    timeOfDayLabel: 'morning',
    decision: fakeDecision(),
    focusLabel: 'Sleep',
    todaysLessonTitle: 'Why sleep consistency matters',
    todaysAction: 'Go to bed 30 minutes earlier tonight.',
    restrictedTopics: [],
    confirmedInsights: [],
    narrativeHighlights: [],
    priorities: fakePriorities(),
    topHypothesis: null,
    identityHighlights: [],
    coachingStyleGuidance: null,
    entryContext: null,
    activeMemory: [],
    recentMessages: [],
    ...overrides,
  };
}

describe('buildSystemPrompt — grounding and identity', () => {
  it('instructs the model never to claim to be a chatbot, assistant, or name itself', () => {
    // The system prompt legitimately mentions "chatbot"/"ChatGPT"/"Claude" as
    // terms to explicitly disclaim — what must never happen is the prompt
    // instructing (or the coach claiming) that identity in the first person.
    const prompt = buildSystemPrompt(fakeContext(), 'standard_coaching');
    expect(prompt.toLowerCase()).not.toContain('i am chatgpt');
    expect(prompt.toLowerCase()).not.toContain('i am claude');
    expect(prompt.toLowerCase()).not.toContain('language model');
    expect(prompt.toLowerCase()).toContain('never say you are');
  });

  it('includes only the real member context provided, never fabricated data', () => {
    const context = fakeContext({ memberFirstName: 'Priya', focusLabel: 'Hydration' });
    const prompt = buildSystemPrompt(context, 'standard_coaching');
    expect(prompt).toContain('Priya');
    expect(prompt).toContain('Hydration');
    expect(prompt).toContain(context.decision.reasonText);
  });

  it('reflects real coaching-continuity memory when present', () => {
    const context = fakeContext({
      activeMemory: [
        {
          id: 'm1',
          member_id: 'u1',
          session_id: 's1',
          memory_type: 'barrier',
          content: 'Travel makes mornings hard.',
          source_message_id: null,
          is_active: true,
          created_at: '2026-07-01T00:00:00.000Z',
          updated_at: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    const prompt = buildSystemPrompt(context, 'standard_coaching');
    expect(prompt).toContain('Travel makes mornings hard.');
  });

  it('says "(none yet)" rather than fabricating narrative/insight content when there is none', () => {
    const prompt = buildSystemPrompt(fakeContext(), 'standard_coaching');
    expect(prompt).toContain('(none yet)');
  });

  it('lists restricted topics explicitly when present', () => {
    const prompt = buildSystemPrompt(
      fakeContext({ restrictedTopics: ['medication'] }),
      'standard_coaching'
    );
    expect(prompt).toContain('medication');
    expect(prompt.toLowerCase()).toContain('restricted');
  });
});

describe('buildSystemPrompt — safety mode instructions', () => {
  it('adds no extra caution instruction for standard_coaching', () => {
    const prompt = buildSystemPrompt(fakeContext(), 'standard_coaching');
    expect(prompt.toLowerCase()).not.toContain('coach conservatively');
  });

  it('adds a conservative-coaching instruction for coaching_with_caution', () => {
    const prompt = buildSystemPrompt(fakeContext(), 'coaching_with_caution');
    expect(prompt.toLowerCase()).toContain('conservatively');
  });

  it('adds a professional-referral instruction for medical_evaluation_recommended', () => {
    const prompt = buildSystemPrompt(fakeContext(), 'medical_evaluation_recommended');
    expect(prompt.toLowerCase()).toContain('healthcare professional');
  });

  it('always includes the hard scope limits regardless of mode', () => {
    for (const mode of [
      'standard_coaching',
      'coaching_with_caution',
      'medical_evaluation_recommended',
    ] as const) {
      const prompt = buildSystemPrompt(fakeContext(), mode);
      expect(prompt.toLowerCase()).toContain('never');
      expect(prompt.toLowerCase()).toContain('diagnos');
      expect(prompt.toLowerCase()).toContain('medication');
    }
  });
});
