/**
 * THE DAY'S PRIORITY IS DECIDED BY THE CARD, AND IT WAITS FOR THE DAILY
 * RESET (2026-08-27).
 *
 * Two faults, one shape. `claimDailyPriority` is an insert-if-absent with
 * a real unique index, which is right, and it was reachable from six
 * render paths through `TodaysFocusLine`: Home, Today, Movement, the Root
 * Map, Recommendations and the Root Score, plus Root's own chat. So the
 * day's one priority was fixed by whichever screen she happened to open
 * first, which on most mornings was before she had checked in. Root then
 * spent the rest of the day pointing at a decision made without today's
 * answers in it, and had no way to revisit that once she had answered.
 *
 * The two halves of the fix:
 *
 *   1. Only the three surfaces that actually SHOW the Priority Card run
 *      the engine. Everything else reads the stored decision and renders
 *      nothing when there is not one yet, which is exactly what
 *      TodaysFocusLine's own contract already said it does with a null.
 *   2. Exactly one revision is allowed, and only when the first decision
 *      was made before the check-in, the check-in now exists, and she has
 *      not already acted on the card.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import {
  claimDailyPriority,
  getDailyPriority,
  redecideDailyPriority,
  setDailyPriorityStatus,
} from '../lib/priority/data';
import type { SelectedPriority } from '../lib/priority/types';

const memberId = TEST_USERS.memberOne.id;
const TODAY = '2026-08-27';

function read(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
}

function selected(overrides: Partial<SelectedPriority> = {}): SelectedPriority {
  return {
    rule: 'todays_focus',
    priorityKey: 'focus-before',
    title: 'Take a walk after lunch.',
    reason: null,
    help: 'Two minutes counts.',
    href: null,
    actionType: 'behavior',
    threadKey: 'todays_focus::focus-before',
    approach: 1,
    evidence: {},
    ...overrides,
  } as SelectedPriority;
}

const AFTER_CHECKIN = selected({
  priorityKey: 'focus-after',
  title: 'Your sleep looks short again. Aim for lights out by ten.',
  threadKey: 'todays_focus::focus-after',
});

afterEach(async () => {
  const service = serviceRoleClient();
  await service.from('member_daily_priorities').delete().eq('member_id', memberId);
});

describe('one revision, and only when the check-in genuinely arrived after the decision', () => {
  it('browsing before the check-in, then checking in: the decision is revised once', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    // She opened Home before her Daily Reset. Root decided without it.
    const claimed = await claimDailyPriority(client, memberId, TODAY, selected(), true);
    expect(claimed).not.toBeNull();
    expect(claimed!.decidedBeforeCheckin).toBe(true);
    expect(claimed!.priorityKey).toBe('focus-before');

    // She checks in. The next render of the card revises.
    const revised = await redecideDailyPriority(client, memberId, TODAY, AFTER_CHECKIN);
    expect(revised).not.toBeNull();
    expect(revised!.priorityKey).toBe('focus-after');
    expect(revised!.title).toBe(AFTER_CHECKIN.title);
    expect(revised!.redecidedAt).not.toBeNull();
    expect(revised!.decidedBeforeCheckin).toBe(false);

    // And it is one revision, not a loop. Every later render finds nothing
    // to do, which is what keeps "one priority per day" true.
    const again = await redecideDailyPriority(client, memberId, TODAY, selected({ title: 'A third thing.' }));
    expect(again).toBeNull();

    const stored = await getDailyPriority(client, memberId, TODAY);
    expect(stored!.title).toBe(AFTER_CHECKIN.title);
  });

  it('checking in first: the decision already had the check-in in it, so nothing is revised', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    const claimed = await claimDailyPriority(client, memberId, TODAY, selected(), false);
    expect(claimed!.decidedBeforeCheckin).toBe(false);

    const revised = await redecideDailyPriority(client, memberId, TODAY, AFTER_CHECKIN);
    expect(revised).toBeNull();

    const stored = await getDailyPriority(client, memberId, TODAY);
    expect(stored!.priorityKey).toBe('focus-before');
  });

  it('no check-in all day: the morning decision stands, untouched', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await claimDailyPriority(client, memberId, TODAY, selected(), true);
    // Nothing calls redecide, because the service only calls it when
    // context.checkinDoneToday is true. The row is exactly as claimed.
    const stored = await getDailyPriority(client, memberId, TODAY);
    expect(stored!.priorityKey).toBe('focus-before');
    expect(stored!.redecidedAt).toBeNull();
    expect(stored!.decidedBeforeCheckin).toBe(true);
  });

  /**
   * The belt to the previous test's braces. Revising sets
   * `decided_before_checkin` to false as well as stamping
   * `redecided_at`, so in ordinary operation either guard alone would stop
   * a second pass. This forces the state where only `redecided_at` can:
   * a row that still claims it was decided before the check-in AND has
   * already been revised once. Without that clause this row would be
   * rewritten every render for the rest of the day.
   */
  it('a row already stamped as revised is never revised again, even if the other condition still holds', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    const service = serviceRoleClient();

    await claimDailyPriority(client, memberId, TODAY, selected(), true);
    await service
      .from('member_daily_priorities')
      .update({ redecided_at: new Date().toISOString(), decided_before_checkin: true })
      .eq('member_id', memberId)
      .eq('local_date', TODAY);

    const revised = await redecideDailyPriority(client, memberId, TODAY, AFTER_CHECKIN);
    expect(revised).toBeNull();

    const stored = await getDailyPriority(client, memberId, TODAY);
    expect(stored!.priorityKey).toBe('focus-before');
  });

  it('a card she has already acted on is never rewritten under her', async () => {
    const client = await signInAs(TEST_USERS.memberOne);

    await claimDailyPriority(client, memberId, TODAY, selected(), true);
    await setDailyPriorityStatus(client, memberId, TODAY, 'done');

    const revised = await redecideDailyPriority(client, memberId, TODAY, AFTER_CHECKIN);
    expect(revised).toBeNull();

    const stored = await getDailyPriority(client, memberId, TODAY);
    expect(stored!.status).toBe('done');
    expect(stored!.title).toBe('Take a walk after lunch.');
  });

  it('two concurrent renders produce one revision between them, not two', async () => {
    const client = await signInAs(TEST_USERS.memberOne);
    await claimDailyPriority(client, memberId, TODAY, selected(), true);

    const [a, b] = await Promise.all([
      redecideDailyPriority(client, memberId, TODAY, AFTER_CHECKIN),
      redecideDailyPriority(
        client,
        memberId,
        TODAY,
        selected({ priorityKey: 'focus-other', title: 'Something else entirely.' })
      ),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });
});

