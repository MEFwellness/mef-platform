/**
 * THE TRIAL CLOCK, THE PACING ENGINE, AND DAYS 1 TO 5.
 *
 * Everything asserted here is a rule somebody could remove by accident
 * while meaning to fix something else, and most of them are the difference
 * between Root pacing a stranger warmly through her first week and Root
 * nagging her, greeting her twice on one screen, or claiming a finding her
 * own answers never produced.
 *
 * All of it runs against the pure halves of the engine, with facts handed
 * in, so a failure names the rule that broke rather than "the arc went
 * quiet again".
 */

import { describe, expect, it } from 'vitest';
import { dayNumberFor } from '@/lib/trial-arc/day';
import {
  arcPosition,
  decidePaceState,
  expectedPositionForDay,
  isStalled,
  pointedStepCompleted,
  trialArcClosure,
  wasIgnored,
  TRIAL_ARC_IGNORED_LIMIT,
  type TrialArcDeliveryFact,
  type TrialArcPaceFacts,
} from '@/lib/trial-arc/state';
import {
  TRIAL_ARC_DAY_STEP,
  TRIAL_ARC_LAST_PACING_DAY,
  isPacingDay,
  trialArcDayFromMessageKey,
  trialArcDayKind,
  trialArcPopupMessageKey,
} from '@/lib/trial-arc/constants';
import { decideTrialArcMessage, publicEntryArcHandover, type TrialArcFacts } from '@/lib/trial-arc/engine';
import {
  TRIAL_ARC_DAY_1,
  TRIAL_ARC_DAY_2_ON_PACE,
  TRIAL_ARC_TOWARD_CASE,
  TRIAL_ARC_TOWARD_CVS,
  TRIAL_ARC_TOWARD_LSC,
  TRIAL_ARC_WELCOME,
  trialArcEchoCopy,
  trialArcExperimentCopy,
  trialArcReEntryCopy,
  trialArcSideBySideCopy,
} from '@/lib/trial-arc/copy';

// ---------------------------------------------------------------------
// TASK A.1 — the clock.
// ---------------------------------------------------------------------

const NY = 'America/New_York';

describe('dayNumberFor — the clock', () => {
  it('signup day is day 1, not day 0', () => {
    expect(
      dayNumberFor({
        trialStartedAt: '2026-09-04T14:00:00.000Z',
        timeZone: NY,
        now: new Date('2026-09-04T18:00:00.000Z'),
      })
    ).toBe(1);
  });

  it('counts in HER timezone, not the server\'s', () => {
    // 2026-09-05T01:00Z is still the evening of the 4th in New York, so she
    // is still on day 1. Counted in UTC she would already be on day 2.
    expect(
      dayNumberFor({
        trialStartedAt: '2026-09-04T14:00:00.000Z',
        timeZone: NY,
        now: new Date('2026-09-05T01:00:00.000Z'),
      })
    ).toBe(1);
    expect(
      dayNumberFor({
        trialStartedAt: '2026-09-04T14:00:00.000Z',
        timeZone: 'UTC',
        now: new Date('2026-09-05T01:00:00.000Z'),
      })
    ).toBe(2);
  });

  it('counts from the start she was stamped with, and a trial that started late in her evening still calls the next morning day 2', () => {
    expect(
      dayNumberFor({
        trialStartedAt: '2026-09-04T23:30:00.000Z',
        timeZone: 'UTC',
        now: new Date('2026-09-05T07:00:00.000Z'),
      })
    ).toBe(2);
  });

  it('keeps counting past the end of the week rather than clamping', () => {
    expect(
      dayNumberFor({
        trialStartedAt: '2026-09-01T12:00:00.000Z',
        timeZone: 'UTC',
        now: new Date('2026-09-12T12:00:00.000Z'),
      })
    ).toBe(12);
  });

  it('is null with no trial row, an unparseable start, or a start in her own future', () => {
    expect(dayNumberFor({ trialStartedAt: null, timeZone: NY, now: new Date() })).toBeNull();
    expect(dayNumberFor({ trialStartedAt: 'not a date', timeZone: NY, now: new Date() })).toBeNull();
    expect(
      dayNumberFor({
        trialStartedAt: '2026-09-10T12:00:00.000Z',
        timeZone: 'UTC',
        now: new Date('2026-09-04T12:00:00.000Z'),
      })
    ).toBeNull();
  });

  it('never resets and never extends: the same start and a later day always gives a larger number', () => {
    const start = '2026-09-01T12:00:00.000Z';
    let previous = 0;
    for (let offset = 0; offset < 10; offset += 1) {
      const now = new Date(Date.UTC(2026, 8, 1 + offset, 15, 0, 0));
      const day = dayNumberFor({ trialStartedAt: start, timeZone: 'UTC', now })!;
      expect(day).toBeGreaterThan(previous);
      previous = day;
    }
  });
});

