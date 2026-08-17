/**
 * The three inherited fixes from AUDIT-ADAPTIVE-REVEAL.md, each pinned.
 *
 *   D1  a domain with active findings never resolves to a quiet verdict.
 *       Lives in tests/member-interpretation-layer.test.ts, where the rule
 *       itself lives, rather than being asserted twice.
 *   D2  food scans reconnect as DATA, never as a standing finding.
 *   D3  the Daily Brief reflects a same-day check-in instead of freezing at
 *       first open.
 *
 * Plus the friction question (Part C), which is the one thing rule 7 asked
 * for that did not exist at all.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DailyCheckin } from '@mef/shared-types-contracts';
import {
  recomposeCheckinLines,
  composeMorningBrief,
  checkinRecency,
} from '../lib/coaching-engine/morningBrief';
import type { MorningBriefSignals } from '../lib/coaching-engine/types';
import type { CoachingFocusDecision } from '../lib/brain/types';
import {
  countNutritionActivity,
  nutritionActivityLine,
  EMPTY_NUTRITION_ACTIVITY,
} from '../lib/conversation-coach/nutritionActivity';
import {
  FRICTION_OPTIONS,
  FRICTION_REASONS,
  approachAfterFriction,
  approachForFrictionReason,
  isFrictionQuestionOpen,
  isFrictionReason,
  shouldAskFriction,
  NO_FRICTION_STATE,
  type ThreadFrictionState,
} from '../lib/coaching-direction/friction';
import {
  APPROACH_AS_WRITTEN,
  APPROACH_REFRAMED,
  APPROACH_SMALLER,
} from '../lib/coaching-direction/adaptation';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

// ---------------------------------------------------------------------
// D2 — food is data, never a finding
// ---------------------------------------------------------------------

describe('a logged food is data feeding interpretation, never a standing finding', () => {
  it('the two retired registry adapters are still gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'lib/registry/adapters/foodProducts.ts'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'lib/registry/adapters/foodLens.ts'))).toBe(false);
  });

  /**
   * The strongest guarantee available: the type carries three numbers and no
   * strings, so there is no field a food name could travel in.
   */
  it('the Conversation Coach\'s nutrition data has no field a food name could occupy', () => {
    const activity = countNutritionActivity(['2026-08-16T12:00:00.000Z']);
    for (const value of Object.values(activity)) {
      expect(typeof value).toBe('number');
    }
    expect(Object.keys(activity).sort()).toEqual(['daysLogged', 'entriesLogged', 'windowDays']);
  });

  it('the query selects only when an entry was consumed, never what it was', () => {
    const source = read('lib/conversation-coach/nutritionActivity.ts');
    expect(source).toContain("select('consumed_at')");
    expect(source).not.toContain('product_name');
    expect(source).not.toContain('food_products');
  });

  it('counts distinct days rather than entries', () => {
    const twoOnOneDay = countNutritionActivity([
      '2026-08-16T08:00:00.000Z',
      '2026-08-16T19:00:00.000Z',
    ]);
    expect(twoOnOneDay.entriesLogged).toBe(2);
    expect(twoOnOneDay.daysLogged).toBe(1);
  });

  it('states plainly that this is behaviour and not a finding', () => {
    expect(nutritionActivityLine(EMPTY_NUTRITION_ACTIVITY)).toContain('not a finding');
    const active = countNutritionActivity(['2026-08-16T08:00:00.000Z']);
    const line = nutritionActivityLine(active);
    expect(line).toContain('not a finding');
    expect(line).toMatch(/Never name a specific food or product/i);
  });

  it('the Intelligence Engine reads food from its own tables, not from the registry', () => {
    // Comments stripped: this file's own header explains the retired
    // adapter by name, and prose about a removal must not fail the check
    // that the removal happened.
    const source = read('lib/coaching-insights/sources/nutritionSource.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).toContain('listRecentFoodLensComparisonsForMember');
    expect(source).not.toContain('registry_entries');
    expect(source).not.toContain('insertRegistryEntry');
    expect(source).not.toContain('registry/adapters');
  });
});

