/**
 * The friction question, driven through the REAL three-day sequence.
 *
 * This exists because the state that makes the question appear cannot be
 * created on the production test member without lying about her. She has
 * responded to her priority card every single day it has been shown to her
 * (done, done, done, help, done, later), so her ignore streak is 0. Writing
 * a 3 into her thread counters would assert three days of ignoring that did
 * not happen, and the engine would then act on that fiction: it would change
 * how it speaks to her, and two changes later hand her thread to a coach.
 *
 * So the sequence is proven here instead, against the real engine
 * (`selectCoachingAction`) with the shape of her real inputs, one day at a
 * time. Nothing is stubbed except the counters the database would have been
 * holding on each of those mornings.
 *
 * What it proves, in order:
 *
 *   days 1 and 2 of silence   nothing changes, nothing is asked
 *   day 3                     THE QUESTION, and the wording does not change
 *   she answers               the framing she asked for, on the next run
 *   she ignores the question  the engine's own original framing, silently,
 *                             exactly as it behaved before this existed
 *   ever again                never asked a second time
 */
import { describe, it, expect } from 'vitest';
import { NO_ADAPTATION, selectCoachingAction, type AdaptationContext } from '@/lib/priority/select';
import type { PriorityInputs } from '@/lib/priority/types';
import {
  APPROACH_AS_WRITTEN,
  APPROACH_REFRAMED,
  APPROACH_SMALLER,
  IGNORES_BEFORE_APPROACH_CHANGE,
  threadKeyFor,
} from '@/lib/coaching-direction/adaptation';
import type { CoachingThreadState } from '@/lib/coaching-direction/types';
import {
  FRICTION_OPTIONS,
  FRICTION_QUESTION,
  NO_FRICTION_STATE,
  type FrictionReason,
  type ThreadFrictionState,
} from '@/lib/coaching-direction/friction';

/**
 * The production test member's real shape on 2026-08-17, read from
 * production: no Reset Plan, no implicated driver, no qualified pattern, no
 * abandoned assessment, no Coaching Brain feed item. Every rule comes up
 * empty and the final fallback wins, which is why her card says "Take a few
 * minutes for your Daily Reset."
 */
function herInputs(): PriorityInputs {
  return {
    safetyFlag: null,
    isReEntry: false,
    resetPlan: null,
    implicatedDriver: null,
    qualifiedPattern: null,
    incompleteAction: null,
    behavioralFriction: null,
    todaysFocus: null,
    movement: null,
    fallback: { checkinDoneToday: false, totalCheckins: 4, statedGoalLabel: 'Feel better day to day' },
    hasRealHistory: true,
  };
}

const THREAD = threadKeyFor('daily_reset', null);

function thread(consecutiveIgnored: number, approach = APPROACH_AS_WRITTEN): CoachingThreadState {
  return {
    threadKey: THREAD,
    rule: 'daily_reset',
    actionType: 'reset',
    approach,
    approachChanges: 0,
    consecutiveIgnored,
    responsesSinceLastChange: 0,
    firstSelectedLocalDate: '2026-08-12',
    lastSelectedLocalDate: '2026-08-19',
    coachEscalatedAt: null,
    coachEscalationReason: null,
    escalationCooldownUntil: null,
  };
}

function context(
  consecutiveIgnored: number,
  friction: ThreadFrictionState = NO_FRICTION_STATE,
  options: { armed?: boolean; approach?: number } = {}
): AdaptationContext {
  return {
    ...NO_ADAPTATION,
    threads: new Map([[THREAD, thread(consecutiveIgnored, options.approach)]]),
    friction: new Map([[THREAD, friction]]),
    // True is the state of production since migration 166 was applied.
    frictionAvailable: options.armed ?? true,
  };
}

const DAY = '2026-08-20';

describe('the three days that lead to the question', () => {
  it('the rule is three, and it comes from one place', () => {
    expect(IGNORES_BEFORE_APPROACH_CHANGE).toBe(3);
  });

  it('day one of silence: nothing is asked and nothing changes', () => {
    const decision = selectCoachingAction(herInputs(), DAY, context(1));
    expect(decision.askFriction).toBeNull();
    expect(decision.threadChanges).toEqual([]);
    expect(decision.selected.approach).toBe(APPROACH_AS_WRITTEN);
  });

  it('day two of silence: still nothing', () => {
    const decision = selectCoachingAction(herInputs(), DAY, context(2));
    expect(decision.askFriction).toBeNull();
    expect(decision.threadChanges).toEqual([]);
  });

  /** The moment. Before this build, day three silently reworded the card. */
  it('day three: Root asks, and does NOT reword the card at the same time', () => {
    const decision = selectCoachingAction(herInputs(), DAY, context(3));

    expect(decision.askFriction).toEqual({ threadKey: THREAD });
    // The card she is being asked about must not change out from under the
    // question being asked about it.
    expect(decision.selected.approach).toBe(APPROACH_AS_WRITTEN);
    expect(decision.threadChanges).toEqual([]);
    expect(decision.selected.title).toContain('Daily Reset');
  });

  it('the question Root asks is short, plain, and does not mention the streak', () => {
    expect(FRICTION_QUESTION).toBe('This one has not landed. What got in the way?');
    expect(FRICTION_QUESTION).not.toMatch(/three|3 days|streak|ignored|missed/i);
    expect(FRICTION_QUESTION).not.toContain('—');
  });

  it('the five answers she is offered are all about the day or the ask, never about her', () => {
    expect(FRICTION_OPTIONS.map((o) => o.label)).toEqual([
      'No time',
      'Too much to take on',
      'I forgot',
      'Not what I need right now',
      'Something else',
    ]);
  });
});

