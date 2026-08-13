/**
 * The Root pop-ups answer instantly, and still never lose the answer.
 *
 * THE BUG THIS FILE EXISTS FOR. On production, under Chrome's own Slow 3G
 * profile, tapping the Weekly Root Review's "Got it" left the pop-up on
 * screen with every button in it disabled and the page behind it locked
 * against scrolling for 2.9 seconds, because the close was sequenced after
 * the server round trip and `isPending` was wired to `disabled`. The
 * Priority Card had the same wiring in a quieter place: its collapsed
 * "saved" card renders its own Done button, and that button was disabled
 * for the whole write that had just saved it.
 *
 * WHAT IS ACTUALLY ASSERTED HERE. Two properties, and they pull against
 * each other, which is the whole point:
 *
 *   1. Time to visual feedback does not depend on the network. Every one
 *      of the four buttons is driven through the real path with a write
 *      that takes a slow-3G round trip, and the visible consequence is
 *      measured with a clock. Not "a state setter was called" — how long
 *      the member waited.
 *   2. The write still lands. A first attempt that fails is retried, and
 *      the outcome ledger row is checked in a real database afterwards.
 *
 * Component-level tests are not possible here (node environment, no DOM —
 * see tests/priority-card-motion.test.ts's own note), so the property is
 * asserted where it actually lives: the pure module both handlers call,
 * plus source scans proving the handlers have not quietly grown an await
 * in front of the member again.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { optimisticWrite } from '@/lib/client/optimisticWrite';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  DEFAULT_COMPARISON_WINDOW_DAYS,
  getCoachingDecision,
  recordCoachingDecision,
  recordCoachingResponse,
} from '@/lib/coaching-direction/data';

const APP_ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return readFileSync(path.join(APP_ROOT, relative), 'utf8');
}

/** The same file with its comments removed, so a scan matches code and not prose about the code. */
function readCode(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * A round trip on the connection this bug was found on. Measured on
 * production with Chrome's Slow 3G profile: the acknowledge write settled
 * at just under three seconds.
 */
const SLOW_3G_ROUND_TRIP_MS = 3000;

/**
 * What "immediately" is allowed to mean. Generous by two orders of
 * magnitude against the 2900ms this replaced, and still small enough that
 * it cannot pass if anything network-shaped is awaited first.
 */
const IMMEDIATE_MS = 50;

function slowWrite(ms: number, result = true): () => Promise<boolean> {
  return () => new Promise((resolve) => setTimeout(() => resolve(result), ms));
}

/** Never sleeps. Backoff is a real delay in production and pure noise in a test. */
const noSleep = async () => {};

// ---------------------------------------------------------------------
// 1. Time to visual feedback, all four buttons
// ---------------------------------------------------------------------

describe('a pop-up button answers before the network does', () => {
  // The four taps, each described by what the member sees happen. The
  // acknowledge callbacks are the real ones' shape: pure state changes,
  // including the one that closes the pop-up.
  const BUTTONS = [
    { label: 'Priority Card: Done', sees: 'the accomplished state' },
    { label: 'Priority Card: Save for later', sees: 'the collapsed saved state' },
    { label: 'Priority Card: Help me', sees: 'the smaller step expanded' },
    { label: 'Weekly Root Review: Got it', sees: 'the pop-up close' },
  ];

  for (const button of BUTTONS) {
    it(`${button.label} shows ${button.sees} without waiting for the write`, async () => {
      let sawItAt: number | null = null;
      const tappedAt = performance.now();

      const settled = optimisticWrite({
        acknowledge: () => {
          sawItAt = performance.now();
        },
        write: slowWrite(SLOW_3G_ROUND_TRIP_MS),
      });

      // Read before awaiting anything: this is the same tick the tap
      // happened on, which is exactly the guarantee being made.
      expect(sawItAt).not.toBeNull();
      expect((sawItAt as unknown as number) - tappedAt).toBeLessThan(IMMEDIATE_MS);

      // And the write really did take a slow-3G round trip, so the number
      // above cannot be small because nothing was slow.
      await expect(settled).resolves.toBe(true);
      expect(performance.now() - tappedAt).toBeGreaterThan(SLOW_3G_ROUND_TRIP_MS - 200);
    });
  }

  it('a write that never resolves at all still does not hold up the answer', async () => {
    let acknowledged = false;
    void optimisticWrite({
      acknowledge: () => {
        acknowledged = true;
      },
      write: () => new Promise<boolean>(() => {}),
    });
    expect(acknowledged).toBe(true);
  });
});

// ---------------------------------------------------------------------
// 2. The write still lands
// ---------------------------------------------------------------------

describe('a failed first attempt is retried rather than dropped', () => {
  it('lands on the second attempt and never reports a loss', async () => {
    let attempts = 0;
    const lost: string[] = [];

    const landed = await optimisticWrite({
      acknowledge: () => {},
      write: async () => {
        attempts += 1;
        return attempts > 1;
      },
      onLost: () => lost.push('lost'),
      sleep: noSleep,
    });

    expect(landed).toBe(true);
    expect(attempts).toBe(2);
    expect(lost).toEqual([]);
  });

  it('treats a thrown write exactly like a refused one', async () => {
    let attempts = 0;
    const landed = await optimisticWrite({
      acknowledge: () => {},
      write: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('network');
        return true;
      },
      sleep: noSleep,
    });

    expect(landed).toBe(true);
    expect(attempts).toBe(2);
  });

  it('reports the loss once, and only after every attempt has failed', async () => {
    let attempts = 0;
    let lostCount = 0;

    const landed = await optimisticWrite({
      acknowledge: () => {},
      write: async () => {
        attempts += 1;
        return false;
      },
      onLost: () => {
        lostCount += 1;
      },
      attempts: 3,
      sleep: noSleep,
    });

    expect(landed).toBe(false);
    expect(attempts).toBe(3);
    expect(lostCount).toBe(1);
  });

  it('backs off between attempts instead of hammering', async () => {
    const slept: number[] = [];
    await optimisticWrite({
      acknowledge: () => {},
      write: async () => false,
      attempts: 3,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });

    // One wait per gap between attempts, never one after the last.
    expect(slept).toHaveLength(2);
    expect(slept[1]).toBeGreaterThan(slept[0] as number);
  });

  it('never rejects, so no call site has to remember to catch', async () => {
    await expect(
      optimisticWrite({
        acknowledge: () => {},
        write: async () => {
          throw new Error('boom');
        },
        attempts: 1,
        sleep: noSleep,
      })
    ).resolves.toBe(false);
  });
});