// ---------------------------------------------------------------------
// The message key.
// ---------------------------------------------------------------------

describe('trialArcPopupMessageKey — named so it can never collide', () => {
  it('carries the day number under its own prefix', () => {
    expect(trialArcPopupMessageKey(3)).toBe('trial_arc_day:3');
    expect(trialArcPopupMessageKey(1)).not.toBe(trialArcPopupMessageKey(2));
  });

  it('does not collide with the experiment day-3 and day-7 follow-ups already in the chain', () => {
    const existing = ['cvs_day3:x', 'cvs_day7:x', 'lsc_day3:x', 'lsc_day7:x', 'rpl_day3:x', 'reset_plan_day7:x'];
    for (let day = 1; day <= 7; day += 1) {
      expect(existing).not.toContain(trialArcPopupMessageKey(day));
    }
  });

  it('round trips, and refuses anything that is not one of the seven days', () => {
    expect(trialArcDayFromMessageKey('trial_arc_day:5')).toBe(5);
    expect(trialArcDayFromMessageKey('trial_arc_day:8')).toBeNull();
    expect(trialArcDayFromMessageKey('cvs_day3:abc')).toBeNull();
    expect(trialArcDayFromMessageKey('trial_arc_day:')).toBeNull();
  });
});

describe('pacing days and milestone days are distinguishable, so the closer can never silence day 6 or day 7', () => {
  it('days 1 to 5 are pacing and days 6 and 7 are milestones', () => {
    for (let day = 1; day <= TRIAL_ARC_LAST_PACING_DAY; day += 1) {
      expect(trialArcDayKind(day)).toBe('pacing');
      expect(isPacingDay(day)).toBe(true);
    }
    expect(trialArcDayKind(6)).toBe('milestone');
    expect(trialArcDayKind(7)).toBe('milestone');
    expect(isPacingDay(6)).toBe(false);
    expect(isPacingDay(7)).toBe(false);
  });

  it('day 0 and day 8 are neither', () => {
    expect(trialArcDayKind(0)).toBeNull();
    expect(trialArcDayKind(8)).toBeNull();
  });
});

// ---------------------------------------------------------------------
// TASK A.2 — the daily state.
// ---------------------------------------------------------------------

function paceFacts(overrides: Partial<TrialArcPaceFacts> = {}): TrialArcPaceFacts {
  return {
    dayNumber: 3,
    cvsCompleted: true,
    lscCompleted: true,
    experimentStarted: false,
    experimentActive: false,
    experimentDeclined: false,
    lastPointedStep: 'life_signal_check',
    // Every day of her week so far has something on it, so the default
    // fixture is never stalled and each test below breaks exactly one thing.
    activeLocalDates: ['2026-09-04', '2026-09-05', '2026-09-06'],
    todayLocalDate: '2026-09-06',
    ...overrides,
  };
}