describe('what happens after she answers', () => {
  const answered = (reason: FrictionReason): ThreadFrictionState => ({
    asked: true,
    answered: true,
    reason,
    lastAskedLocalDate: '2026-08-20',
  });

  it('"No time" gets the smaller step rather than a reword', () => {
    const decision = selectCoachingAction(herInputs(), '2026-08-21', context(3, answered('no_time')));
    expect(decision.selected.approach).toBe(APPROACH_SMALLER);
    expect(decision.threadChanges).toEqual([
      { threadKey: THREAD, kind: 'approach_change', approach: APPROACH_SMALLER },
    ]);
  });

  it('"Too much to take on" does the same', () => {
    const decision = selectCoachingAction(herInputs(), '2026-08-21', context(3, answered('too_hard')));
    expect(decision.selected.approach).toBe(APPROACH_SMALLER);
  });

  it('"Not what I need right now" gets the reframe, which is the one case a smaller version does not help', () => {
    const decision = selectCoachingAction(
      herInputs(),
      '2026-08-21',
      context(3, answered('not_relevant'))
    );
    expect(decision.selected.approach).toBe(APPROACH_REFRAMED);
  });

  /**
   * The one that matters most for not being annoying. Nothing was wrong
   * with the ask; she did not see it. Rewording it would answer a question
   * she did not ask.
   */
  it('"I forgot" leaves the wording exactly as it was', () => {
    const decision = selectCoachingAction(
      herInputs(),
      '2026-08-21',
      context(3, answered('forgot'), { approach: APPROACH_SMALLER })
    );
    expect(decision.selected.approach).toBe(APPROACH_AS_WRITTEN);
  });

  it('"Something else" falls back to the engine\'s own order rather than guessing', () => {
    const decision = selectCoachingAction(
      herInputs(),
      '2026-08-21',
      context(3, answered('something_else'))
    );
    expect(decision.selected.approach).toBe(APPROACH_SMALLER);
  });

  it('the question is not asked again once she has answered it', () => {
    const decision = selectCoachingAction(herInputs(), '2026-08-21', context(3, answered('no_time')));
    expect(decision.askFriction).toBeNull();
  });
});

describe('what happens if she ignores the question itself', () => {
  const ignoredTheQuestion: ThreadFrictionState = {
    asked: true,
    answered: false,
    reason: null,
    lastAskedLocalDate: '2026-08-20',
  };

  /**
   * The rule the build prompt asked for in as many words: the current
   * silent behaviour proceeds as before. Expressed here as the DEFAULT
   * rather than as a special case, which is why it is hard to break.
   */
  it('the engine proceeds with the reword it would always have done', () => {
    const decision = selectCoachingAction(herInputs(), '2026-08-21', context(3, ignoredTheQuestion));
    expect(decision.selected.approach).toBe(APPROACH_SMALLER);
    expect(decision.threadChanges).toEqual([
      { threadKey: THREAD, kind: 'approach_change', approach: APPROACH_SMALLER },
    ]);
  });

  it('and never asks her a second time', () => {
    const decision = selectCoachingAction(herInputs(), '2026-08-21', context(3, ignoredTheQuestion));
    expect(decision.askFriction).toBeNull();
  });

  it('the question stays on the card for the rest of the day she was asked', () => {
    const sameDay = selectCoachingAction(
      herInputs(),
      '2026-08-20',
      context(3, ignoredTheQuestion)
    );
    expect(sameDay.askFriction).toEqual({ threadKey: THREAD });
  });
});

describe('the arming switch', () => {
  /**
   * What production looked like between the code deploying and migration
   * 166 being applied, and what it must look like again if that column ever
   * goes away.
   */
  it('an engine that could not store her answer does not ask the question', () => {
    const decision = selectCoachingAction(
      herInputs(),
      DAY,
      context(3, NO_FRICTION_STATE, { armed: false })
    );
    expect(decision.askFriction).toBeNull();
    // And it does exactly what it did before the question existed.
    expect(decision.selected.approach).toBe(APPROACH_SMALLER);
  });

  it('the same member, on the same day, with the columns present, is asked', () => {
    const decision = selectCoachingAction(
      herInputs(),
      DAY,
      context(3, NO_FRICTION_STATE, { armed: true })
    );
    expect(decision.askFriction).toEqual({ threadKey: THREAD });
  });
});

describe('a member who has responded is never asked', () => {
  /**
   * The production test member's real state on 2026-08-17: six recorded
   * days, a real response on every one of them, an ignore streak of zero.
   * Being armed must not mean being trigger-happy.
   */
  it('an ignore streak of zero produces no question and no change', () => {
    const decision = selectCoachingAction(herInputs(), DAY, context(0));
    expect(decision.askFriction).toBeNull();
    expect(decision.threadChanges).toEqual([]);
    expect(decision.selected.approach).toBe(APPROACH_AS_WRITTEN);
  });

  it('a member with no thread history at all is never asked', () => {
    const decision = selectCoachingAction(herInputs(), DAY, {
      ...NO_ADAPTATION,
      frictionAvailable: true,
    });
    expect(decision.askFriction).toBeNull();
  });
});
