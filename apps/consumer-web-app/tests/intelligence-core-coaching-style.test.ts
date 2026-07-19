/**
 * Unit tests for lib/intelligence-core/coachingStyle.ts — pure functions
 * only, no Supabase client. Confirms tone/detail/task-load inference each
 * honor their own minimum-sample gate and resolve to 'unclear' rather
 * than guessing, and that the deterministic keyword classifier never
 * fires without a real matching narrative/memory item.
 */
import { describe, it, expect } from 'vitest';
import type {
  ConversationMemoryItem,
  DailyFeedItem,
  MefContentItem,
  NarrativeItem,
} from '@mef/shared-types-contracts';
import { computeCoachingStyle } from '../lib/intelligence-core/coachingStyle';
import type { FeedHistoryPair } from '../lib/feed/memory';

function contentItem(overrides: Partial<MefContentItem> = {}): MefContentItem {
  return {
    id: overrides.id ?? 'content-1',
    content_key: 'key-1',
    title: 'A lesson',
    summary: 'summary',
    body: 'body',
    estimated_reading_minutes: 5,
    four_doctors_category: 'doctor_movement',
    topics: [],
    symptoms_or_concerns: [],
    goals: [],
    safety_classification: 'standard_coaching',
    contraindication_tags: [],
    evidence_sources: [],
    author: 'MEF',
    reviewer: null,
    status: 'published',
    version: 1,
    publication_date: null,
    last_reviewed_date: null,
    content_format: 'lesson',
    difficulty_level: 'beginner',
    eligibility_rules: {},
    suggested_action: 'Do the thing.',
    reflection_prompt: 'How did it go?',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function feedPair(
  id: string,
  overrides: Partial<DailyFeedItem> = {},
  content: MefContentItem | null = contentItem()
): FeedHistoryPair {
  const feedItem: DailyFeedItem = {
    id,
    member_id: 'u1',
    local_date: '2026-06-01',
    content_item_id: content?.id ?? 'content-1',
    focus_text: 'focus',
    why_text: 'why',
    selection_reasons: {},
    safety_classification_id: null,
    coach_assigned_by: null,
    coach_note: null,
    replaced_content_item_id: null,
    completed_at: '2026-06-01T09:00:00.000Z',
    saved_at: null,
    dismissed_at: null,
    reflection_response: null,
    reflection_submitted_at: null,
    helpful: null,
    created_at: '2026-06-01T08:00:00.000Z',
    updated_at: '2026-06-01T08:00:00.000Z',
    ...overrides,
  };
  return { feedItem, content };
}

function narrativeItem(overrides: Partial<NarrativeItem> = {}): NarrativeItem {
  return {
    id: 'n1',
    member_id: 'u1',
    category: 'coaching_preferences',
    title: 'Preference noted',
    summary: 'Member responds well to encouraging, positive language.',
    provenance: 'system_observed',
    confidence: 0.7,
    status: 'active',
    is_pinned: false,
    pinned_by: null,
    pinned_at: null,
    coach_protected: false,
    member_visible: true,
    source_refs: [],
    supersedes_id: null,
    superseded_by_id: null,
    created_by_actor_type: 'system',
    created_by_actor_id: null,
    valid_from: '2026-06-01T00:00:00.000Z',
    valid_until: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeCoachingStyle', () => {
  it('resolves everything to "unclear" and low confidence with no interaction history', () => {
    const style = computeCoachingStyle([], [], [], null);
    expect(style.tonePreference).toBe('unclear');
    expect(style.detailPreference).toBe('unclear');
    expect(style.taskLoadPreference).toBe('unclear');
    expect(style.confidence).toBe(0);
    expect(style.rationale).toMatch(/not enough interaction history/i);
  });

  it('infers an encouragement tone preference from coaching_preferences narrative text', () => {
    const style = computeCoachingStyle([], [narrativeItem()], [], null);
    expect(style.tonePreference).toBe('encouragement');
    expect(style.rationale).toMatch(/encouragement/);
  });

  it('infers a direct tone preference from conversation memory preference items', () => {
    const memory: ConversationMemoryItem[] = [
      {
        id: 'm1',
        member_id: 'u1',
        session_id: 's1',
        memory_type: 'preference',
        content: 'Prefers direct, straightforward coaching with no fluff.',
        source_message_id: null,
        is_active: true,
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ];
    const style = computeCoachingStyle([], [], memory, null);
    expect(style.tonePreference).toBe('direct');
  });

  it('does not infer detail/task-load preference below the minimum sample size', () => {
    const pairs = [feedPair('f1', { helpful: true }), feedPair('f2', { helpful: false })];
    const style = computeCoachingStyle(pairs, [], [], null);
    expect(style.detailPreference).toBe('unclear');
  });

  it('infers a brief-content preference when helpful ratings skew toward shorter content', () => {
    const shortContent = contentItem({ id: 'short', estimated_reading_minutes: 3 });
    const longContent = contentItem({ id: 'long', estimated_reading_minutes: 20 });
    const pairs: FeedHistoryPair[] = [
      ...Array.from({ length: 3 }, (_, i) => feedPair(`h${i}`, { helpful: true }, shortContent)),
      ...Array.from({ length: 3 }, (_, i) => feedPair(`nh${i}`, { helpful: false }, longContent)),
    ];
    const style = computeCoachingStyle(pairs, [], [], null);
    expect(style.detailPreference).toBe('brief');
  });

  it('infers a single_focus task-load preference when multi-step (practice) completion drops', () => {
    const practice = contentItem({ id: 'practice', content_format: 'practice' });
    const lesson = contentItem({ id: 'lesson', content_format: 'lesson' });
    const pairs: FeedHistoryPair[] = [
      ...Array.from({ length: 4 }, (_, i) => feedPair(`p${i}`, { completed_at: null }, practice)),
      ...Array.from({ length: 4 }, (_, i) =>
        feedPair(`l${i}`, { completed_at: '2026-06-01T09:00:00.000Z' }, lesson)
      ),
    ];
    const style = computeCoachingStyle(pairs, [], [], null);
    expect(style.taskLoadPreference).toBe('single_focus');
  });

  it('sets the time-commitment sweet spot only when a time_commitment observation was found', () => {
    const withObservation = computeCoachingStyle([], [], [], {
      domain: 'time_commitment',
      observationKey: 'time_commitment_short_content_preference',
      statement: 'x',
      coachDetail: 'x',
      confidence: 0.7,
      evidenceCount: 10,
      evidenceRefs: [],
      memberVisible: true,
    });
    expect(withObservation.timeCommitmentSweetSpotMinutes).toBe(10);

    const withoutObservation = computeCoachingStyle([], [], [], null);
    expect(withoutObservation.timeCommitmentSweetSpotMinutes).toBeNull();
  });
});
