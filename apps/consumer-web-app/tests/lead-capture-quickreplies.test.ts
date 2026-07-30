import { describe, it, expect } from 'vitest';
import { getQuickReplies } from '../lib/lead-capture/quickReplies';
import type { LeadTopic } from '@mef/shared-types-contracts';

const TOPICS: LeadTopic[] = ['pain', 'energy', 'sleep', 'stress', 'weight', 'general'];

describe('lead-capture quickReplies — getQuickReplies', () => {
  it('returns 3-5 buttons for every topic at every follow-up stage', () => {
    (['follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4'] as const).forEach((stage) => {
      TOPICS.forEach((topic) => {
        const options = getQuickReplies(stage, topic);
        expect(options).not.toBeNull();
        expect(options!.length).toBeGreaterThanOrEqual(3);
        expect(options!.length).toBeLessThanOrEqual(5);
      });
    });
  });

  it('follow_up_2 (duration) is the same set regardless of topic', () => {
    const painDuration = getQuickReplies('follow_up_2', 'pain');
    const sleepDuration = getQuickReplies('follow_up_2', 'sleep');
    expect(painDuration).toEqual(sleepDuration);
    expect(painDuration).toEqual(['Weeks', 'Months', 'Years', 'As Long As I Can Remember']);
  });

  it('follow_up_1 is topic-specific', () => {
    expect(getQuickReplies('follow_up_1', 'pain')).toContain('Lower Back');
    expect(getQuickReplies('follow_up_1', 'sleep')).toContain('Falling Asleep');
    expect(getQuickReplies('follow_up_1', 'weight')).toContain('Cravings/Appetite');
  });

  it('returns null for stages with no buttons (opening, insight_capture, routed)', () => {
    expect(getQuickReplies('opening', 'pain')).toBeNull();
    expect(getQuickReplies('insight_capture', 'pain')).toBeNull();
    expect(getQuickReplies('routed', 'pain')).toBeNull();
  });
});
