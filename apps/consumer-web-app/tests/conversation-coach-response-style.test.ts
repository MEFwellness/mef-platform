/**
 * Verifies the response-style refinement to the MEF Coach's voice
 * (lib/conversation-coach/prompt.ts) and every static, non-LLM template
 * string a member can actually see. The prompt itself can only be tested
 * for what it INSTRUCTS (a live model call isn't deterministic and isn't
 * exercised here); every literal template string under our own control
 * (fallback replies, the safety-blocked reply, the approved safety
 * message copy) is tested directly for the concrete "never use em
 * dashes" rule, since those are fully within our control.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../lib/conversation-coach/prompt';
import {
  buildFallbackReply,
  SAFETY_BLOCKED_REPLY_FALLBACK,
} from '../lib/conversation-coach/fallback';
import type { ConversationContext } from '../lib/conversation-coach/context';
import type { CoachingFocusDecision } from '../lib/brain/types';
import type { CoachingPriorities } from '../lib/intelligence-engine/types';

const EM_DASH = '—';

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
    focusLabel: 'Movement',
    todaysLessonTitle: 'Why a short walk helps',
    todaysAction: 'Take a 10-minute walk today, at whatever pace feels comfortable.',
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

describe('buildSystemPrompt — no em dashes anywhere in the instructions', () => {
  const variants: Array<[string, ConversationContext]> = [
    ['plain context', fakeContext()],
    ['with restricted topics', fakeContext({ restrictedTopics: ['medication', 'diagnosis'] })],
    [
      'with continuity memory',
      fakeContext({
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
        confirmedInsights: ['Stress has been trending up over the last two weeks.'],
        narrativeHighlights: ['Barrier to adherence: travel disrupts the morning routine.'],
      }),
    ],
  ];

  for (const [label, context] of variants) {
    for (const mode of [
      'standard_coaching',
      'coaching_with_caution',
      'medical_evaluation_recommended',
    ] as const) {
      it(`contains no em dash for ${label} (${mode})`, () => {
        const prompt = buildSystemPrompt(context, mode);
        expect(prompt).not.toContain(EM_DASH);
      });
    }
  }
});

/** The prompt's source constants wrap across lines for readability, so a
 * phrase spanning a wrap point contains a literal newline rather than a
 * space (semantically identical to the model, but not to a naive
 * substring match). Assertions below normalize whitespace first so they
 * verify the actual instruction, not the source's line width. */
function normalizeWhitespace(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

describe('buildSystemPrompt — style direction is actually instructed', () => {
  const prompt = normalizeWhitespace(buildSystemPrompt(fakeContext(), 'standard_coaching'));

  it('instructs leading with the main point', () => {
    expect(prompt).toContain('lead with the main point');
  });

  it('instructs plain, simple language over clinical language', () => {
    expect(prompt).toContain('very simple language');
  });

  it('instructs exactly one practical next step, not a list of options', () => {
    expect(prompt).toContain('one practical next step');
  });

  it('instructs concise responses', () => {
    expect(prompt).toContain('short paragraphs');
  });

  it('instructs separating known facts from possibilities, without exaggerated certainty', () => {
    expect(prompt).toContain('known fact');
    expect(prompt).toContain('exaggerated certainty');
  });

  it('explicitly forbids em dashes and lists real replacements', () => {
    expect(prompt).toContain('never use em dashes');
    expect(prompt).toContain('period, a comma, a colon, or parentheses');
  });

  it('forbids imitating or naming a specific public figure', () => {
    expect(prompt).toContain('public figure');
    expect(prompt).toContain('never imitate');
  });

  it('keeps medical boundaries intact regardless of style changes', () => {
    expect(prompt).toContain('never');
    expect(prompt).toContain('diagnos');
    expect(prompt).toContain('medication');
  });

  it('medical_evaluation_recommended mode asks for a brief, calm referral, not a frightening one', () => {
    const medPrompt = normalizeWhitespace(
      buildSystemPrompt(fakeContext(), 'medical_evaluation_recommended')
    );
    expect(medPrompt).toContain('never frightening');
  });
});

describe('Static reply templates — never use em dashes', () => {
  it('buildFallbackReply has no em dash, with or without a prepared action', () => {
    expect(buildFallbackReply(fakeContext())).not.toContain(EM_DASH);
    expect(buildFallbackReply(fakeContext({ todaysAction: null }))).not.toContain(EM_DASH);
  });

  it('SAFETY_BLOCKED_REPLY_FALLBACK has no em dash', () => {
    expect(SAFETY_BLOCKED_REPLY_FALLBACK).not.toContain(EM_DASH);
  });
});

describe('Approved safety message templates (supabase/seed/05_safety_message_templates.sql) — never use em dashes', () => {
  it('the seed file that supplies coach_review_required / medical_evaluation_recommended / safety_response_only copy has no em dash', () => {
    const seedPath = path.resolve(
      __dirname,
      '../../../supabase/seed/05_safety_message_templates.sql'
    );
    const content = readFileSync(seedPath, 'utf-8');
    expect(content).not.toContain(EM_DASH);
  });
});