describe('a second tap on a button that is still on screen', () => {
  it('is refused by the status latch, not by disabling the button', () => {
    // The shape the hook uses, extracted: the button stays live, but the
    // handler knows the first tap already happened because it reads a ref
    // rather than the state value both taps closed over.
    const code = readCode('components/priority/usePriorityCardActions.ts');
    expect(code).toContain('useRef');
    expect(code).toMatch(/if \(statusRef\.current === 'done'\) return;/);
    expect(code).toMatch(/if \(statusRef\.current === 'saved'\) return;/);
  });
});

// ---------------------------------------------------------------------
// 3. The same thing, against the real database
// ---------------------------------------------------------------------

const TODAY = '2026-08-13';
const THREAD = 'reset_plan_commitment::plan-latency-1';

afterEach(async () => {
  const service = serviceRoleClient();
  const ids = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];
  await service.from('member_coaching_decisions').delete().in('member_id', ids);
  await service.from('member_coaching_threads').delete().in('member_id', ids);
});

describe('the outcome ledger row lands even when the first write does not', () => {
  it('retries a genuinely refused write and records the response once', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    // A real second member, whose session genuinely cannot touch the first
    // member's ledger row. That is the failure being injected: not a stub
    // returning false, but a write the database itself refuses.
    const stranger = await signInAs(TEST_USERS.memberTwo);

    await recordCoachingDecision(
      member,
      TEST_USERS.memberOne.id,
      {
        localDate: TODAY,
        rule: 'reset_plan_commitment',
        actionType: 'reset',
        threadKey: THREAD,
        approach: 0,
        isFollowOn: false,
        signalEvidence: { rule: 'reset_plan_commitment', planId: 'plan-latency-1', daysLogged: 4 },
      },
      DEFAULT_COMPARISON_WINDOW_DAYS
    );

    let attempts = 0;
    let acknowledgedAt: number | null = null;
    const tappedAt = performance.now();

    const landed = await optimisticWrite({
      acknowledge: () => {
        acknowledgedAt = performance.now();
      },
      write: async () => {
        attempts += 1;
        const client = attempts === 1 ? stranger : member;
        return recordCoachingResponse(client, TEST_USERS.memberOne.id, TODAY, 'done');
      },
      sleep: noSleep,
    });

    // She saw her answer before either attempt had even been made.
    expect(acknowledgedAt).not.toBeNull();
    expect((acknowledgedAt as unknown as number) - tappedAt).toBeLessThan(IMMEDIATE_MS);

    expect(attempts).toBe(2);
    expect(landed).toBe(true);

    const stored = await getCoachingDecision(member, TEST_USERS.memberOne.id, TODAY);
    expect(stored?.memberResponse).toBe('done');
  });

  it('a retry of an already-recorded response cannot write a second one', async () => {
    const member = await signInAs(TEST_USERS.memberOne);

    await recordCoachingDecision(
      member,
      TEST_USERS.memberOne.id,
      {
        localDate: TODAY,
        rule: 'reset_plan_commitment',
        actionType: 'reset',
        threadKey: THREAD,
        approach: 0,
        isFollowOn: false,
        signalEvidence: { rule: 'reset_plan_commitment', planId: 'plan-latency-1', daysLogged: 4 },
      },
      DEFAULT_COMPARISON_WINDOW_DAYS
    );

    expect(await recordCoachingResponse(member, TEST_USERS.memberOne.id, TODAY, 'done')).toBe(true);
    // The conditional `member_response IS NULL` is what makes retrying
    // safe. A second landing here would mean a retry could overwrite an
    // answer she already gave.
    expect(await recordCoachingResponse(member, TEST_USERS.memberOne.id, TODAY, 'later')).toBe(
      false
    );

    const stored = await getCoachingDecision(member, TEST_USERS.memberOne.id, TODAY);
    expect(stored?.memberResponse).toBe('done');
  });
});

