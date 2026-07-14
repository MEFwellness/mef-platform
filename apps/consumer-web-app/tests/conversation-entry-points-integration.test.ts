/**
 * Confirms the three new conversation_sessions.entry_point values added
 * for the floating "Ask Your MEF Coach" launcher (migration
 * 00000000000035_conversation_entry_points_page_access.sql — 'dashboard',
 * 'profile', 'assessment') are actually accepted by the real database
 * constraint, against real local Supabase — no mocked client, same
 * philosophy as tests/conversation-coach-integration.test.ts.
 */
import { describe, it, expect, afterAll } from 'vitest';
import type { ConversationEntryPoint } from '@mef/shared-types-contracts';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { createSession, getSession } from '../lib/conversation-coach/data';

const NEW_ENTRY_POINTS: ConversationEntryPoint[] = ['dashboard', 'profile', 'assessment'];
const createdSessionIds: string[] = [];

afterAll(async () => {
  if (createdSessionIds.length === 0) return;
  const service = serviceRoleClient();
  await service.from('conversation_sessions').delete().in('id', createdSessionIds);
});

describe('conversation_sessions.entry_point — new page-access values', () => {
  it.each(NEW_ENTRY_POINTS)(
    'accepts entry_point %s without violating the check constraint',
    async (entryPoint) => {
      const memberClient = await signInAs(TEST_USERS.memberOne);

      const session = await createSession(memberClient, TEST_USERS.memberOne.id, entryPoint, null);
      expect(session).not.toBeNull();
      expect(session!.entry_point).toBe(entryPoint);
      createdSessionIds.push(session!.id);

      const fetched = await getSession(memberClient, session!.id);
      expect(fetched?.entry_point).toBe(entryPoint);
    }
  );

  it('still rejects an entry_point value that was never added', async () => {
    const memberClient = await signInAs(TEST_USERS.memberOne);
    const { error } = await memberClient.from('conversation_sessions').insert({
      member_id: TEST_USERS.memberOne.id,
      entry_point: 'not_a_real_entry_point',
      status: 'active',
      title: null,
    });
    expect(error).not.toBeNull();
  });
});
