/**
 * The movement flip — when Root will and will not offer a Root Movement
 * session, and what happens when she does one.
 *
 * Three layers, and each proves something the others cannot:
 *
 *   PURE       the mapping table, the enriched fallback's selection, and
 *              the hierarchy discipline. No database: what Root chooses is
 *              a function of its inputs, so it is asserted as one.
 *   REAL DB    the auto-done path. Whether completing a session really
 *              closes today's decision, with the right response and the
 *              right session key, and whether doing it twice can write
 *              twice, are questions about conditional writes against real
 *              constraints. A stub cannot answer either.
 *   SOURCE     the privacy line and the copy rules, read off the files
 *              themselves so a later edit cannot quietly reintroduce a
 *              promise, a scold or a health value.
 *
 * TWO GUARDS WERE PROVEN BY BREAKING THEM. See the notes on
 * `the enriched fallback never fires when the Daily Reset is not done` and
 * `nothing above the fallback can ever be a movement action`.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  DRIVER_MOVEMENT_SESSION,
  MOVEMENT_SESSION_ORDER,
  isMovementSessionKey,
  movementSessionForDriver,
  movementSessionHref,
  selectFallbackMovementSession,
} from '@/lib/coaching-direction/movement';
import type { MovementSessionOption } from '@/lib/coaching-direction/movement';
import { applicableRules, selectCoachingAction } from '@/lib/priority/select';
import {
  PRIORITY_LADDER,
  PRIORITY_LADDER_BEFORE_MOVEMENT,
  type MovementInput,
  type PriorityInputs,
} from '@/lib/priority/types';
import { ALLOWED_EVIDENCE_KEYS, sanitizeSignalEvidence } from '@/lib/coaching-direction/evidence';
import { gradeDecisions } from '@/lib/coaching-direction/grading';
import type { GradeableDecision } from '@/lib/coaching-direction/grading';
import { buildWorked, chooseWeekFocus } from '@/lib/weekly-review/compose';
import {
  DEFAULT_COMPARISON_WINDOW_DAYS,
  getCoachingDecision,
  recordCoachingDecision,
} from '@/lib/coaching-direction/data';
import { recordMovementSessionCompletion } from '@/lib/coaching-direction/movementOutcome';
import { claimDailyPriority, getDailyPriority } from '@/lib/priority/data';
import { PRIORITY_RULES } from '@/lib/analytics/surfaces';

const APP_ROOT = path.resolve(__dirname, '..');
const TODAY = '2026-08-13';

// ---------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------

/** The six as the database publishes them, none ever completed. */
function freshSessions(): MovementSessionOption[] {
  return MOVEMENT_SESSION_ORDER.map((sessionKey) => ({
    sessionKey,
    name: sessionKey
      .split('_')
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join(' '),
    lastCompletedLocalDate: null,
  }));
}

function movementInput(overrides: Partial<MovementInput> = {}): MovementInput {
  return { sessions: freshSessions(), coachAssignedToday: false, ...overrides };
}

/**
 * A member with NOTHING above the fallback: no plan, no driver, no
 * pattern, nothing abandoned, no friction, no focus. The ordinary state of
 * a member the enriched fallback exists for.
 */
function fallbackOnly(checkinDoneToday: boolean): PriorityInputs {
  return {
    safetyFlag: null,
    isReEntry: false,
    resetPlan: null,
    implicatedDriver: null,
    qualifiedPattern: null,
    incompleteAction: null,
    behavioralFriction: null,
    todaysFocus: null,
    movement: movementInput(),
    fallback: { checkinDoneToday, totalCheckins: 22, statedGoalLabel: 'Sleep better' },
    hasRealHistory: true,
  };
}

function driverInputs(driverId: string, domainKey: string): PriorityInputs {
  return {
    ...fallbackOnly(false),
    implicatedDriver: {
      driverId,
      domainKey,
      label: 'Sitting hours',
      whatItObserves: 'Total sedentary time',
      findingSentence: 'On days with more sitting, your evenings tend to feel stiffer.',
    },
  };
}

// =====================================================================
// 1. The mapping table.
// =====================================================================

