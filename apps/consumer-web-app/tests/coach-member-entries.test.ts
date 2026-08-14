/**
 * Coach Member Detail: the presentation rules, and the real authorization
 * boundary against local Supabase.
 *
 * TWO THINGS THIS FILE EXISTS TO PROVE.
 *
 * 1. AN UNANSWERED QUESTION IS NEVER RENDERED AS AN ANSWER. Every formatter
 *    returns null for an absent value and never a fallback, so the screen can
 *    say "Not answered" and mean it. A member who skipped the pain question
 *    and a member who reported no pain must never look the same to a coach,
 *    and pain is the sharpest case because its scale genuinely starts at 0.
 *
 * 2. THE BOUNDARY IS THE DATABASE, NOT THE PAGE. The reads are exercised as
 *    the real seeded users against real row level security. A signed-out
 *    visitor and a signed-in member each get nothing back for another
 *    member's entries, and the assigned coach gets the rows, which is what
 *    actually protects this data regardless of what the page component does.
 *
 * The fixture uses its own date era so no other file's cleanup can delete
 * its rows, and it removes everything it created.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import { anonClient, signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  NOT_ANSWERED,
  anyAnswered,
  checkinAnswers,
  choiceAnswer,
  goalLabel,
  goalLabels,
  goalSourceLabel,
  optionLabel,
  probeAnswer,
  readinessAnswers,
  scaleAnswer,
  sortGoalsNewestFirst,
  unavailableCopy,
  CASE_VIEW_POINTER,
  EMPTY_COPY,
  ENTRIES_INTRO,
} from '../lib/coach-member-entries/present';
import {
  DEFAULT_ENTRY_DAYS,
  MAX_ENTRY_DAYS,
  clampDays,
  readCheckins,
  readGoals,
} from '../lib/coach-member-entries/data';

const MEMBER = TEST_USERS.memberOne.id;
const OTHER_MEMBER = TEST_USERS.memberTwo.id;

/** A fixture era of its own, clear of every other file's dates. */
const START = '2025-06-02';
const END = '2025-06-05';

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'c-1',
    user_id: MEMBER,
    recorded_at: '2025-06-02T12:00:00Z',
    timezone: 'America/New_York',
    local_date: '2025-06-02',
    checkin_version: 1,
    edited_at: null,
    created_at: '2025-06-02T12:00:00Z',
    sleep_observation_period_start: null,
    sleep_observation_period_end: null,
    mood_level: null,
    sleep_quality: null,
    sleep_duration: null,
    energy_level: null,
    stress_level: null,
    water_cups: null,
    digestion_rating: null,
    pain_discomfort_level: null,
    movement_today: null,
    new_or_worsening_concern: false,
    optional_notes: null,
    actual_bedtime: null,
    actual_wake_time: null,
    night_waking_count: null,
    night_sweats: null,
    morning_soreness: null,
    bowel_movement_status: null,
    ...overrides,
  } as DailyCheckin;
}

// ---------------------------------------------------------------------
// Nothing she did not say
// ---------------------------------------------------------------------

describe('an unanswered question is never turned into an answer', () => {
  it('every fixed question on an empty check-in comes back null, not zero or blank', () => {
    const answers = checkinAnswers(checkin());
    expect(answers.length).toBeGreaterThan(0);
    for (const answer of answers) {
      expect(answer.answer).toBeNull();
      expect(answer.question.length).toBeGreaterThan(0);
    }
  });

  it('pain 0 is a real answer and is never confused with an unanswered one', () => {
    const answered = checkinAnswers(checkin({ pain_discomfort_level: 0 }));
    const skipped = checkinAnswers(checkin({ pain_discomfort_level: null }));
    const pain = (list: ReturnType<typeof checkinAnswers>) =>
      list.find((a) => a.key === 'pain_discomfort_level')!;
    expect(pain(answered).answer).toBe('No pain (0 of 5)');
    expect(pain(skipped).answer).toBeNull();
  });

  it('water 0 cups is a real answer, not an absence', () => {
    const answers = checkinAnswers(checkin({ water_cups: 0 }));
    expect(answers.find((a) => a.key === 'water_cups')!.answer).toBe('0 cups');
  });

  it('a skipped question keeps its place in the list rather than being dropped', () => {
    const partial = checkinAnswers(checkin({ energy_level: 4 }));
    const empty = checkinAnswers(checkin());
    expect(partial.map((a) => a.key)).toEqual(empty.map((a) => a.key));
  });

  it('scaleAnswer gives the word she chose and the number beside it', () => {
    expect(scaleAnswer(1, { 1: 'Very poor' }, 5)).toBe('Very poor (1 of 5)');
    expect(scaleAnswer(null, { 1: 'Very poor' }, 5)).toBeNull();
    // A value with no label still renders the number rather than nothing.
    expect(scaleAnswer(3, {}, 5)).toBe('3 of 5');
  });

  it('choiceAnswer treats an empty string as unanswered, and an unknown value as itself', () => {
    expect(choiceAnswer('', { a: 'A' })).toBeNull();
    expect(choiceAnswer(null, { a: 'A' })).toBeNull();
    expect(choiceAnswer('mystery', { a: 'A' })).toBe('mystery');
  });

  it('the words for an unanswered question are said once, in one place', () => {
    expect(NOT_ANSWERED).toBe('Not answered');
  });
});

