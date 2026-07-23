/**
 * Unit tests for the Coaching Message Composer + Conversation Template
 * Library (Prompt 13) — pure functions only. Confirms the length rules
 * (dashboard/chat/coaching-card), that no forbidden internal-architecture
 * words ever appear in generated copy, and that a different rotationSeed
 * produces different phrasing (the "avoid repeating identical coaching
 * messages" requirement) while the same seed stays deterministic.
 */
import { describe, it, expect } from 'vitest';
import { composeCoachingMessage } from '../lib/root-coaching-engine/composer';
import type { TemplateContext } from '../lib/root-coaching-engine/templates';
import type { ConversationType } from '../lib/root-coaching-engine/types';

const ALL_TYPES: ConversationType[] = [
  'first_observation',
  'repeated_signal',
  'improving_trend',
  'worsening_trend',
  'conflicting_information',
  'new_assessment_available',
  'reassessment',
  'experiment_follow_up',
  'experiment_success',
  'experiment_unsuccessful',
];

const FORBIDDEN_WORDS = ['router', 'confidence', 'domain', 'intelligence engine', 'recommendation engine', 'pattern engine', 'algorithm'];

function ctx(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    topicLabel: 'your sleep',
    historyDepthDays: 5,
    consistencyLevel: 'mixed',
    hasUnfinishedExperimentPattern: false,
    rotationSeed: 'checkin_metric::sleep::0',
    ...overrides,
  };
}

describe('composeCoachingMessage — length rules', () => {
  it.each(ALL_TYPES)('%s stays within the 120-word coaching-card limit and never contains forbidden architecture words', (type) => {
    const message = composeCoachingMessage(type, ctx());
    const wordCount = message.coachingCard.trim().split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(120);

    const lower = message.coachingCard.toLowerCase();
    for (const word of FORBIDDEN_WORDS) expect(lower).not.toContain(word);
  });

  it('dashboardLine is a single short sentence and chatPreview is longer but bounded', () => {
    const message = composeCoachingMessage('worsening_trend', ctx());
    const dashboardSentences = message.dashboardLine.split(/(?<=[.?!])\s/).filter(Boolean);
    expect(dashboardSentences).toHaveLength(1);
    expect(message.chatPreview.length).toBeGreaterThan(message.dashboardLine.length);
    expect(message.coachingCard.length).toBeGreaterThan(message.chatPreview.length);
  });

  it('the coaching card follows Observation -> ... -> Encouragement: it starts with the dashboard line', () => {
    const message = composeCoachingMessage('improving_trend', ctx());
    expect(message.coachingCard.startsWith(message.dashboardLine)).toBe(true);
  });
});

describe('composeCoachingMessage — rotation and tone', () => {
  it('the same rotationSeed always produces identical text (deterministic, not random)', () => {
    const a = composeCoachingMessage('repeated_signal', ctx({ rotationSeed: 'topic::2' }));
    const b = composeCoachingMessage('repeated_signal', ctx({ rotationSeed: 'topic::2' }));
    expect(a).toEqual(b);
  });

  it('advancing the rotationSeed changes at least one part of the message, avoiding an identical repeat', () => {
    const seeds = ['topic::0', 'topic::1', 'topic::2', 'topic::3'];
    const texts = seeds.map((seed) => composeCoachingMessage('first_observation', ctx({ rotationSeed: seed })).coachingCard);
    expect(new Set(texts).size).toBeGreaterThan(1);
  });

  it('never shames a member for skipping — low consistency gets a gentle, pressure-free encouragement', () => {
    const message = composeCoachingMessage('repeated_signal', ctx({ consistencyLevel: 'low' }));
    expect(message.coachingCard.toLowerCase()).not.toMatch(/should have|failed|didn't try|why haven't/);
  });

  it('an unfinished-experiment pattern nudges toward finishing before starting something new', () => {
    const message = composeCoachingMessage(
      'experiment_follow_up',
      ctx({ topicLabel: 'Morning walk', hasUnfinishedExperimentPattern: true })
    );
    expect(message.coachingCard.toLowerCase()).toMatch(/finish|before starting|closing this one/);
  });
});