describe('only the card decides the day', () => {
  const AMBIENT_SURFACES = [
    'app/movement/page.tsx',
    'app/root-map/page.tsx',
    'app/root-score/page.tsx',
    'app/recommendations/page.tsx',
  ];

  it.each(AMBIENT_SURFACES)('%s never runs the claiming engine', (page) => {
    const source = read(page);
    // It may name the focus. It may not decide it.
    expect(source).not.toContain('getMyPriorityView');
    expect(source).not.toContain('buildPriorityView');
    expect(source).not.toContain('claimDailyPriority');
  });

  it('the focus accessor reads the stored decision and never runs the engine', () => {
    const source = read('lib/member-interpretation/focus.ts');
    expect(source).toContain('getMyStoredPriority');
    expect(source).not.toMatch(/getMyPriorityView\(\)/);
  });

  it('the stored read really is a read, with no claim anywhere in it', () => {
    const source = read('lib/priority/view.ts');
    const start = source.indexOf('export const getMyStoredPriority');
    expect(start).toBeGreaterThan(-1);
    const fn = source.slice(start);
    expect(fn).toContain('getDailyPriority');
    expect(fn).not.toContain('claimDailyPriority');
    expect(fn).not.toContain('buildPriorityView');
  });

  it("Root's chat asks for the focus too, and therefore also cannot fix it", () => {
    const source = read('lib/conversation-coach/context.ts');
    expect(source).toContain('getMemberFocus');
    expect(source).not.toContain('getMyPriorityView');
  });

  it('the three surfaces that DO show the card still run the engine, so this is not just a disabled feature', () => {
    expect(read('app/dashboard/page.tsx')).toContain('getMyPriorityView()');
    expect(read('app/actions/rootPopupMessages.ts')).toContain('getMyPriorityView()');
    expect(read('app/today/page.tsx')).toContain('buildPriorityView');
  });
});