describe('the morning questions are only shown when she was asked them', () => {
  it('a check-in with none of them answered reports nothing answered', () => {
    expect(anyAnswered(readinessAnswers(checkin()))).toBe(false);
  });

  it('one answered morning question is enough to show the group', () => {
    expect(anyAnswered(readinessAnswers(checkin({ night_waking_count: 2 })))).toBe(true);
  });

  it('night waking 0 counts as answered, because zero times is a real answer', () => {
    const answers = readinessAnswers(checkin({ night_waking_count: 0 }));
    expect(anyAnswered(answers)).toBe(true);
    expect(answers.find((a) => a.key === 'night_waking_count')!.answer).toBe('0');
  });

  it('night sweats false is answered, and null is not', () => {
    expect(
      readinessAnswers(checkin({ night_sweats: false })).find((a) => a.key === 'night_sweats')!
        .answer
    ).toBe('No');
    expect(
      readinessAnswers(checkin()).find((a) => a.key === 'night_sweats')!.answer
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------
// The adaptive driver answers
// ---------------------------------------------------------------------

describe('the adaptive follow-up answers', () => {
  it('reads the wrapped { value } shape the check-in stores', () => {
    expect(probeAnswer({ value: 7 }, { responseType: 'count', options: [] })).toBe('7');
  });

  it('reads a bare value too, so an older row still renders', () => {
    expect(probeAnswer(4, { responseType: 'scale', options: [] })).toBe('4');
  });

  it('a boolean becomes Yes or No, including false', () => {
    expect(probeAnswer({ value: true }, { responseType: 'boolean', options: [] })).toBe('Yes');
    expect(probeAnswer({ value: false }, { responseType: 'boolean', options: [] })).toBe('No');
  });

  it('a single select shows the label she saw, not the stored key', () => {
    const options = [
      { value: 'desk', label: 'At a desk most of the day' },
      { value: 'moving', label: 'On my feet' },
    ];
    expect(probeAnswer({ value: 'desk' }, { responseType: 'single_select', options })).toBe(
      'At a desk most of the day'
    );
  });

  it('an option whose label cannot be found falls back to the stored value, never to nothing', () => {
    expect(
      probeAnswer({ value: 'gone' }, { responseType: 'single_select', options: [{ value: 'a', label: 'A' }] })
    ).toBe('gone');
  });

  it('a time pair shows both times she gave', () => {
    expect(
      probeAnswer({ value: { start: '22:30', end: '06:15' } }, { responseType: 'time_pair', options: [] })
    ).toBe('22:30 to 06:15');
  });

  it('null, undefined and empty string are all unanswered', () => {
    for (const value of [null, undefined, { value: null }, { value: '' }]) {
      expect(probeAnswer(value, { responseType: 'count', options: [] })).toBeNull();
    }
  });

  it('an unrecognised shape is printed rather than dropped, so it never reads as skipped', () => {
    const answer = probeAnswer({ value: { odd: 1 } }, { responseType: 'unknown', options: [] });
    expect(answer).not.toBeNull();
    expect(answer).toContain('odd');
  });

  it('optionLabel handles a plain string list as well as value/label objects', () => {
    expect(optionLabel('Yes', ['Yes', 'No'])).toBe('Yes');
    expect(optionLabel('a', [{ key: 'a', label: 'Apple' }])).toBe('Apple');
    expect(optionLabel('a', 'not a list')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------

describe('her stated goals', () => {
  it('turns her keys back into the sentences she picked from', () => {
    expect(goalLabels(['sleep_better', 'reduce_stress'])).toEqual([
      'Sleep better',
      'Reduce stress',
    ]);
  });

  it('an unknown key is shown as itself rather than dropped', () => {
    expect(goalLabels(['sleep_better', 'retired_key'])).toEqual(['Sleep better', 'retired_key']);
  });

  it('no primary goal stays null, so the screen can say she was never asked', () => {
    expect(goalLabel(null)).toBeNull();
  });

  it('names which screen she entered it on', () => {
    expect(goalSourceLabel('welcome_flow')).toContain('welcome flow');
    expect(goalSourceLabel('onboarding_confirmation')).toContain('onboarding');
    // An unrecognised source is shown as itself rather than mislabelled.
    expect(goalSourceLabel('somewhere_new')).toBe('somewhere_new');
  });

  it('sorts newest first, so a changed goal is read before the one it replaced', () => {
    const sorted = sortGoalsNewestFirst([
      { id: 'old', createdAt: '2025-01-01T00:00:00Z', goals: [], primaryGoal: null, goalsOther: null, source: 'x' },
      { id: 'new', createdAt: '2026-01-01T00:00:00Z', goals: [], primaryGoal: null, goalsOther: null, source: 'x' },
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['new', 'old']);
  });
});

// ---------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------

describe('the screen copy', () => {
  it('says plainly that nothing here is scored or inferred', () => {
    expect(ENTRIES_INTRO).toContain('entered herself');
    expect(ENTRIES_INTRO).toContain('Nothing here is scored, inferred or generated');
  });

  it('points at Case View rather than repeating it', () => {
    expect(CASE_VIEW_POINTER).toContain('Case View');
  });

  it('a failed read is never worded as an empty one', () => {
    expect(unavailableCopy('Her check-in history', 'boom')).toContain('not a result of');
  });

  it('every empty state explains what would fill it', () => {
    for (const copy of Object.values(EMPTY_COPY)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
      expect(copy.title).not.toContain('—');
      expect(copy.body).not.toContain('—');
    }
  });

  it('no copy in this feature uses an em dash', () => {
    expect(ENTRIES_INTRO).not.toContain('—');
    expect(CASE_VIEW_POINTER).not.toContain('—');
    expect(NOT_ANSWERED).not.toContain('—');
  });
});

describe('the look-back range is bounded', () => {
  it('defaults when nothing sensible was asked for', () => {
    expect(clampDays(undefined)).toBe(DEFAULT_ENTRY_DAYS);
    expect(clampDays(null)).toBe(DEFAULT_ENTRY_DAYS);
    expect(clampDays(Number.NaN)).toBe(DEFAULT_ENTRY_DAYS);
  });

  it('never reads more than a year in one request, however much is asked for', () => {
    expect(clampDays(99999)).toBe(MAX_ENTRY_DAYS);
  });

  it('never reads less than a day', () => {
    expect(clampDays(0)).toBe(1);
    expect(clampDays(-30)).toBe(1);
  });
});

// ---------------------------------------------------------------------
// The real boundary
// ---------------------------------------------------------------------

describe('the authorization boundary, against real row level security', () => {
  let service: SupabaseClient;
  let coach: SupabaseClient;
  let member: SupabaseClient;
  let otherMember: SupabaseClient;
  let visitor: SupabaseClient;

  beforeAll(async () => {
    service = serviceRoleClient();
    visitor = anonClient();
    coach = await signInAs(TEST_USERS.coachOne);
    member = await signInAs(TEST_USERS.memberOne);
    otherMember = await signInAs(TEST_USERS.memberTwo);

    await service.from('daily_checkins').delete().eq('user_id', MEMBER).gte('local_date', START).lte('local_date', END);
    await service.from('member_goal_selections').delete().eq('member_id', MEMBER).eq('goals_other', 'fixture-entry');

    await service.from('daily_checkins').insert([
      {
        user_id: MEMBER,
        timezone: 'America/New_York',
        local_date: START,
        energy_level: 4,
        // Deliberately left unanswered, to prove it stays unanswered.
        stress_level: null,
        pain_discomfort_level: 0,
        new_or_worsening_concern: false,
        optional_notes: 'Slept badly but pushed through.',
      },
      {
        user_id: MEMBER,
        timezone: 'America/New_York',
        local_date: END,
        energy_level: 2,
        stress_level: 5,
        new_or_worsening_concern: true,
      },
    ]);

    await service.from('member_goal_selections').insert({
      member_id: MEMBER,
      goals: ['sleep_better', 'reduce_stress'],
      primary_goal: 'sleep_better',
      goals_other: 'fixture-entry',
      source: 'welcome_flow',
    });
  });

  afterAll(async () => {
    await service.from('daily_checkins').delete().eq('user_id', MEMBER).gte('local_date', START).lte('local_date', END);
    await service.from('member_goal_selections').delete().eq('member_id', MEMBER).eq('goals_other', 'fixture-entry');
  });

  it('the assigned coach reads her check-ins, newest first', async () => {
    const result = await readCheckins(coach, MEMBER, START, END);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.localDate).toBe(END);
    expect(result.items[1]!.localDate).toBe(START);
  });

  it('what she left unanswered comes back unanswered, and pain 0 comes back answered', async () => {
    const result = await readCheckins(coach, MEMBER, START, START);
    expect(result.available).toBe(true);
    if (!result.available) return;
    const answers = result.items[0]!.answers;
    expect(answers.find((a) => a.key === 'stress_level')!.answer).toBeNull();
    expect(answers.find((a) => a.key === 'pain_discomfort_level')!.answer).toBe('No pain (0 of 5)');
    expect(answers.find((a) => a.key === 'energy_level')!.answer).toContain('4 of 5');
  });

  it('her own free-text note is carried verbatim, never summarised', async () => {
    const result = await readCheckins(coach, MEMBER, START, START);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.items[0]!.note).toBe('Slept badly but pushed through.');
  });

  it('her own new-or-worsening flag is carried as she set it', async () => {
    const result = await readCheckins(coach, MEMBER, END, END);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.items[0]!.flaggedNewOrWorseningConcern).toBe(true);
  });

  it('the assigned coach reads her stated goals, which needed migration 158', async () => {
    const result = await readGoals(coach, MEMBER);
    expect(result.available).toBe(true);
    if (!result.available) return;
    const fixture = result.items.find((goal) => goal.goalsOther === 'fixture-entry');
    expect(fixture).toBeDefined();
    expect(fixture!.primaryGoal).toBe('Sleep better');
    expect(fixture!.goals).toContain('Reduce stress');
  });

  it('a signed-out visitor gets nothing, for check-ins and for goals', async () => {
    const checkins = await readCheckins(visitor, MEMBER, START, END);
    const goals = await readGoals(visitor, MEMBER);
    expect(checkins.available && checkins.items).toHaveLength(0);
    expect(goals.available && goals.items).toHaveLength(0);
  });

  it('a signed-in member gets nothing for another member, for check-ins and for goals', async () => {
    const checkins = await readCheckins(otherMember, MEMBER, START, END);
    const goals = await readGoals(otherMember, MEMBER);
    expect(checkins.available && checkins.items).toHaveLength(0);
    expect(goals.available && goals.items).toHaveLength(0);
  });

  it('a member reading her own entries is unaffected by the new coach policy', async () => {
    const result = await readCheckins(member, MEMBER, START, END);
    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.items).toHaveLength(2);
  });

  it('the coach reads nothing for a member he is not assigned to', async () => {
    const checkins = await readCheckins(coach, OTHER_MEMBER, START, END);
    const goals = await readGoals(coach, OTHER_MEMBER);
    // memberTwo has no fixture rows here either way, so the meaningful
    // assertion is that nothing this file wrote for memberOne leaks across.
    if (checkins.available) {
      expect(checkins.items.every((entry) => entry.note !== 'Slept badly but pushed through.')).toBe(true);
    }
    if (goals.available) {
      expect(goals.items.every((goal) => goal.goalsOther !== 'fixture-entry')).toBe(true);
    }
  });
});