describe('the daily state is decided fresh from real rows', () => {
  it('ON_PACE when the step the arc last pointed at is finished', () => {
    expect(decidePaceState(paceFacts())).toBe('ON_PACE');
  });

  it('BEHIND when it is not, and that is a real state rather than a fall through to ON_PACE', () => {
    expect(decidePaceState(paceFacts({ lscCompleted: false, dayNumber: 2, lastPointedStep: 'life_signal_check' })))
      .toBe('BEHIND');
  });

  it('AHEAD when she is further along than the day map expects', () => {
    // Day 2 expects Core Values Snapshot only. She has both.
    expect(
      decidePaceState(
        paceFacts({ dayNumber: 2, cvsCompleted: true, lscCompleted: true, lastPointedStep: 'core_values_snapshot' })
      )
    ).toBe('AHEAD');
  });

  it('a member exactly where the day map expects is not AHEAD', () => {
    expect(arcPosition({ cvsCompleted: true, lscCompleted: true, experimentStarted: false })).toBe(2);
    expect(expectedPositionForDay(3)).toBe(2);
    expect(decidePaceState(paceFacts({ dayNumber: 3 }))).toBe('ON_PACE');
  });

  it('STALLED after two consecutive empty days, counted backwards from YESTERDAY', () => {
    const facts = paceFacts({
      dayNumber: 4,
      todayLocalDate: '2026-09-07',
      // Nothing on the 5th or the 6th.
      activeLocalDates: ['2026-09-04'],
    });
    expect(isStalled(facts)).toBe(true);
    expect(decidePaceState(facts)).toBe('STALLED');
  });

  it('one empty day is not a stall', () => {
    expect(
      isStalled({ dayNumber: 4, todayLocalDate: '2026-09-07', activeLocalDates: ['2026-09-05'] })
    ).toBe(false);
  });

  it('today being empty is never a stall, because today is still being lived', () => {
    expect(
      isStalled({ dayNumber: 3, todayLocalDate: '2026-09-06', activeLocalDates: ['2026-09-05'] })
    ).toBe(false);
  });

  it('a member on day 1 or day 2 can never be stalled', () => {
    expect(isStalled({ dayNumber: 1, todayLocalDate: '2026-09-04', activeLocalDates: [] })).toBe(false);
    expect(isStalled({ dayNumber: 2, todayLocalDate: '2026-09-05', activeLocalDates: [] })).toBe(false);
  });

  it('an experiment day logged counts as activity, so somebody running an experiment is never called stalled', () => {
    const withLogs = paceFacts({
      dayNumber: 4,
      todayLocalDate: '2026-09-07',
      activeLocalDates: ['2026-09-05', '2026-09-06'],
    });
    expect(isStalled(withLogs)).toBe(false);
  });

  it('DECLINED_EXPERIMENT when a decline is live, and STALLED still outranks it', () => {
    expect(decidePaceState(paceFacts({ experimentDeclined: true }))).toBe('DECLINED_EXPERIMENT');
    expect(
      decidePaceState(
        paceFacts({
          experimentDeclined: true,
          dayNumber: 4,
          todayLocalDate: '2026-09-07',
          activeLocalDates: ['2026-09-04'],
        })
      )
    ).toBe('STALLED');
  });

  it('with no delivery on record, the step the arc "last pointed at" is the day map\'s own step for yesterday', () => {
    // Day 2, never shown a day 1 message, no Core Values Snapshot. She is
    // BEHIND, which is what keeps her from being pointed past a
    // conversation she has not had.
    expect(TRIAL_ARC_DAY_STEP[1]).toBe('core_values_snapshot');
    const facts = paceFacts({ dayNumber: 2, cvsCompleted: false, lscCompleted: false, lastPointedStep: null });
    expect(pointedStepCompleted(facts)).toBe(false);
    expect(decidePaceState(facts)).toBe('BEHIND');
  });
});

// ---------------------------------------------------------------------
// TASK A.3 — the closer.
// ---------------------------------------------------------------------