// ---------------------------------------------------------------------
// D3 — the Daily Brief updates after a same-day check-in
// ---------------------------------------------------------------------

function checkin(overrides: Partial<DailyCheckin> = {}): DailyCheckin {
  return {
    id: 'c1',
    user_id: 'u1',
    recorded_at: '2026-08-17T08:00:00.000Z',
    local_date: '2026-08-17',
    timezone: 'America/New_York',
    checkin_version: 1,
    mood_level: 3,
    energy_level: 3,
    stress_level: 3,
    sleep_quality: 3,
    sleep_duration: '6-7h',
    movement_today: 'light',
    digestion_rating: 3,
    water_intake: null,
    pain_discomfort_level: null,
    pain_location: null,
    notes: null,
    created_at: '2026-08-17T08:00:00.000Z',
    updated_at: '2026-08-17T08:00:00.000Z',
    ...overrides,
  } as unknown as DailyCheckin;
}

describe('Home updates the same day she checks in', () => {
  const TODAY = '2026-08-17';

  /**
   * The exact live case. The row was composed at 04:02, before she checked
   * in, so it said "Yesterday you logged moderate stress" and kept saying it
   * for the rest of the day.
   */
  it('a brief frozen on yesterday\'s reading picks up today\'s check-in', () => {
    const frozen = {
      sleep_summary: 'Yesterday you logged only fair sleep.',
      stress_summary: 'Yesterday you logged moderate stress.',
    };

    const refreshed = recomposeCheckinLines(
      frozen,
      checkin({ local_date: TODAY, sleep_quality: 5, stress_level: 1 }),
      TODAY
    );

    expect(refreshed.sleep_summary).toBe('Your sleep looked good last night.');
    expect(refreshed.stress_summary).toBe('Your stress looked low today.');
  });

  it('leaves the dated wording alone on a day she has not checked in', () => {
    const frozen = {
      sleep_summary: 'Yesterday you logged only fair sleep.',
      stress_summary: 'Yesterday you logged moderate stress.',
    };
    const refreshed = recomposeCheckinLines(
      frozen,
      checkin({ local_date: '2026-08-16' }),
      TODAY
    );
    expect(refreshed.stress_summary).toBe('Yesterday you logged moderate stress.');
  });

  /**
   * The substitution is narrow on purpose: a line from a real longitudinal
   * trend or from a wearable is about a window, not about this morning, and
   * must survive untouched.
   */
  it('never overwrites a trend or wearable line', () => {
    const fromTrend = {
      sleep_summary: 'Your sleep has been declining across the last three weeks.',
      stress_summary: 'Your recovery score is trending up.',
    };
    const refreshed = recomposeCheckinLines(fromTrend, checkin({ local_date: TODAY }), TODAY);
    expect(refreshed).toEqual(fromTrend);
  });

  it('never turns a line the brief had into nothing', () => {
    const frozen = {
      sleep_summary: 'Yesterday you logged only fair sleep.',
      stress_summary: 'Yesterday you logged moderate stress.',
    };
    // Today's check-in has no sleep value, so there is nothing to recompose.
    const refreshed = recomposeCheckinLines(
      frozen,
      checkin({ local_date: TODAY, sleep_quality: null }),
      TODAY
    );
    expect(refreshed.sleep_summary).toBe('Yesterday you logged only fair sleep.');
  });

  it('fills a line the brief did not have once she checks in', () => {
    const refreshed = recomposeCheckinLines(
      { sleep_summary: null, stress_summary: null },
      checkin({ local_date: TODAY, stress_level: 5 }),
      TODAY
    );
    expect(refreshed.stress_summary).toBe('Your stress ran high today.');
  });

  /** No new write permission was taken to do any of this. */
  it('composes at read time rather than rewriting the cached row', () => {
    const source = read('lib/coaching-engine/service.ts');
    expect(source).toContain('recomposeCheckinLines');
    expect(source).not.toContain("from('coach_morning_briefs').update");
    expect(source).not.toContain("from('coach_morning_briefs').delete");
  });

  it('the recency rule itself is unchanged', () => {
    expect(checkinRecency(checkin({ local_date: TODAY }), TODAY)).toBe('today');
    expect(checkinRecency(checkin({ local_date: '2026-08-16' }), TODAY)).toBe('yesterday');
    expect(checkinRecency(checkin({ local_date: '2026-08-01' }), TODAY)).toBe('earlier');
    expect(checkinRecency(null, TODAY)).toBeNull();
  });

  /** The composer is untouched: same signals in, same brief out. */
  it('the composed brief still carries the present-tense line on a check-in day', () => {
    const decision = {
      focus: 'stress',
      focusLabel: 'Stress',
      mode: 'encourage',
      riskLevel: 'steady',
      reason: 'r',
      reasonText: 'Because.',
      encouragement: 'Keep going.',
      coachInsight: null,
      wearableBrief: null,
      wearableSnapshot: null,
    } as unknown as CoachingFocusDecision;

    const brief = composeMorningBrief({
      firstName: 'Ebony',
      localDate: TODAY,
      decision,
      recentCheckins: [checkin({ local_date: TODAY, stress_level: 5 })],
      activeHabits: [],
      habitLogsToday: [],
      currentStreak: 1,
      activeTrendInsights: [],
      continuitySentence: null,
      returnGreeting: null,
      memoryCallback: null,
    } as unknown as MorningBriefSignals);

    expect(brief.stressSummary).toBe('Your stress ran high today.');
  });
});