describe('the signal to session mapping is deterministic', () => {
  const live = new Set<string>(MOVEMENT_SESSION_ORDER);

  it('maps every mapped driver to exactly one live session, and to the same one every time', () => {
    for (const [driverId, expected] of Object.entries(DRIVER_MOVEMENT_SESSION)) {
      expect(isMovementSessionKey(expected), `${driverId} maps to a real session`).toBe(true);
      // Called twice: a mapping that is not a pure lookup would show here.
      expect(movementSessionForDriver(driverId, live)).toBe(expected);
      expect(movementSessionForDriver(driverId, live)).toBe(expected);
    }
  });

  it('covers the six domains the audit confirmed, and names the sessions the brief named', () => {
    // The hip and low back domain.
    expect(DRIVER_MOVEMENT_SESSION['MEC-3']).toBe('hip_back_reset');
    // The shoulder, neck and posture domain.
    expect(DRIVER_MOVEMENT_SESSION['MEC-2']).toBe('shoulder_neck_reset');
    // The sedentary and desk pattern.
    expect(DRIVER_MOVEMENT_SESSION['MOV-1']).toBe('desk_reset');
    expect(DRIVER_MOVEMENT_SESSION['MEC-1']).toBe('desk_reset');
    // Heavy load, and rest not taken.
    expect(DRIVER_MOVEMENT_SESSION['MOV-2']).toBe('recovery_day');
    expect(DRIVER_MOVEMENT_SESSION['MOV-5']).toBe('recovery_day');
    // Deconditioning and sameness, met with the gentlest full body lineup.
    expect(DRIVER_MOVEMENT_SESSION['MOV-3']).toBe('morning_mobility');
    // Trunk and stability.
    expect(DRIVER_MOVEMENT_SESSION['MEC-5']).toBe('core_foundation');
  });

  it('yields nothing for an unmapped domain, including one real movement driver', () => {
    // MEC-4 is Footwear. It is a genuine movement-domain driver and no
    // session addresses it, so it is deliberately absent. This is what
    // makes this test non-vacuous rather than a check against a typo.
    expect(DRIVER_MOVEMENT_SESSION['MEC-4']).toBeUndefined();
    expect(movementSessionForDriver('MEC-4', live)).toBeNull();

    for (const driverId of ['SLP-3', 'FUE-7', 'DIG-1', 'STR-1', 'CTX-2', 'not-a-driver']) {
      expect(movementSessionForDriver(driverId, live)).toBeNull();
    }
  });

  it('refuses a mapping whose session the database no longer publishes', () => {
    const withoutDesk = new Set(
      [...MOVEMENT_SESSION_ORDER].filter((key) => key !== 'desk_reset')
    );
    expect(movementSessionForDriver('MOV-1', withoutDesk)).toBeNull();
    // And the others are unaffected.
    expect(movementSessionForDriver('MEC-3', withoutDesk)).toBe('hip_back_reset');
  });

  it('turns a mapped driver into that session on the driver rung, with its route', () => {
    const inputs = driverInputs('MEC-3', 'MEC');
    const result = selectCoachingAction(inputs, TODAY).selected;

    expect(result.rule).toBe('implicated_driver');
    expect(result.actionType).toBe('movement');
    expect(result.href).toBe('/movement/sessions/hip_back_reset');
    expect(result.evidence.sessionKey).toBe('hip_back_reset');
    // The rung's own identity is untouched: the thread is still the
    // driver's, not the session's, so Part 1's adaptation counters carry on
    // counting the same conversation.
    expect(result.priorityKey).toBe('MEC-3');
    expect(result.threadKey).toBe('implicated_driver::MEC-3');
  });

  it('leaves an unmapped driver exactly as it was', () => {
    const inputs = driverInputs('SLP-3', 'SLP');
    const result = selectCoachingAction(inputs, TODAY).selected;

    expect(result.rule).toBe('implicated_driver');
    expect(result.actionType).toBe('reflection');
    expect(result.href).toBeNull();
    expect(result.evidence.sessionKey).toBeUndefined();
  });

  it('drops a movement-domain driver with no session behind it, exactly as the old block did', () => {
    // MEC-4 in the MEC domain is 'reflection' and shows normally; a MOV
    // driver with no mapping is typed 'movement' with nothing behind it and
    // must still be dropped.
    const inputs: PriorityInputs = {
      ...driverInputs('MOV-9', 'MOV'),
      movement: movementInput(),
    };
    expect(applicableRules(inputs)[0]).toBe('implicated_driver');
    const result = selectCoachingAction(inputs, TODAY).selected;
    expect(result.rule).not.toBe('implicated_driver');
    expect(result.actionType).not.toBe('movement');
  });
});