function delivery(overrides: Partial<TrialArcDeliveryFact> = {}): TrialArcDeliveryFact {
  return {
    messageKey: 'trial_arc_day:1',
    dayNumber: 1,
    pointedStep: 'core_values_snapshot',
    paceState: 'ON_PACE',
    deliveredLocalDate: '2026-09-04',
    ctaTappedAt: null,
    ...overrides,
  };
}

const nothingCompleted = () => null;

describe('the closer', () => {
  it('a tapped CTA is never ignored', () => {
    expect(wasIgnored(delivery({ ctaTappedAt: '2026-09-04T12:00:00Z' }), nothingCompleted)).toBe(false);
  });

  it('completing the pointed-to step that same day is never ignored, even with no tap', () => {
    expect(wasIgnored(delivery(), () => '2026-09-04')).toBe(false);
  });

  it('completing it on a DIFFERENT day does not rescue that message', () => {
    expect(wasIgnored(delivery(), () => '2026-09-06')).toBe(true);
  });

  it('a message that pointed at nothing can only be answered by the tap', () => {
    expect(wasIgnored(delivery({ pointedStep: 'none' }), () => '2026-09-04')).toBe(true);
    expect(
      wasIgnored(delivery({ pointedStep: 'none', ctaTappedAt: '2026-09-04T12:00:00Z' }), nothingCompleted)
    ).toBe(false);
  });

  it('three ignored pacing messages stop the pacing, two do not', () => {
    const two = [
      delivery({ messageKey: 'trial_arc_day:1', dayNumber: 1 }),
      delivery({ messageKey: 'trial_arc_day:2', dayNumber: 2 }),
    ];
    expect(trialArcClosure(two, nothingCompleted).pacingClosed).toBe(false);
    expect(trialArcClosure(two, nothingCompleted).ignoredCount).toBe(2);

    const three = [...two, delivery({ messageKey: 'trial_arc_day:3', dayNumber: 3 })];
    expect(trialArcClosure(three, nothingCompleted).ignoredCount).toBe(TRIAL_ARC_IGNORED_LIMIT);
    expect(trialArcClosure(three, nothingCompleted).pacingClosed).toBe(true);
  });

  it('MILESTONE days are not counted by the closer, so day 6 and day 7 can never be silenced by it', () => {
    const ignoredMilestones = [
      delivery({ messageKey: 'trial_arc_day:6', dayNumber: 6, pointedStep: 'none' }),
      delivery({ messageKey: 'trial_arc_day:7', dayNumber: 7, pointedStep: 'none' }),
      delivery({ messageKey: 'trial_arc_day:1', dayNumber: 1 }),
    ];
    const closure = trialArcClosure(ignoredMilestones, nothingCompleted);
    expect(closure.ignoredCount).toBe(1);
    expect(closure.pacingClosed).toBe(false);
  });

  it('reports whether the one warm re-entry message has already been sent', () => {
    expect(trialArcClosure([delivery()], nothingCompleted).stalledMessageSent).toBe(false);
    expect(
      trialArcClosure([delivery({ paceState: 'STALLED' })], nothingCompleted).stalledMessageSent
    ).toBe(true);
  });

  it('a member who was never shown anything has ignored nothing', () => {
    expect(trialArcClosure([], nothingCompleted).ignoredCount).toBe(0);
    expect(trialArcClosure([], nothingCompleted).pacingClosed).toBe(false);
  });
});

// ---------------------------------------------------------------------
// TASK C — the day map and the copy, through the real decision function.
// ---------------------------------------------------------------------

function facts(overrides: Partial<TrialArcFacts> = {}): TrialArcFacts {
  return {
    dayNumber: 1,
    todayLocalDate: '2026-09-04',
    startLocalDate: '2026-09-04',
    timeZone: NY,
    cvsCompletedLocalDate: null,
    lscCompletedLocalDate: null,
    experimentStartedLocalDate: null,
    experimentActive: false,
    experimentHref: null,
    experimentDeclined: false,
    hasPublicEntryOrigin: false,
    publicEntryPatternTitle: null,
    activeLocalDates: [],
    paceState: 'ON_PACE',
    pacingClosed: false,
    stalledMessageSent: false,
    presenceDelivering: false,
    connection: null,
    ...overrides,
  };
}