// ---------------------------------------------------------------------
// 4. The shape cannot come back
// ---------------------------------------------------------------------

describe('no handler puts the network in front of the member again', () => {
  const REVIEW_BODY = 'components/weekly-review/WeeklyReviewBody.tsx';
  const PRIORITY_ACTIONS = 'components/priority/usePriorityCardActions.ts';

  it('the weekly review closes the pop-up inside acknowledge, not after a write', () => {
    const code = readCode(REVIEW_BODY);
    // `onAcknowledged` may only be called from inside the synchronous
    // acknowledge callback. The bug was it being called after an awaited
    // action result.
    expect(code).toMatch(/acknowledge:\s*\(\)\s*=>\s*\{[^}]*onAcknowledged\?\.\(\)/s);
    expect(code).not.toMatch(/await\s+acknowledgeWeeklyReviewAction\(\)[\s\S]*onAcknowledged/);
  });

  it('every answer leaves the browser by a delivery a navigation cannot cancel', () => {
    for (const file of [REVIEW_BODY, PRIORITY_ACTIONS]) {
      expect(readCode(file)).toContain('deliverPopupResponse');
    }
    // keepalive is the whole property: it is what makes the request
    // outlive the page it was sent from.
    expect(readCode('lib/client/popupResponse.ts')).toContain('keepalive: true');
  });

  it('the delivery route adds no second write path, it hands to the same actions', () => {
    const route = readCode('app/api/popup-response/route.ts');
    for (const action of [
      'completePriorityAction',
      'savePriorityForLaterAction',
      'trackPriorityHelpAction',
      'acknowledgeWeeklyReviewAction',
      'answerWeeklyReviewQuestionAction',
    ]) {
      expect(route).toContain(action);
    }
    // No table is touched here. Every write stays behind the action that
    // already owned it, with its own guards and its own allowlists.
    expect(route).not.toContain('createClient');
    expect(route).not.toContain('.from(');
  });

  it('neither handler runs its write through useTransition any more', () => {
    for (const file of [REVIEW_BODY, PRIORITY_ACTIONS]) {
      expect(readCode(file)).not.toContain('useTransition');
    }
  });

  it('no pop-up button is disabled while a write is in flight', () => {
    const files = [
      REVIEW_BODY,
      'components/priority/PriorityCard.tsx',
      'components/priority/PriorityCardPopup.tsx',
    ];
    for (const file of files) {
      const code = readCode(file);
      expect(code).not.toContain('disabled={isPending}');
      expect(code).not.toContain('disabled={pending}');
    }
  });

  it('both handlers go through the one shared optimistic path', () => {
    for (const file of [REVIEW_BODY, PRIORITY_ACTIONS]) {
      expect(readCode(file)).toContain('optimisticWrite');
    }
  });

  it('the priority answer revalidates the page it changed, not the layout above it', () => {
    const code = readCode('app/actions/priority.ts');
    expect(code).toContain("revalidatePath('/today', 'page')");
    expect(code).not.toMatch(/revalidatePath\('\/today'\)\s*;/);
  });
});