// =====================================================================
// 2. The enriched fallback.
// =====================================================================

describe('the enriched fallback', () => {
  /**
   * PROVEN BY BREAKING IT. Changing the condition in
   * lib/priority/select.ts from `inputs.fallback.checkinDoneToday` to a
   * bare `true` turned this test red with "expected 'movement_session' to
   * be 'daily_reset'". Restored immediately afterwards.
   */
  it('never fires when the Daily Reset is not done, and the reset fallback is intact', () => {
    const inputs = fallbackOnly(false);

    // Non-vacuity: sessions really were available and really did lose.
    expect(inputs.movement!.sessions.length).toBe(6);
    expect(applicableRules(inputs)).toEqual(['daily_reset']);

    const result = selectCoachingAction(inputs, TODAY).selected;
    expect(result.rule).toBe('daily_reset');
    expect(result.actionType).toBe('reset');
    expect(result.href).toBe('/checkin');
  });

  it('fires when the Daily Reset is done, above the goal fallback', () => {
    const inputs = fallbackOnly(true);
    expect(applicableRules(inputs)).toEqual(['movement_session', 'gentle_focus']);

    const result = selectCoachingAction(inputs, TODAY).selected;
    expect(result.rule).toBe('movement_session');
    expect(result.actionType).toBe('movement');
    expect(result.href).toBe('/movement/sessions/morning_mobility');
  });

  it('falls back to the goal sentence when there is no movement to offer', () => {
    for (const movement of [null, movementInput({ sessions: [] })]) {
      const inputs = { ...fallbackOnly(true), movement };
      expect(applicableRules(inputs)).toEqual(['gentle_focus']);
      expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('gentle_focus');
    }
  });

  it('offers the least-recently-completed session', () => {
    const options: MovementSessionOption[] = [
      { sessionKey: 'morning_mobility', name: 'Morning Mobility', lastCompletedLocalDate: '2026-08-12' },
      { sessionKey: 'desk_reset', name: 'Desk Reset', lastCompletedLocalDate: '2026-08-02' },
      { sessionKey: 'hip_back_reset', name: 'Hip and Back Reset', lastCompletedLocalDate: '2026-08-09' },
      { sessionKey: 'shoulder_neck_reset', name: 'Shoulder and Neck Reset', lastCompletedLocalDate: '2026-07-30' },
      { sessionKey: 'core_foundation', name: 'Core Foundation', lastCompletedLocalDate: '2026-08-11' },
      { sessionKey: 'recovery_day', name: 'Recovery Day', lastCompletedLocalDate: '2026-08-01' },
    ];
    expect(selectFallbackMovementSession(options)!.sessionKey).toBe('shoulder_neck_reset');

    // A session she has never completed beats every session she has, however
    // long ago.
    const withNever = options.map((option) =>
      option.sessionKey === 'core_foundation'
        ? { ...option, lastCompletedLocalDate: null }
        : option
    );
    expect(selectFallbackMovementSession(withNever)!.sessionKey).toBe('core_foundation');
  });

  it('breaks a tie by the seeded order, and does so identically every time', () => {
    // All six never completed: the fixed order decides, and it is the order
    // migration 153 seeded.
    for (let run = 0; run < 3; run += 1) {
      expect(selectFallbackMovementSession(freshSessions())!.sessionKey).toBe(
        MOVEMENT_SESSION_ORDER[0]
      );
    }

    // Two sharing the same completion date, arriving in the reverse of the
    // seeded order.
    const sameDay: MovementSessionOption[] = [
      { sessionKey: 'recovery_day', name: 'Recovery Day', lastCompletedLocalDate: '2026-08-01' },
      { sessionKey: 'desk_reset', name: 'Desk Reset', lastCompletedLocalDate: '2026-08-01' },
    ];
    expect(selectFallbackMovementSession(sameDay)!.sessionKey).toBe('desk_reset');

    expect(selectFallbackMovementSession([])).toBeNull();
  });

  it('offers nothing at all when a coach has a workout scheduled for today', () => {
    const inputs = { ...fallbackOnly(true), movement: movementInput({ coachAssignedToday: true }) };
    expect(applicableRules(inputs)).toEqual(['gentle_focus']);
    expect(selectCoachingAction(inputs, TODAY).selected.rule).toBe('gentle_focus');

    // And not on the driver rung either, which is the path that could
    // otherwise contradict a coach's own programming.
    const driver = {
      ...driverInputs('MEC-3', 'MEC'),
      movement: movementInput({ coachAssignedToday: true }),
    };
    const result = selectCoachingAction(driver, TODAY).selected;
    expect(result.rule).toBe('implicated_driver');
    expect(result.actionType).toBe('reflection');
    expect(result.href).toBeNull();
  });
});