function decide(overrides: Partial<TrialArcFacts> = {}) {
  return decideTrialArcMessage(facts(overrides));
}

describe('day 1', () => {
  it('a direct signup gets the arc\'s own pop-up, pointing at Core Values Snapshot', () => {
    const result = decide();
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.surface).toBe('popup');
    expect(result.message.copy).toEqual(TRIAL_ARC_DAY_1);
    expect(result.message.copy.step).toBe('core_values_snapshot');
    expect(result.message.messageKey).toBe('trial_arc_day:1');
  });

  it('a member who arrived through Where Your Energy Goes gets ONE message, carried by the welcome', () => {
    const result = decide({ hasPublicEntryOrigin: true, publicEntryPatternTitle: 'Running on an empty tank' });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.surface).toBe('public_entry_welcome');
    // Still the arc's key and the arc's step, so it is one message and one
    // receipt rather than two of each.
    expect(result.message.messageKey).toBe('trial_arc_day:1');
    expect(result.message.copy.step).toBe('core_values_snapshot');
    expect(result.message.copy.href).toBe(TRIAL_ARC_WELCOME.href);
    expect(result.message.copy.body).toContain('Running on an empty tank');
  });

  it('and says nothing about a pattern when she never finished the nine questions', () => {
    const result = decide({ hasPublicEntryOrigin: true, publicEntryPatternTitle: null });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy.body).toBe(TRIAL_ARC_WELCOME.bodyWithoutPattern);
  });

  it('the welcome handover retires the welcome from day 2 onward, and never touches an account outside the arc', () => {
    expect(publicEntryArcHandover({ eligible: false, dayNumber: null, message: null, reason: 'not_launched', facts: null }))
      .toBeNull();

    const dayOne = decide({ hasPublicEntryOrigin: true });
    expect(dayOne.speaks).toBe(true);
    if (!dayOne.speaks) return;
    expect(
      publicEntryArcHandover({ eligible: true, dayNumber: 1, message: dayOne.message, reason: null, facts: null })?.kind
    ).toBe('day_one');

    expect(
      publicEntryArcHandover({ eligible: true, dayNumber: 3, message: null, reason: 'experiment_running', facts: null })
        ?.kind
    ).toBe('retired');
  });
});

describe('day 2', () => {
  it('ON_PACE points at Life Signal Check', () => {
    const result = decide({ dayNumber: 2, cvsCompletedLocalDate: '2026-09-04', paceState: 'ON_PACE' });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(TRIAL_ARC_DAY_2_ON_PACE);
  });

  it('otherwise it is a gentle start toward Core Values Snapshot, never a pointer past a conversation she has not had', () => {
    const result = decide({ dayNumber: 2, cvsCompletedLocalDate: null, paceState: 'BEHIND' });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(TRIAL_ARC_TOWARD_CVS);
  });
});

describe('days 3 and 4, the experiment days', () => {
  // Her own results screen, which is where the offer genuinely lives. The
  // page called /experiment renders nothing to start when none is running,
  // which was a live dead end until 2026-09-04. See
  // trialArcExperimentHref's own comment.
  const base = {
    dayNumber: 3,
    cvsCompletedLocalDate: '2026-09-04',
    lscCompletedLocalDate: '2026-09-05',
    experimentHref: '/assessments/life-signal-check/results/abc-123',
  };

  it('point at her experiment when one is genuinely available', () => {
    const result = decide(base);
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(trialArcExperimentCopy(base.experimentHref));
    expect(result.message.copy.step).toBe('experiment');
  });

  it('are SILENT while an experiment is running', () => {
    const result = decide({ ...base, experimentActive: true });
    expect(result.speaks).toBe(false);
    if (result.speaks) return;
    expect(result.reason).toBe('experiment_running');
  });

  it('are SILENT once she has declined one, and never re-pitch it', () => {
    for (const dayNumber of [3, 4]) {
      const result = decide({ ...base, dayNumber, experimentDeclined: true, paceState: 'DECLINED_EXPERIMENT' });
      expect(result.speaks).toBe(false);
      if (result.speaks) return;
      expect(result.reason).toBe('experiment_declined');
    }
  });

  it('point at the next experience when no experiment is available to her yet', () => {
    const result = decide({ dayNumber: 4, cvsCompletedLocalDate: '2026-09-04', experimentHref: null });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(TRIAL_ARC_TOWARD_LSC);
  });
});

