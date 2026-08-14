/**
 * Home cleanup pass (2026-08-14), task 3 — the behavior behind the
 * completed priority's new placement, against real RLS and real tables.
 *
 * tests/home-cleanup-pass.test.ts proves WHERE each state renders. This
 * file proves the two claims that placement rests on, and that a source
 * scan cannot check:
 *
 *   1. Completing today's priority does not produce a new one. The stored
 *      row stays authoritative for the rest of her own local date, so the
 *      top slot cannot silently refill itself with a second focus.
 *   2. The next local date is a genuinely different row, which is the
 *      whole of "the compact card persists for the rest of that calendar
 *      day, then is gone" — no expiry job, no hide-after timer.
 *
 * Same philosophy as every other integration suite here: no mocked
 * Supabase client, the real data layer called as a real signed-in member.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';
import {
  claimDailyPriority,
  getDailyPriority,
  setDailyPriorityStatus,
} from '@/lib/priority/data';
import { buildPriorityView } from '@/lib/priority/service';

const MEMBER = TEST_USERS.memberOne.id;
const TODAY = '2026-08-14';
const TOMORROW = '2026-08-15';

const SELECTED = {
  rule: 'daily_reset' as const,
  priorityKey: null,
  title: 'Take a few minutes for your Daily Reset.',
  reason: null,
  help: 'It is a short set of questions and you can stop at any point.',
  href: '/checkin',
  actionType: 'reset' as const,
  threadKey: 'daily_reset::-',
  approach: 0,
  evidence: {},
};

const CONTEXT = {
  recentCheckins: [],
  todaysFocus: null,
  checkinDoneToday: false,
  totalCheckins: 0,
};

afterEach(async () => {
  const service = serviceRoleClient();
  const ids = [TEST_USERS.memberOne.id, TEST_USERS.memberTwo.id];
  await service.from('member_daily_priorities').delete().in('member_id', ids);
  await service.from('member_coaching_decisions').delete().in('member_id', ids);
  await service.from('member_coaching_threads').delete().in('member_id', ids);
});

describe('completing today\'s priority never produces a second one', () => {
  it('the view reports the same row as done, with the same words, after Done', async () => {
    const member = await signInAs(TEST_USERS.memberOne);

    const claimed = await claimDailyPriority(member, MEMBER, TODAY, SELECTED);
    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe('active');

    expect(await setDailyPriorityStatus(member, MEMBER, TODAY, 'done')).toBe(true);

    const view = await buildPriorityView(member, MEMBER, TODAY, CONTEXT);
    expect(view).not.toBeNull();
    // Done, not active: the pages render the top slot on
    // `status === 'active'`, so this is what actually empties it.
    expect(view!.status).toBe('done');
    // The same priority she completed, not a fresh selection wearing the
    // same slot.
    expect(view!.selected.title).toBe(SELECTED.title);
    expect(view!.selected.rule).toBe('daily_reset');
  });

  it('re-rendering the page all day long never flips it back to active or swaps the words', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await claimDailyPriority(member, MEMBER, TODAY, SELECTED);
    await setDailyPriorityStatus(member, MEMBER, TODAY, 'done');

    for (let render = 0; render < 3; render++) {
      const view = await buildPriorityView(member, MEMBER, TODAY, CONTEXT);
      expect(view!.status).toBe('done');
      expect(view!.selected.title).toBe(SELECTED.title);
    }

    // And exactly one row exists for the day, which is what "one focus per
    // day" means in the database rather than in a comment.
    const service = serviceRoleClient();
    const { data } = await service
      .from('member_daily_priorities')
      .select('id')
      .eq('member_id', MEMBER)
      .eq('local_date', TODAY);
    expect(data?.length).toBe(1);
  });

  it('a saved card is still a saved card, unchanged by this pass', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await claimDailyPriority(member, MEMBER, TODAY, SELECTED);
    await setDailyPriorityStatus(member, MEMBER, TODAY, 'saved');

    const view = await buildPriorityView(member, MEMBER, TODAY, CONTEXT);
    expect(view!.status).toBe('saved');
    expect(view!.selected.title).toBe(SELECTED.title);
  });
});

describe('the accomplished card is scoped to her own calendar day', () => {
  it('today\'s completed row does not exist on tomorrow\'s date', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await claimDailyPriority(member, MEMBER, TODAY, SELECTED);
    await setDailyPriorityStatus(member, MEMBER, TODAY, 'done');

    // Nothing hides the card at midnight: tomorrow simply reads a
    // different key, and there is no row under it yet.
    expect(await getDailyPriority(member, MEMBER, TOMORROW)).toBeNull();
    expect((await getDailyPriority(member, MEMBER, TODAY))!.status).toBe('done');
  });

  it('tomorrow claims its own fresh, active row', async () => {
    const member = await signInAs(TEST_USERS.memberOne);
    await claimDailyPriority(member, MEMBER, TODAY, SELECTED);
    await setDailyPriorityStatus(member, MEMBER, TODAY, 'done');

    const tomorrow = await claimDailyPriority(member, MEMBER, TOMORROW, SELECTED);
    expect(tomorrow).not.toBeNull();
    expect(tomorrow!.status).toBe('active');
    expect(tomorrow!.localDate).toBe(TOMORROW);
  });
});