// =====================================================================
// 3. Hierarchy discipline.
// =====================================================================

describe('the hierarchy is unchanged', () => {
  /**
   * PROVEN BY BREAKING IT. Moving 'movement_session' in
   * lib/priority/types.ts's PRIORITY_LADDER from directly above
   * 'daily_reset' to directly above 'todays_focus' turned the first two
   * tests below red. Restored immediately afterwards.
   */
  it('inserted one rung and moved none', () => {
    expect(PRIORITY_LADDER.filter((rule) => rule !== 'movement_session')).toEqual([
      ...PRIORITY_LADDER_BEFORE_MOVEMENT,
    ]);
    expect(PRIORITY_LADDER.indexOf('movement_session')).toBe(
      PRIORITY_LADDER.indexOf('daily_reset') - 1
    );
    expect(PRIORITY_RULES).toContain('movement_session');
  });

  it('nothing above the fallback can ever be a movement action', () => {
    // Every rule above the new rung, each made the highest applicable one,
    // with a full movement input available and a mapped driver present. The
    // only rung that may answer 'movement' is the driver rung.
    const cases: { rule: string; inputs: PriorityInputs }[] = [
      {
        rule: 'safety',
        inputs: { ...fallbackOnly(true), safetyFlag: { safetyClassificationId: 'cls-1' } },
      },
      { rule: 're_entry', inputs: { ...fallbackOnly(true), isReEntry: true } },
      {
        rule: 'reset_plan_commitment',
        inputs: {
          ...fallbackOnly(true),
          resetPlan: {
            planId: 'plan-1',
            planVersionId: 'ver-1',
            actionText: 'Give yourself a 5 minute walk outside within an hour of lunch.',
            difficultDayText: 'Step to a window and take 5 slow breaths.',
            daysLogged: 4,
            daysSinceStart: 6,
          },
        },
      },
      {
        rule: 'qualified_pattern',
        inputs: {
          ...fallbackOnly(true),
          qualifiedPattern: {
            pairKey: 'sitting_hours::evening_stiffness',
            label: 'Sitting hours and evening stiffness',
            memberSentence: 'This has held for several weeks now.',
            confidence: 0.8,
            observationCount: 20,
          },
        },
      },
      {
        rule: 'incomplete_action',
        inputs: {
          ...fallbackOnly(true),
          incompleteAction: {
            key: 'wbsa',
            name: 'Whole-Body Systems Assessment',
            href: '/assessment/wbsa',
            resumeHint: 'Your answers so far are saved.',
            lastTouchedLocalDate: '2026-08-05',
          },
        },
      },
      {
        rule: 'behavioral_friction',
        inputs: {
          ...fallbackOnly(true),
          behavioralFriction: {
            kind: 'daily_reset_incomplete',
            signalType: 'repeated_incomplete_flow',
            starts: 5,
            completions: 1,
            completionRate: 20,
            savedCount: null,
            windowDays: null,
            evidenceSufficiency: 'moderate',
          },
        },
      },
      {
        rule: 'todays_focus',
        inputs: {
          ...fallbackOnly(true),
          todaysFocus: {
            feedItemId: 'feed-1',
            focusText: 'Notice where your energy actually goes today.',
            reasonText: 'Your last few check-ins pointed at afternoons.',
            suggestedAction: 'Take one short walk after lunch.',
          },
        },
      },
    ];

    for (const { rule, inputs } of cases) {
      const result = selectCoachingAction(inputs, TODAY).selected;
      // Non-vacuity: the movement fallback genuinely was available and
      // genuinely lost to this rule.
      expect(applicableRules(inputs), rule).toContain('movement_session');
      expect(result.rule, rule).toBe(rule);
      expect(result.actionType, rule).not.toBe('movement');
      expect(result.href, rule).not.toBe('/movement/sessions/morning_mobility');
    }
  });

  it('lets safety, re-entry and the commitment win even over a mapped movement driver', () => {
    const withMovementDriver = driverInputs('MEC-3', 'MEC');
    expect(selectCoachingAction(withMovementDriver, TODAY).selected.actionType).toBe('movement');

    for (const inputs of [
      { ...withMovementDriver, safetyFlag: { safetyClassificationId: 'cls-1' } },
      { ...withMovementDriver, isReEntry: true },
      {
        ...withMovementDriver,
        resetPlan: {
          planId: 'plan-1',
          planVersionId: 'ver-1',
          actionText: 'Give yourself a 5 minute walk outside within an hour of lunch.',
          difficultDayText: 'Step to a window and take 5 slow breaths.',
          daysLogged: 4,
          daysSinceStart: 6,
        },
      },
    ]) {
      const result = selectCoachingAction(inputs, TODAY).selected;
      expect(result.actionType).not.toBe('movement');
      expect(result.href ?? '').not.toMatch(/movement\/sessions/);
    }
  });
});