describe('day 5, the connection', () => {
  const both = {
    dayNumber: 5,
    cvsCompletedLocalDate: '2026-09-04',
    lscCompletedLocalDate: '2026-09-05',
  };

  it('references Body-Value Echo when it genuinely fired for her', () => {
    const result = decide({
      ...both,
      connection: { valueLabel: 'Peace & Calm', signalLabel: 'Tension', echoFired: true },
    });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(trialArcEchoCopy('Peace & Calm', 'Tension'));
    expect(result.message.copy.body).toContain('Peace & Calm');
    expect(result.message.copy.body).toContain('Tension');
  });

  it('places the two side by side, curious and never causal, when Echo did not fire', () => {
    const result = decide({
      ...both,
      connection: { valueLabel: 'Growth & Learning', signalLabel: 'Sleep', echoFired: false },
    });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(trialArcSideBySideCopy('Growth & Learning', 'Sleep'));
    expect(result.message.copy.body).toContain('no theory yet');
  });

  it('nudges toward Life Signal Check instead when it is not complete, and manufactures nothing', () => {
    const result = decide({ dayNumber: 5, cvsCompletedLocalDate: '2026-09-04', lscCompletedLocalDate: null });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(TRIAL_ARC_TOWARD_LSC);
  });

  it('nudges toward Core Values Snapshot when that is the missing half', () => {
    const result = decide({ dayNumber: 5, cvsCompletedLocalDate: null, lscCompletedLocalDate: null });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(TRIAL_ARC_TOWARD_CVS);
  });

  it('never invents a connection when the scored rows could not be read', () => {
    const result = decide({ ...both, connection: null });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(TRIAL_ARC_TOWARD_LSC);
  });

  it('is the one pacing day an AHEAD member still hears', () => {
    const ahead = decide({
      ...both,
      paceState: 'AHEAD',
      connection: { valueLabel: 'Health & Energy', signalLabel: 'Energy', echoFired: true },
    });
    expect(ahead.speaks).toBe(true);
  });
});

describe('AHEAD is silence on every other pacing day', () => {
  it('says nothing on days 1 to 4', () => {
    for (const dayNumber of [1, 2, 3, 4]) {
      const result = decide({ dayNumber, paceState: 'AHEAD' });
      expect(result.speaks).toBe(false);
      if (result.speaks) return;
      expect(result.reason).toBe('ahead_of_the_week');
    }
  });
});

