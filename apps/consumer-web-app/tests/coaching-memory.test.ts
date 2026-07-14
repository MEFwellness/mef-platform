import { describe, it, expect } from 'vitest';
import type {
  DailyCheckin,
  DailyFeedItem,
  MefContentItem,
  NarrativeItem,
} from '@mef/shared-types-contracts';
import { buildTimeContext } from '../lib/feed/timeContext';
import {
  buildFeedMemory,
  pickRecentWin,
  pickRecentStruggle,
  type FeedHistoryPair,
} from '../lib/feed/memory';
import { computeStreakInsight, buildStreakMessage } from '../lib/feed/streakIntelligence';
import {
  buildContinuitySentence,
  buildChallengeCarryover,
  buildCoachInsight,
} from '../lib/feed/continuity';
import { computeAdherence, buildAdaptiveNote } from '../lib/feed/adaptiveDifficulty';
import { addDaysToLocalDate, daysBetweenLocalDates } from '../lib/feed/dateMath';

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: overrides.id ?? 'c1',
    user_id: 'u1',
    timezone: 'America/New_York',
    local_date: '2026-01-01',
    recorded_at: '2026-01-01T08:00:00.000Z',
    checkin_version: 1,
    edited_at: null,
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    created_at: '2026-01-01T08:00:00.000Z',
    mood_level: 3,
    sleep_quality: 3,
    sleep_duration: '6-7h',
    energy_level: 3,
    stress_level: 3,
    water_cups: 5,
    digestion_rating: 3,
    pain_discomfort_level: 1,
    movement_today: 'moderate',
    new_or_worsening_concern: false,
    optional_notes: null,
    ...overrides,
  };
}