// =====================================================================
// 4. Copy.
// =====================================================================

describe('movement copy is observational and earned tier only', () => {
  const titles = [
    selectCoachingAction(driverInputs('MOV-1', 'MOV'), TODAY).selected,
    selectCoachingAction(fallbackOnly(true), TODAY).selected,
  ];

  it('never diagnoses, never promises and never scolds', () => {
    const forbidden = [
      // Diagnosis.
      /\btight\b/i, /\bweak\b/i, /\bstiff\b/i, /\bimbalanc/i, /\bmisalign/i, /\bdysfunction/i,
      // Promise.
      /\bwill help\b/i, /\bwill fix\b/i, /\bwill loosen\b/i, /\bshould help\b/i, /\bwill improve\b/i,
      // Scold.
      /\byou should\b/i, /\byou have not\b/i, /\bneed to\b/i, /\bstreak\b/i, /\bmissed\b/i,
      // House style.
      /—/,
    ];

    for (const selected of titles) {
      for (const text of [selected.title, selected.help, selected.reason ?? '']) {
        for (const pattern of forbidden) {
          expect(text, `"${text}" matched ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });

  it('offers rather than instructs, and names the session by its own name', () => {
    const driver = titles[0]!;
    expect(driver.title).toContain('if you want it');
    expect(driver.title).toContain('Desk Reset');

    const fallback = titles[1]!;
    expect(fallback.title).toContain('if you want it');
    // The fallback makes no observation about her at all: its only reason
    // is a fact about the day.
    expect(fallback.reason).toBe('Your Daily Reset is already done for today.');
  });

  it('earns its reason line on exactly the evidence a noticing priority does', () => {
    const withFinding = selectCoachingAction(driverInputs('MOV-1', 'MOV'), TODAY).selected;
    expect(withFinding.reason).toBe(
      'On days with more sitting, your evenings tend to feel stiffer.'
    );

    // No earned finding sentence, so no reason line at all rather than a
    // weaker substitute.
    const inputs = driverInputs('MOV-1', 'MOV');
    inputs.implicatedDriver = { ...inputs.implicatedDriver!, findingSentence: null };
    expect(selectCoachingAction(inputs, TODAY).selected.reason).toBeNull();
  });

  it('offers the honest smaller version on Help me: no pressure, not a shorter session', () => {
    for (const selected of titles) {
      expect(selected.help.toLowerCase()).toMatch(/there when you are ready|there when you want it/);
      expect(selected.help.toLowerCase()).toMatch(/nothing has to happen|nothing is waiting/);
      // It never invents a shorter lineup this product does not have.
      expect(selected.help).not.toMatch(/\bjust the first\b|\bhalf\b|\bonly the first \d/i);
    }
  });
});

// =====================================================================
// 5. Privacy.
// =====================================================================

describe('a movement decision carries keys and counts only', () => {
  it('records a session key and nothing else about the session', () => {
    const driver = selectCoachingAction(driverInputs('MEC-3', 'MEC'), TODAY).selected;
    const fallback = selectCoachingAction(fallbackOnly(true), TODAY).selected;

    for (const selected of [driver, fallback]) {
      for (const [key, value] of Object.entries(selected.evidence)) {
        expect(ALLOWED_EVIDENCE_KEYS as readonly string[]).toContain(key);
        if (typeof value === 'string') {
          expect(value.length).toBeLessThanOrEqual(48);
          expect(value).toMatch(/^[a-z0-9_:.-]+$/i);
        }
      }
    }

    expect(driver.evidence.sessionKey).toBe('hip_back_reset');
    expect(fallback.evidence.sessionKey).toBe('morning_mobility');
  });

  it('drops health content passed under the session key, or any other key', () => {
    const clean = sanitizeSignalEvidence({
      rule: 'movement_session',
      sessionKey: 'hip_back_reset',
      // Every one of these is the shape health content would arrive in.
      painLocation: 'lower back',
      sessionNotes: 'my sciatica flared again this morning',
      exerciseId: 'cat-cow',
      sessionName: 'Hip and Back Reset',
    });

    expect(clean).toEqual({ rule: 'movement_session', sessionKey: 'hip_back_reset' });
  });

  it('cannot smuggle a sentence through the session key itself', () => {
    const clean = sanitizeSignalEvidence({
      rule: 'movement_session',
      sessionKey: 'her lower back has been hurting since Tuesday',
    });
    expect(clean.sessionKey).toBeUndefined();
  });
});

// =====================================================================
// 6. Downstream: grading and the Weekly Review, on the existing paths.
// =====================================================================

describe('movement flows through the existing downstream systems', () => {
  function movementDecision(overrides: Partial<GradeableDecision> = {}): GradeableDecision {
    return {
      localDate: '2026-08-01',
      actionType: 'movement',
      threadKey: 'movement_session::desk_reset',
      memberResponse: 'done',
      comparisonOutcome: null,
      ...overrides,
    };
  }

  it('grades movement exactly as it grades every other kind of ask', () => {
    const decisions = [
      movementDecision({ localDate: '2026-08-01', comparisonOutcome: 'moved' }),
      movementDecision({ localDate: '2026-08-03' }),
      movementDecision({ localDate: '2026-08-06', memberResponse: 'ignored' }),
    ];

    const grade = gradeDecisions('action_type', 'movement', 'movement', decisions);
    expect(grade.actionType).toBe('movement');
    expect(grade.deliveredCount).toBe(3);
    expect(grade.actedCount).toBe(2);
    expect(grade.movedCount).toBe(1);
    expect(grade.verdict).toBe('landing');

    // And it can be graded dead, on the same counts as anything else.
    const dead = gradeDecisions(
      'action_type',
      'movement',
      'movement',
      ['2026-08-01', '2026-08-03', '2026-08-05'].map((localDate) =>
        movementDecision({ localDate, memberResponse: 'ignored' })
      )
    );
    expect(dead.verdict).toBe('dead');
  });

  it('lets the Weekly Review name movement as what worked, with no new code', () => {
    // The week a review composed on 2026-08-10 looks BACK at: the seven
    // days ending the day before its own week start.
    const worked = buildWorked({
      weekStart: '2026-08-10',
      todayLocalDate: TODAY,
      patternStates: [],
      checkinLocalDates: ['2026-08-04', '2026-08-05', '2026-08-06'],
      friction: null,
      planWeek: null,
      decisions: [
        { localDate: '2026-08-04', rule: 'movement_session', actionType: 'movement', threadKey: 'movement_session::desk_reset', memberResponse: 'done' },
        { localDate: '2026-08-05', rule: 'movement_session', actionType: 'movement', threadKey: 'movement_session::desk_reset', memberResponse: 'done' },
      ],
    });

    const acted = worked.find((item) => item.kind === 'acted_on_actions');
    expect(acted?.actionType).toBe('movement');
  });

  it('lets a week of movement she acted on become the coming week focus', () => {
    // The composer used to drop 'movement' from this count outright, which
    // would have handed a member who acted only on sessions a focus of
    // something she ignored.
    const focus = chooseWeekFocus(
      {
        weekStart: '2026-08-10',
        todayLocalDate: TODAY,
        patternStates: [],
        checkinLocalDates: ['2026-08-04', '2026-08-05', '2026-08-06'],
        friction: null,
        planWeek: null,
        decisions: [
          { localDate: '2026-08-04', rule: 'movement_session', actionType: 'movement', threadKey: 'movement_session::desk_reset', memberResponse: 'done' },
          { localDate: '2026-08-05', rule: 'movement_session', actionType: 'movement', threadKey: 'movement_session::desk_reset', memberResponse: 'done' },
        ],
      },
      'full',
      []
    );
    expect(focus.actionType).toBe('movement');
    expect(focus.reason).toBe('engagement_strong');
  });
});

// =====================================================================
// 7. Auto-done, against the real database.
// =====================================================================

describe('completing the session marks the decision done', () => {
  const memberId = TEST_USERS.memberOne.id;

  afterEach(async () => {
    const service = serviceRoleClient();
    await service.from('member_coaching_decisions').delete().eq('member_id', memberId);
    await service.from('member_coaching_threads').delete().eq('member_id', memberId);
    await service.from('member_daily_priorities').delete().eq('member_id', memberId);
  });

  async function deliverMovement(
    client: Awaited<ReturnType<typeof signInAs>>,
    sessionKey: string
  ) {
    await claimDailyPriority(client, memberId, TODAY, {
      rule: 'movement_session',
      priorityKey: sessionKey,
      title: 'Desk Reset is there if you want it today.',
      reason: null,
      help: 'Nothing is waiting on you.',
      href: movementSessionHref('desk_reset'),
      actionType: 'movement',
      threadKey: `movement_session::${sessionKey}`,
      approach: 0,
      evidence: { rule: 'movement_session', sessionKey },
    });

    return recordCoachingDecision(
      client,
      memberId,
      {
        localDate: TODAY,
        rule: 'movement_session',
        actionType: 'movement',
        threadKey: `movement_session::${sessionKey}`,
        approach: 0,
        isFollowOn: false,
        signalEvidence: { rule: 'movement_session', sessionKey },
      },
      DEFAULT_COMPARISON_WINDOW_DAYS
    );
  }

  it('accepts the new rule slug, which the database constraint has to allow', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverMovement(member, 'desk_reset');

    const record = await getDailyPriority(member, memberId, TODAY);
    expect(record?.rule).toBe('movement_session');
    expect(record?.href).toBe('/movement/sessions/desk_reset');
  });

  it('records done in the ledger with the right response and session key', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverMovement(member, 'desk_reset');

    const outcome = await recordMovementSessionCompletion(member, memberId, TODAY, 'desk_reset');
    expect(outcome).toBe('recorded');

    const decision = await getCoachingDecision(member, memberId, TODAY);
    expect(decision?.memberResponse).toBe('done');
    expect(decision?.actionType).toBe('movement');
    expect(decision?.signalEvidence.sessionKey).toBe('desk_reset');
    expect(decision?.respondedAt).not.toBeNull();

    // And the card's own status agrees, so she is never asked to confirm
    // something she already did.
    expect((await getDailyPriority(member, memberId, TODAY))?.status).toBe('done');
  });

  it('does not count twice when she repeats the session the same day', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverMovement(member, 'desk_reset');

    expect(await recordMovementSessionCompletion(member, memberId, TODAY, 'desk_reset')).toBe(
      'recorded'
    );
    const first = await getCoachingDecision(member, memberId, TODAY);

    expect(await recordMovementSessionCompletion(member, memberId, TODAY, 'desk_reset')).toBe(
      'already_answered'
    );
    expect(await recordMovementSessionCompletion(member, memberId, TODAY, 'desk_reset')).toBe(
      'already_answered'
    );

    const after = await getCoachingDecision(member, memberId, TODAY);
    expect(after?.memberResponse).toBe('done');
    // The timestamp did not move, which is what proves nothing was written
    // the second and third time.
    expect(after?.respondedAt).toBe(first?.respondedAt);
  });

  it('ignores a session that is not the one today asked for', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverMovement(member, 'desk_reset');

    expect(
      await recordMovementSessionCompletion(member, memberId, TODAY, 'recovery_day')
    ).toBe('not_todays_priority');

    const decision = await getCoachingDecision(member, memberId, TODAY);
    expect(decision?.memberResponse).toBeNull();
    expect((await getDailyPriority(member, memberId, TODAY))?.status).toBe('active');
  });

  it('ignores a completed session on a day whose priority was not movement', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await recordCoachingDecision(
      member,
      memberId,
      {
        localDate: TODAY,
        rule: 'daily_reset',
        actionType: 'reset',
        threadKey: 'daily_reset::-',
        approach: 0,
        isFollowOn: false,
        signalEvidence: { rule: 'daily_reset' },
      },
      DEFAULT_COMPARISON_WINDOW_DAYS
    );

    expect(await recordMovementSessionCompletion(member, memberId, TODAY, 'desk_reset')).toBe(
      'not_todays_priority'
    );
    expect((await getCoachingDecision(member, memberId, TODAY))?.memberResponse).toBeNull();
  });

  it('leaves Save for later and ignored recording untouched for a movement action', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await deliverMovement(member, 'desk_reset');

    // Save for later goes through the same one function the card uses for
    // every other action type; nothing about movement changes it.
    const { recordCoachingResponse } = await import('@/lib/coaching-direction/data');
    expect(await recordCoachingResponse(member, memberId, TODAY, 'later')).toBe(true);
    expect((await getCoachingDecision(member, memberId, TODAY))?.memberResponse).toBe('later');

    // And a session finished afterwards cannot overwrite the answer she
    // already gave, which is the ledger's own one-answer rule.
    expect(await recordMovementSessionCompletion(member, memberId, TODAY, 'desk_reset')).toBe(
      'already_answered'
    );
    expect((await getCoachingDecision(member, memberId, TODAY))?.memberResponse).toBe('later');
  });
});

// =====================================================================
// 8. The card's action, read off the source.
// =====================================================================

describe('the card opens the session and needs no second tap', () => {
  it('uses the existing session player route and no new one', () => {
    expect(movementSessionHref('hip_back_reset')).toBe('/movement/sessions/hip_back_reset');
    // The route that serves it really exists.
    const route = path.join(APP_ROOT, 'app/movement/sessions/[sessionKey]/page.tsx');
    expect(readFileSync(route, 'utf8')).toMatch(/MovementSessionPlayer/);
  });

  it('closes the priority from the completion action, through the shared writer', () => {
    const source = readFileSync(path.join(APP_ROOT, 'app/actions/movement-sessions.ts'), 'utf8');
    expect(source).toMatch(/recordMovementSessionCompletion/);
    // No second outcome path: this action holds no write of its own into
    // either coaching table.
    expect(source).not.toMatch(/from\('member_coaching_decisions'\)/);
    expect(source).not.toMatch(/from\('member_daily_priorities'\)/);
  });

  it('leaves Save for later and Help me exactly as they are for every action type', () => {
    const source = readFileSync(path.join(APP_ROOT, 'app/actions/priority.ts'), 'utf8');
    // Neither action branches on the action type at all, which is what
    // makes "behaves exactly as it does for every other action type" a
    // property of the code rather than a claim.
    expect(source).not.toMatch(/actionType === 'movement'/);
    expect(source).not.toMatch(/sessionKey/);
  });
});