describe('STALLED', () => {
  const stalled = { dayNumber: 4, paceState: 'STALLED' as const, todayLocalDate: '2026-09-07' };

  it('sends one warm re-entry message, pointing at the real next step', () => {
    const result = decide(stalled);
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(trialArcReEntryCopy(TRIAL_ARC_TOWARD_CVS));
    expect(result.message.paceState).toBe('STALLED');
  });

  it('says "no response logged" and never counts a missed day', () => {
    const result = decide(stalled);
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy.body).toContain('No response logged');
    expect(result.message.copy.body).not.toMatch(/missed|streak|behind|catch up|days? ago/i);
  });

  it('sends it once in a week, not once per stalled day', () => {
    const result = decide({ ...stalled, stalledMessageSent: true });
    expect(result.speaks).toBe(false);
    if (result.speaks) return;
    expect(result.reason).toBe('stalled_message_already_sent');
  });

  it('never tells a member who finished a conversation that it is still her first step', () => {
    const result = decide({
      dayNumber: 5,
      paceState: 'STALLED',
      cvsCompletedLocalDate: '2026-09-04',
      lscCompletedLocalDate: '2026-09-05',
      experimentDeclined: true,
      experimentHref: '/assessments/life-signal-check/results/abc-123',
    });
    expect(result.speaks).toBe(true);
    if (!result.speaks) return;
    expect(result.message.copy).toEqual(trialArcReEntryCopy(TRIAL_ARC_TOWARD_CASE));
    expect(result.message.copy.body).not.toContain('Core Values Snapshot');
  });

  it('stays quiet while Root Presence is itself greeting her', () => {
    const result = decide({ ...stalled, presenceDelivering: true });
    expect(result.speaks).toBe(false);
    if (result.speaks) return;
    expect(result.reason).toBe('root_presence_is_greeting');
  });
});

describe('Root Presence wins, on every day and in every state', () => {
  it('silences the arc whatever the day', () => {
    for (const dayNumber of [1, 2, 3, 4, 5]) {
      const result = decide({ dayNumber, presenceDelivering: true, hasPublicEntryOrigin: dayNumber === 1 });
      expect(result.speaks).toBe(false);
      if (result.speaks) return;
      expect(result.reason).toBe('root_presence_is_greeting');
    }
  });
});

describe('the closer stops every pacing day', () => {
  it('nothing on days 1 to 5 once pacing is closed', () => {
    for (const dayNumber of [1, 2, 3, 4, 5]) {
      const result = decide({ dayNumber, pacingClosed: true });
      expect(result.speaks).toBe(false);
      if (result.speaks) return;
      expect(result.reason).toBe('pacing_closed');
    }
  });
});

// ---------------------------------------------------------------------
// The copy rules, asserted over every line the arc can say.
// ---------------------------------------------------------------------

const EVERY_LINE = [
  TRIAL_ARC_DAY_1,
  TRIAL_ARC_DAY_2_ON_PACE,
  TRIAL_ARC_TOWARD_CVS,
  TRIAL_ARC_TOWARD_LSC,
  trialArcExperimentCopy('/assessments/life-signal-check/results/abc-123'),
  trialArcEchoCopy('Peace & Calm', 'Tension'),
  trialArcSideBySideCopy('Peace & Calm', 'Tension'),
  trialArcReEntryCopy(TRIAL_ARC_TOWARD_CVS),
  trialArcReEntryCopy(TRIAL_ARC_TOWARD_CASE),
  TRIAL_ARC_TOWARD_CASE,
  {
    ...TRIAL_ARC_DAY_1,
    body: TRIAL_ARC_WELCOME.bodyWithPattern('Running on an empty tank'),
  },
  { ...TRIAL_ARC_DAY_1, body: TRIAL_ARC_WELCOME.bodyWithoutPattern },
];

describe('every line the arc can say', () => {
  it('contains no em dash', () => {
    for (const line of EVERY_LINE) {
      expect(`${line.title} ${line.body} ${line.ctaLabel}`).not.toContain('—');
    }
  });

  it('contains no countdown and no urgency', () => {
    for (const line of EVERY_LINE) {
      const text = `${line.title} ${line.body} ${line.ctaLabel}`;
      expect(text).not.toMatch(/day \d|\d+ days? (left|remaining|to go)|trial ends|expires|hurry|last chance|don't miss|running out/i);
    }
  });

  it('contains no guilt', () => {
    for (const line of EVERY_LINE) {
      const text = `${line.title} ${line.body}`;
      expect(text).not.toMatch(/you missed|you have not|you haven't|you failed|you forgot|fell behind|streak/i);
    }
  });

  it('has a real button and a real destination', () => {
    for (const line of EVERY_LINE) {
      expect(line.ctaLabel.length).toBeGreaterThan(0);
      expect(line.href.startsWith('/')).toBe(true);
    }
  });
});