// ---------------------------------------------------------------------
// Part C — the friction question
// ---------------------------------------------------------------------

function friction(overrides: Partial<ThreadFrictionState> = {}): ThreadFrictionState {
  return { ...NO_FRICTION_STATE, ...overrides };
}

describe('Root asks what got in the way', () => {
  it('asks on the run the approach would have changed, and only then', () => {
    expect(shouldAskFriction({ wouldChangeApproach: true, friction: friction() })).toBe(true);
    expect(shouldAskFriction({ wouldChangeApproach: false, friction: friction() })).toBe(false);
  });

  /** Once per thread, ever. A member who ignores it is not nagged with it. */
  it('never asks a second time, whether or not she answered', () => {
    expect(
      shouldAskFriction({ wouldChangeApproach: true, friction: friction({ asked: true }) })
    ).toBe(false);
    expect(
      shouldAskFriction({
        wouldChangeApproach: true,
        friction: friction({ asked: true, answered: true, reason: 'no_time' }),
      })
    ).toBe(false);
  });

  /**
   * "If the member ignores the question itself, the current silent behavior
   * proceeds as before." Expressed as the default rather than a special case.
   */
  it('falls back to the engine\'s own next framing when she does not answer', () => {
    const ignored = friction({ asked: true, answered: false });
    expect(approachAfterFriction(ignored, APPROACH_SMALLER, APPROACH_AS_WRITTEN)).toBe(
      APPROACH_SMALLER
    );
    expect(approachAfterFriction(NO_FRICTION_STATE, APPROACH_REFRAMED, APPROACH_SMALLER)).toBe(
      APPROACH_REFRAMED
    );
  });

  it('her answer decides which framing, where the engine used to guess', () => {
    expect(approachForFrictionReason('no_time', APPROACH_AS_WRITTEN)).toBe(APPROACH_SMALLER);
    expect(approachForFrictionReason('too_hard', APPROACH_AS_WRITTEN)).toBe(APPROACH_SMALLER);
    expect(approachForFrictionReason('not_relevant', APPROACH_AS_WRITTEN)).toBe(APPROACH_REFRAMED);
    // Nothing was wrong with the ask, she did not see it. Rewording a
    // suggestion she never read answers a question she did not ask.
    expect(approachForFrictionReason('forgot', APPROACH_SMALLER)).toBe(APPROACH_AS_WRITTEN);
  });

  it('something_else falls back to the engine\'s own order rather than guessing', () => {
    expect(approachForFrictionReason('something_else', APPROACH_AS_WRITTEN)).toBe(APPROACH_SMALLER);
    expect(approachForFrictionReason('something_else', APPROACH_SMALLER)).toBe(APPROACH_REFRAMED);
    expect(approachForFrictionReason('something_else', APPROACH_REFRAMED)).toBe(APPROACH_REFRAMED);
  });

  it('an answered thread uses her answer over the engine\'s default', () => {
    const answered = friction({ asked: true, answered: true, reason: 'not_relevant' });
    expect(approachAfterFriction(answered, APPROACH_SMALLER, APPROACH_AS_WRITTEN)).toBe(
      APPROACH_REFRAMED
    );
  });

  /** The question is a TODAY question, not a permanent one. */
  it('is open only on the day she was asked', () => {
    const asked = friction({ asked: true, lastAskedLocalDate: '2026-08-17' });
    expect(isFrictionQuestionOpen(asked, '2026-08-17')).toBe(true);
    expect(isFrictionQuestionOpen(asked, '2026-08-18')).toBe(false);
    expect(
      isFrictionQuestionOpen({ ...asked, answered: true }, '2026-08-17')
    ).toBe(false);
  });

  /**
   * The option list is short and every entry is a fact about the day or the
   * suggestion. None is a fact about her.
   */
  it('offers no option that asks her to blame herself', () => {
    expect(FRICTION_OPTIONS).toHaveLength(FRICTION_REASONS.length);
    const labels = FRICTION_OPTIONS.map((o) => o.label.toLowerCase()).join(' | ');
    for (const blame of ['lazy', 'gave up', 'quit', 'failed', 'no willpower', 'not motivated']) {
      expect(labels).not.toContain(blame);
    }
  });

  it('rejects a reason outside the closed set', () => {
    expect(isFrictionReason('no_time')).toBe(true);
    expect(isFrictionReason('did_not_feel_like_it')).toBe(false);
    expect(isFrictionReason(null)).toBe(false);
  });

  /** The engine reads the tapped reason only. Free text never becomes a decision. */
  it('never parses her free text into a decision', () => {
    // The pure module the engine consults holds no note at all: it takes a
    // tapped reason and returns a framing. Free text lives only in the data
    // layer, on its way to a coach.
    const source = read('lib/coaching-direction/friction.ts');
    expect(source).not.toContain('friction_note');
    expect(source).not.toMatch(/note:\s*string/);
  });

  it('asks before it rewords AND before it escalates', () => {
    const source = read('lib/priority/select.ts');
    const askIndex = source.indexOf('askFriction: { threadKey: item.threadKey }');
    // The escalation PUSH, not the ThreadChange type declaration far above it.
    const escalateIndex = source.indexOf('reason: ESCALATION_REASON_NO_RESPONSE');
    const rewordIndex = source.indexOf("kind: 'approach_change',", askIndex);
    expect(askIndex).toBeGreaterThan(-1);
    expect(escalateIndex).toBeGreaterThan(-1);
    expect(rewordIndex).toBeGreaterThan(-1);
    expect(askIndex).toBeLessThan(escalateIndex);
    expect(askIndex).toBeLessThan(rewordIndex);
  });

  /** Dormant, safely, until the migration lands. */
  it('will not ask a question whose answer it could not store', () => {
    const source = read('lib/priority/select.ts');
    expect(source).toContain('adaptation.frictionAvailable === true');
    const data = read('lib/coaching-direction/frictionData.ts');
    expect(data).toContain('available: false');
  });

  it('records the answer on the outcome ledger, not in a second table', () => {
    const source = read('lib/coaching-direction/frictionData.ts');
    expect(source).toContain("from('member_coaching_decisions')");
    expect(source).toContain('friction_reason');
    expect(source).toContain('friction_answered_at');
  });

  it('the safety and re-entry overrides never carry the question', () => {
    const source = read('lib/priority/select.ts');
    expect(source).toContain(
      'return { selected: item, threadChanges, isFollowOn: false, askFriction: null };'
    );
  });
});