function contentItem(overrides: Partial<MefContentItem> = {}): MefContentItem {
  return {
    id: overrides.id ?? 'content-1',
    content_key: 'test-content',
    title: 'Test Lesson',
    summary: 'A test lesson summary.',
    body: 'Full lesson body.',
    estimated_reading_minutes: 2,
    four_doctors_category: 'doctor_movement',
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
    suggested_action: 'Take a 10-minute walk today.',
    reflection_prompt: 'How did it go?',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function feedItem(overrides: Partial<DailyFeedItem> = {}): DailyFeedItem {
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

function narrativeItem(overrides: Partial<NarrativeItem> = {}): NarrativeItem {
  return {
    id: 'n1',
    member_id: 'u1',
    category: 'successful_interventions',
    title: 'Breathing helped reduce stress',
    summary: 'Last week, breathing exercises helped reduce your stress.',
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

describe('dateMath', () => {
  it('adds/subtracts calendar days across a month boundary', () => {
    expect(addDaysToLocalDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDaysToLocalDate('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('computes whole-day differences', () => {
    expect(daysBetweenLocalDates('2026-01-01', '2026-01-04')).toBe(3);
    expect(daysBetweenLocalDates('2026-01-04', '2026-01-01')).toBe(-3);
  });
});

describe('buildTimeContext — Part 1 time awareness', () => {
  it('picks morning/afternoon/evening from the hour alone', () => {
    expect(buildTimeContext(new Date(2026, 0, 5, 8)).greetingWord).toBe('Good morning');
    expect(buildTimeContext(new Date(2026, 0, 5, 14)).greetingWord).toBe('Good afternoon');
    expect(buildTimeContext(new Date(2026, 0, 5, 20)).greetingWord).toBe('Good evening');
  });

  it('identifies the day of week and weekend vs weekday', () => {
    // 2026-01-05 is a Monday.
    const monday = buildTimeContext(new Date(2026, 0, 5, 9));
    expect(monday.dayOfWeek).toBe('monday');
    expect(monday.isWeekend).toBe(false);
    expect(monday.weekPhase.label).toBe('Planning');

    const sunday = buildTimeContext(new Date(2026, 0, 4, 9));
    expect(sunday.dayOfWeek).toBe('sunday');
    expect(sunday.isWeekend).toBe(true);
    expect(sunday.weekPhase.label).toBe('Reset');
  });

  it('gives every day of the week a distinct tone (the coaching tone evolves through the week)', () => {
    const tones = new Set(
      Array.from(
        { length: 7 },
        (_, i) => buildTimeContext(new Date(2026, 0, 4 + i, 9)).weekPhase.tone
      )
    );
    expect(tones.size).toBe(7);
  });
});

describe('buildFeedMemory — Part 2 member coaching memory engine', () => {
  it('tallies completed/skipped/saved/reflected counts from real feed history only', () => {
    const movement = contentItem({ id: 'movement-1', four_doctors_category: 'doctor_movement' });
    const history: FeedHistoryPair[] = [
      {
        feedItem: feedItem({
          id: 'f1',
          local_date: '2025-12-31',
          completed_at: '2025-12-31T10:00:00Z',
          content_item_id: 'movement-1',
          reflection_submitted_at: '2025-12-31T10:05:00Z',
        }),
        content: movement,
      },
      {
        feedItem: feedItem({
          id: 'f2',
          local_date: '2025-12-30',
          dismissed_at: '2025-12-30T10:00:00Z',
        }),
        content: movement,
      },
      {
        feedItem: feedItem({
          id: 'f3',
          local_date: '2025-12-29',
          saved_at: '2025-12-29T10:00:00Z',
          completed_at: null,
          content_item_id: 'movement-1',
        }),
        content: movement,
      },
    ];

    const memory = buildFeedMemory(history, '2026-01-01');
    expect(memory.completedCount).toBe(1);
    expect(memory.completedThisWeek).toBe(1);
    expect(memory.skippedCount).toBe(1);
    expect(memory.reflectionsWritten).toBe(1);
    expect(memory.savedNotCompleted).toHaveLength(1);
    expect(memory.savedNotCompleted[0]!.contentItemId).toBe('movement-1');
    expect(memory.categoryCounts.doctor_movement).toBe(1);
    expect(memory.mostFrequentCategory).toBe('doctor_movement');
  });

  it('never counts a saved item as outstanding once it has also been completed', () => {
    const history: FeedHistoryPair[] = [
      {
        feedItem: feedItem({
          saved_at: '2025-12-31T10:00:00Z',
          completed_at: '2025-12-31T12:00:00Z',
        }),
        content: contentItem(),
      },
    ];
    expect(buildFeedMemory(history, '2026-01-01').savedNotCompleted).toHaveLength(0);
  });

  it('excludes completions older than 7/14 days from the weekly buckets', () => {
    const history: FeedHistoryPair[] = [
      {
        feedItem: feedItem({ local_date: '2025-11-01', completed_at: '2025-11-01T10:00:00Z' }),
        content: contentItem(),
      },
    ];
    const memory = buildFeedMemory(history, '2026-01-01');
    expect(memory.completedCount).toBe(1);
    expect(memory.completedThisWeek).toBe(0);
    expect(memory.categoryCountsThisWeek.doctor_movement).toBe(0);
    expect(memory.categoryCountsPreviousWeek.doctor_movement).toBe(0);
  });

  it('never fabricates a most-frequent category when nothing has been completed', () => {
    const history: FeedHistoryPair[] = [
      { feedItem: feedItem({ dismissed_at: '2026-01-01T00:00:00Z' }), content: contentItem() },
    ];
    expect(buildFeedMemory(history, '2026-01-02').mostFrequentCategory).toBeNull();
  });
});

describe('pickRecentWin / pickRecentStruggle', () => {
  it('only surfaces active, member-visible items from the right categories', () => {
    const items = [
      narrativeItem({
        id: 'w1',
        category: 'recent_wins',
        status: 'active',
        member_visible: true,
        created_at: '2026-01-01T00:00:00Z',
      }),
      narrativeItem({
        id: 'w2',
        category: 'recent_wins',
        status: 'active',
        member_visible: false,
        created_at: '2026-01-02T00:00:00Z',
      }),
      narrativeItem({
        id: 's1',
        category: 'barriers_to_adherence',
        status: 'active',
        member_visible: true,
        created_at: '2026-01-01T00:00:00Z',
      }),
    ];
    expect(pickRecentWin(items)?.id).toBe('w1'); // w2 excluded — not member-visible
    expect(pickRecentStruggle(items)?.id).toBe('s1');
  });
});

describe('Streak Intelligence — Part 5', () => {
  it('coaches an ongoing streak without shaming, once it is long enough to mention', () => {
    const checkins = ['2025-12-30', '2025-12-31', '2026-01-01'].map((d) =>
      checkin({ local_date: d })
    );
    const insight = computeStreakInsight(checkins, '2026-01-01');
    expect(insight.currentStreak).toBe(3);
    expect(insight.checkedInToday).toBe(true);
    expect(buildStreakMessage(insight)).toMatch(/3 days in a row/);
  });

  it('never shames a broken streak — encourages restarting instead', () => {
    const checkins = [checkin({ local_date: '2025-12-20' })];
    const insight = computeStreakInsight(checkins, '2026-01-01');
    const message = buildStreakMessage(insight);
    expect(message).not.toMatch(/broke|fail|missed too many|shame/i);
    expect(message).toMatch(/start again/i);
  });

  it('recognizes a recovery after a real gap', () => {
    const checkins = [
      checkin({ local_date: '2025-12-01' }),
      // gap
      checkin({ local_date: '2025-12-30' }),
      checkin({ local_date: '2025-12-31' }),
    ];
    const insight = computeStreakInsight(checkins, '2025-12-31');
    expect(insight.justRecovered).toBe(true);
    expect(buildStreakMessage(insight)).toMatch(/recovery/i);
  });

  it('says nothing when there is no meaningful streak signal yet', () => {
    const checkins = [checkin({ local_date: '2026-01-01' })];
    const insight = computeStreakInsight(checkins, '2026-01-01');
    expect(buildStreakMessage(insight)).toBeNull();
  });
});

describe('Coaching Continuity — Part 3', () => {
  it('surfaces a saved-for-later carryover as the highest-priority continuity fact', () => {
    const history: FeedHistoryPair[] = [
      {
        feedItem: feedItem({ saved_at: '2025-12-31T00:00:00Z', content_item_id: 'saved-1' }),
        content: contentItem({ id: 'saved-1', title: 'Box Breathing' }),
      },
    ];
    const memory = buildFeedMemory(history, '2026-01-01');
    expect(buildContinuitySentence(memory)).toMatch(/Box Breathing/);
  });

  it('falls back to a real category-consistency fact when nothing is saved', () => {
    const history: FeedHistoryPair[] = [
      {
        feedItem: feedItem({
          id: 'f1',
          local_date: '2025-12-31',
          completed_at: '2025-12-31T00:00:00Z',
          content_item_id: 'm1',
        }),
        content: contentItem({ id: 'm1', four_doctors_category: 'doctor_movement' }),
      },
      {
        feedItem: feedItem({
          id: 'f2',
          local_date: '2025-12-30',
          completed_at: '2025-12-30T00:00:00Z',
          content_item_id: 'm1',
        }),
        content: contentItem({ id: 'm1', four_doctors_category: 'doctor_movement' }),
      },
    ];
    const memory = buildFeedMemory(history, '2026-01-01');
    expect(buildContinuitySentence(memory)).toMatch(/2 movement lessons this week/);
  });

  it('never invents continuity when there is genuinely nothing to say', () => {
    expect(buildContinuitySentence(buildFeedMemory([], '2026-01-01'))).toBeNull();
  });

  it('replaces the generic challenge framing only when today IS the previously-saved item', () => {
    const history: FeedHistoryPair[] = [
      {
        feedItem: feedItem({ saved_at: '2025-12-31T00:00:00Z', content_item_id: 'saved-1' }),
        content: contentItem({ id: 'saved-1' }),
      },
    ];
    const memory = buildFeedMemory(history, '2026-01-01');
    expect(buildChallengeCarryover(memory, 'saved-1')).toMatch(/save.*for later/i);
    expect(buildChallengeCarryover(memory, 'different-item')).toBeNull();
  });
});

describe('Coach Insight — Part 7', () => {
  it('leads with a real week-over-week category consistency improvement', () => {
    const history: FeedHistoryPair[] = [
      {
        feedItem: feedItem({
          id: 'f1',
          local_date: '2025-12-31',
          completed_at: '2025-12-31T00:00:00Z',
        }),
        content: contentItem({ four_doctors_category: 'doctor_diet' }),
      },
      {
        feedItem: feedItem({
          id: 'f2',
          local_date: '2025-12-30',
          completed_at: '2025-12-30T00:00:00Z',
        }),
        content: contentItem({ four_doctors_category: 'doctor_diet' }),
      },
    ];
    const memory = buildFeedMemory(history, '2026-01-01');
    const insight = buildCoachInsight({ memory, wellnessInsights: [], narrativeItems: [] });
    expect(insight).toMatch(/[Nn]utrition/);
    expect(insight).toMatch(/more consistent/);
  });

  it('falls back to a real narrative reference when there is no feed-derived pattern yet', () => {
    const memory = buildFeedMemory([], '2026-01-01');
    const insight = buildCoachInsight({
      memory,
      wellnessInsights: [],
      narrativeItems: [narrativeItem({ category: 'successful_interventions', is_pinned: true })],
    });
    expect(insight).toBe('Last week, breathing exercises helped reduce your stress.');
  });

  it('shows nothing rather than a fabricated insight when there is no real signal', () => {
    const memory = buildFeedMemory([], '2026-01-01');
    expect(buildCoachInsight({ memory, wellnessInsights: [], narrativeItems: [] })).toBeNull();
  });
});

describe('Adaptive Difficulty — Part 8', () => {
  const lowAdherenceHistory: FeedHistoryPair[] = Array.from({ length: 6 }, (_, i) => ({
    feedItem: feedItem({
      id: `f${i}`,
      local_date: addDaysToLocalDate('2026-01-08', -(i + 1)),
      completed_at: null,
    }),
    content: contentItem(),
  }));
  const highAdherenceHistory: FeedHistoryPair[] = Array.from({ length: 6 }, (_, i) => ({
    feedItem: feedItem({
      id: `f${i}`,
      local_date: addDaysToLocalDate('2026-01-08', -(i + 1)),
      completed_at: '2026-01-01T00:00:00Z',
    }),
    content: contentItem(),
  }));

  it('requires a minimum sample before judging adherence at all', () => {
    const info = computeAdherence(
      [{ feedItem: feedItem({ local_date: '2026-01-07', completed_at: null }) }],
      '2026-01-08'
    );
    expect(info.level).toBe('typical');
    expect(info.rate).toBeNull();
  });

  it('detects low adherence and offers a smaller version of a real parsed duration', () => {
    const info = computeAdherence(lowAdherenceHistory, '2026-01-08');
    expect(info.level).toBe('low');
    const note = buildAdaptiveNote('Take a 10-minute walk today.', info.level);
    expect(note).toMatch(/5 minutes/);
  });

  it('detects high adherence and offers an optional stretch', () => {
    const info = computeAdherence(highAdherenceHistory, '2026-01-08');
    expect(info.level).toBe('high');
    const note = buildAdaptiveNote('Take a 10-minute walk today.', info.level);
    expect(note).toMatch(/13 minutes/);
  });

  it('never touches the original suggested_action text — only adds an optional note', () => {
    const original = 'Take a 10-minute walk today.';
    buildAdaptiveNote(original, 'low');
    expect(original).toBe('Take a 10-minute walk today.');
  });

  it('says nothing at all for typical adherence', () => {
    expect(buildAdaptiveNote('Take a 10-minute walk today.', 'typical')).toBeNull();
  });
});
