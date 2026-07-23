/**
 * End-to-end tests for the Root Coaching Conversation Engine's memory layer
 * (Prompt 13, migration 96 — member_coaching_messages) against real local
 * Supabase — real RLS, no mocked client, same philosophy as
 * tests/longitudinal-intelligence-integration.test.ts. Exercises
 * lib/root-coaching-engine/data.ts directly.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { listRecentCoachingMessages, recordCoachingMessage } from '../lib/root-coaching-engine';

const memberId = TEST_USERS.memberOne.id;

afterAll(async () => {
  const service = serviceRoleClient();
  await service.from('member_coaching_messages').delete().eq('member_id', memberId);
});

describe('member_coaching_messages — append-only memory layer (migration 96)', () => {
  it('records a message and lists it back, most recent first', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);

    await recordCoachingMessage(memberClient, memberId, {
      topicKey: 'checkin_metric::sleep',
      conversationType: 'repeated_signal',
      messageText: 'This has shown up several times recently with your sleep.',
      sourceState: 'repeated_signal',
    });
    await recordCoachingMessage(memberClient, memberId, {
      topicKey: 'checkin_metric::stress',
      conversationType: 'worsening_trend',
      messageText: 'Your stress levels have become a little more consistent lately.',
      sourceState: 'worsening',
    });

    const messages = await listRecentCoachingMessages(memberClient, memberId);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0]!.topicKey).toBe('checkin_metric::stress');
    expect(messages[0]!.messageHash).toBeTruthy();
  });

  it('a member cannot read another member’s coaching messages, and an assigned coach can', async () => {
    const otherMemberClient = await signInAs(TEST_USERS.memberTwo);
    const asOtherMember = await listRecentCoachingMessages(otherMemberClient, memberId);
    expect(asOtherMember.every((m) => m.memberId !== memberId)).toBe(true);

    const coachClient = await signInAs(TEST_USERS.coachOne);
    const asCoach = await listRecentCoachingMessages(coachClient, memberId);
    expect(asCoach.length).toBeGreaterThan(0);
  });
});
