import { describe, it, expect } from 'vitest';
import {
  filterEligibleContent,
  isContraindicated,
  wasRecentlyShown,
  REPETITION_AVOIDANCE_DAYS,
} from '../lib/feed/eligibility';
import { selectContentItem } from '../lib/feed/selector';
import { buildFocusText, buildWhyText } from '../lib/feed/copy';
import type { MefContentItem, DailyFeedItem, NarrativeItem } from '@mef/shared-types-contracts';

function contentItem(overrides: Partial<MefContentItem>): MefContentItem {
  return {
    id: overrides.id ?? 'content-1',
    content_key: overrides.content_key ?? 'test-content',
    title: 'Test Lesson',
    summary: 'A test lesson summary.',
    body: 'Full lesson body.',
    estimated_reading_minutes: 2,
    four_doctors_category: 'doctor_quiet',
    topics: [],
    symptoms_or_concerns: [],
    goals: [],
    safety_classification: 'standard_coaching',
    contraindication_tags: [],
    evidence_sources: [],
    author: 'MEF Wellness Team',
    reviewer: null,
    status: 'published',
    version: 1,
    publication_date: '2026-01-01',
    last_reviewed_date: '2026-01-01',
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

function feedItem(overrides: Partial<DailyFeedItem>): DailyFeedItem {
  return {
    id: overrides.id ?? 'feed-1',
    member_id: 'u1',
    local_date: '2026-01-01',
    content_item_id: 'content-1',
    focus_text: 'Focus.',
    why_text: 'Why.',
    selection_reasons: {},
    safety_classification_id: null,
    coach_assigned_by: null,
    coach_note: null,
    replaced_content_item_id: null,
    completed_at: null,
    saved_at: null,
    dismissed_at: null,
    reflection_response: null,
    reflection_submitted_at: null,
    helpful: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function narrativeItem(overrides: Partial<NarrativeItem>): NarrativeItem {
  return {
    id: 'n1',
    member_id: 'u1',
    category: 'barriers_to_adherence',
    title: 'Travel disrupts consistency',
    summary: 'Travel has made consistency harder before, so today’s plan is intentionally lighter.',
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
    valid_from: '2026-01-01T00:00:00.000Z',
    valid_until: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('isContraindicated / wasRecentlyShown', () => {
  it('flags content whose tags intersect restricted topics', () => {
    const item = contentItem({ contraindication_tags: ['medication'] });
    expect(isContraindicated(item, ['medication'])).toBe(true);
    expect(isContraindicated(item, ['pain_severity'])).toBe(false);
    expect(isContraindicated(item, [])).toBe(false);
  });

  it('flags content shown within the repetition-avoidance window', () => {
    const item = contentItem({ id: 'c1' });
    const history = [feedItem({ content_item_id: 'c1', local_date: '2026-01-10' })];
    expect(
      wasRecentlyShown(item, {
        restrictedTopics: [],
        recentHistory: history,
        asOfLocalDate: '2026-01-15',
      })
    ).toBe(true);
    expect(
      wasRecentlyShown(item, {
        restrictedTopics: [],
        recentHistory: history,
        asOfLocalDate: `2026-02-${(10 + REPETITION_AVOIDANCE_DAYS).toString().padStart(2, '0')}`,
      })
    ).toBe(false);
  });
});

describe('filterEligibleContent — safety filtering + repetition avoidance', () => {
  it('excludes contraindicated content regardless of repetition state', () => {
    const library = [
      contentItem({ id: 'a', contraindication_tags: ['medication'] }),
      contentItem({ id: 'b' }),
    ];
    const eligible = filterEligibleContent(library, {
      restrictedTopics: ['medication'],
      recentHistory: [],
      asOfLocalDate: '2026-01-01',
    });
    expect(eligible.map((i) => i.id)).toEqual(['b']);
  });

  it('excludes recently-shown content when a fresh alternative exists', () => {
    const library = [contentItem({ id: 'a' }), contentItem({ id: 'b' })];
    const history = [feedItem({ content_item_id: 'a', local_date: '2026-01-01' })];
    const eligible = filterEligibleContent(library, {
      restrictedTopics: [],
      recentHistory: history,
      asOfLocalDate: '2026-01-02',
    });
    expect(eligible.map((i) => i.id)).toEqual(['b']);
  });

  it('falls back to recently-shown (but never contraindicated) content when nothing fresh is eligible', () => {
    const library = [
      contentItem({ id: 'a', contraindication_tags: ['medication'] }),
      contentItem({ id: 'b' }),
    ];
    const history = [feedItem({ content_item_id: 'b', local_date: '2026-01-01' })];
    const eligible = filterEligibleContent(library, {
      restrictedTopics: ['medication'],
      recentHistory: history,
      asOfLocalDate: '2026-01-02',
    });
    // 'a' is contraindicated (never eligible); 'b' is recently shown but is
    // the only safe option, so the fallback allows it rather than an empty feed.
    expect(eligible.map((i) => i.id)).toEqual(['b']);
  });
});

describe('selectContentItem — personalization priority and determinism', () => {
  it('a coach-assigned item always wins when eligible', () => {
    const library = [contentItem({ id: 'a' }), contentItem({ id: 'b' })];
    const selection = selectContentItem({
      library,
      restrictedTopics: [],
      recentHistory: [],
      asOfLocalDate: '2026-01-01',
      priorityMetric: null,
      narrativeItems: [],
      coachAssignedContentItemId: 'b',
    });
    expect(selection?.contentItem.id).toBe('b');
    expect(selection?.reason.kind).toBe('coach_assigned');
  });

  it('matches a relevant, member-visible narrative item over the priority metric', () => {
    const library = [
      contentItem({ id: 'a', topics: ['travel'] }),
      contentItem({ id: 'b', eligibility_rules: { priorityMetric: 'stress' } }),
    ];
    const selection = selectContentItem({
      library,
      restrictedTopics: [],
      recentHistory: [],
      asOfLocalDate: '2026-01-01',
      priorityMetric: 'stress',
      narrativeItems: [narrativeItem({ title: 'Travel disrupts consistency' })],
      coachAssignedContentItemId: null,
    });
    expect(selection?.contentItem.id).toBe('a');
    expect(selection?.reason.kind).toBe('narrative_match');
  });

  it('never surfaces a coach-only narrative item as a selection reason', () => {
    const library = [contentItem({ id: 'a', topics: ['travel'] })];
    const selection = selectContentItem({
      library,
      restrictedTopics: [],
      recentHistory: [],
      asOfLocalDate: '2026-01-01',
      priorityMetric: null,
      narrativeItems: [
        narrativeItem({ title: 'Travel disrupts consistency', member_visible: false }),
      ],
      coachAssignedContentItemId: null,
    });
    expect(selection?.reason.kind).not.toBe('narrative_match');
  });

  it('falls back to the priority metric match when no narrative item is relevant', () => {
    const library = [
      contentItem({ id: 'a' }),
      contentItem({ id: 'b', eligibility_rules: { priorityMetric: 'stress' } }),
    ];
    const selection = selectContentItem({
      library,
      restrictedTopics: [],
      recentHistory: [],
      asOfLocalDate: '2026-01-01',
      priorityMetric: 'stress',
      narrativeItems: [],
      coachAssignedContentItemId: null,
    });
    expect(selection?.contentItem.id).toBe('b');
    expect(selection?.reason.kind).toBe('priority_metric');
  });

  it('is deterministic — identical input always produces identical output', () => {
    const library = [contentItem({ id: 'a' }), contentItem({ id: 'b' })];
    const input = {
      library,
      restrictedTopics: [],
      recentHistory: [],
      asOfLocalDate: '2026-01-01',
      priorityMetric: null,
      narrativeItems: [],
      coachAssignedContentItemId: null,
    };
    expect(selectContentItem(input)?.contentItem.id).toBe(selectContentItem(input)?.contentItem.id);
  });

  it('returns null when no content is eligible at all', () => {
    const selection = selectContentItem({
      library: [],
      restrictedTopics: [],
      recentHistory: [],
      asOfLocalDate: '2026-01-01',
      priorityMetric: null,
      narrativeItems: [],
      coachAssignedContentItemId: null,
    });
    expect(selection).toBeNull();
  });
});

describe('copy — templated, never freeform', () => {
  it('builds focus/why text for a priority_metric reason', () => {
    const item = contentItem({});
    expect(buildFocusText(item, { kind: 'priority_metric', metric: 'stress' })).toContain('Stress');
    expect(buildWhyText({ kind: 'priority_metric', metric: 'stress' })).toContain('stress');
  });

  it('builds focus/why text for a narrative_match reason using the exact narrative summary, never rephrasing it', () => {
    const item = contentItem({});
    const reason = {
      kind: 'narrative_match' as const,
      narrativeSummary: 'Travel has made consistency harder before.',
    };
    expect(buildWhyText(reason)).toBe('Travel has made consistency harder before.');
    expect(buildFocusText(item, reason)).toContain(item.title);
  });

  it('builds focus/why text for a coach_assigned reason', () => {
    const item = contentItem({ title: 'Coach Pick' });
    expect(buildFocusText(item, { kind: 'coach_assigned' })).toContain('Coach Pick');
    expect(buildWhyText({ kind: 'coach_assigned' })).toMatch(/coach/i);
  });
});
