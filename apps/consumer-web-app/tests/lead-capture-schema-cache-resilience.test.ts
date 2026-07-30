/**
 * Proves lib/lead-capture/data.ts's resilience to a stale PostgREST schema
 * cache for the `pattern_name` column — the exact live production failure
 * (PGRST204: "Could not find the 'pattern_name' column ... in the schema
 * cache") that made the whole Lead Capture Agent return 500 even though
 * the column genuinely exists in Postgres.
 *
 * Can't reproduce this against a real local Supabase (the column is never
 * stale there), so this is a hand-built fake SupabaseClient — same
 * approach this repo already uses elsewhere for a scenario a real
 * database can't be coaxed into (e.g. the driver-state-engine's fixed-core
 * test against a fake client). It only implements the exact chain shapes
 * data.ts actually calls: `.insert(payload)` (thenable), `.insert(payload)
 * .select().single()`, and `.update(payload).eq(col, val)`.
 */
import { describe, it, expect } from 'vitest';
import {
  createLeadConversation,
  updateLeadConversation,
  insertCapturedLead,
} from '../lib/lead-capture/data';

const PGRST204_PATTERN_NAME = {
  code: 'PGRST204',
  details: null,
  hint: null,
  message: "Could not find the 'pattern_name' column of 'lead_conversations' in the schema cache",
};

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  constructor(private result: { data: unknown; error: unknown }) {}
  then<T1, T2>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
  select(_columns: string) {
    return { single: async () => this.result };
  }
}

/** A fake client whose first write referencing `pattern_name` fails with PGRST204, and whose every other write succeeds — records every payload it was called with so the retry can be inspected. */
function makeFakeSupabase() {
  const insertCalls: Record<string, unknown>[] = [];
  const updateCalls: Record<string, unknown>[] = [];
  let insertAttempts = 0;
  let updateAttempts = 0;

  return {
    calls: { inserts: insertCalls, updates: updateCalls },
    from(_table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          insertCalls.push(payload);
          const isFirstAttemptWithPattern = insertAttempts === 0 && 'pattern_name' in payload;
          insertAttempts++;
          if (isFirstAttemptWithPattern) {
            return new FakeQuery({ data: null, error: PGRST204_PATTERN_NAME });
          }
          return new FakeQuery({ data: { ...payload, id: 'captured-lead-id' }, error: null });
        },
        update(payload: Record<string, unknown>) {
          updateCalls.push(payload);
          return {
            eq: async (_col: string, _val: string) => {
              const isFirstAttemptWithPattern = updateAttempts === 0 && 'pattern_name' in payload;
              updateAttempts++;
              if (isFirstAttemptWithPattern) {
                return { error: PGRST204_PATTERN_NAME };
              }
              return { error: null };
            },
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('lead-capture data — resilience to a stale PostgREST schema cache for pattern_name', () => {
  it('createLeadConversation retries without pattern_name and still succeeds', async () => {
    const fake = makeFakeSupabase();
    const conversation = await createLeadConversation(fake, 'https://example.com');

    expect(conversation).not.toBeNull();
    expect(conversation!.stage).toBe('opening');
    expect(fake.calls.inserts).toHaveLength(2);
    expect('pattern_name' in fake.calls.inserts[0]).toBe(true);
    expect('pattern_name' in fake.calls.inserts[1]).toBe(false);
  });

  it('updateLeadConversation retries without pattern_name only when pattern_name was actually in the patch', async () => {
    const fake = makeFakeSupabase();
    const ok = await updateLeadConversation(fake, 'conv-id', {
      stage: 'insight_capture',
      patternName: 'compensation_pattern',
    });

    expect(ok).toBe(true);
    expect(fake.calls.updates).toHaveLength(2);
    expect('pattern_name' in fake.calls.updates[0]).toBe(true);
    expect('pattern_name' in fake.calls.updates[1]).toBe(false);
    // The rest of the patch survives the retry — only pattern_name is dropped.
    expect(fake.calls.updates[1].stage).toBe('insight_capture');
  });

  it('updateLeadConversation does not retry (or fail) when pattern_name was never part of the patch', async () => {
    const fake = makeFakeSupabase();
    const ok = await updateLeadConversation(fake, 'conv-id', { stage: 'follow_up_2' });

    expect(ok).toBe(true);
    expect(fake.calls.updates).toHaveLength(1);
  });

  it('insertCapturedLead retries without pattern_name and still returns the captured lead', async () => {
    const fake = makeFakeSupabase();
    const lead = await insertCapturedLead(fake, {
      conversationId: 'conv-id',
      firstName: 'Jamie',
      email: 'jamie@example.test',
      topic: 'pain',
      leadTemperature: 'hot',
      routedTo: 'discovery_call',
      patternName: 'compensation_pattern',
    });

    expect(lead).not.toBeNull();
    expect(lead!.email).toBe('jamie@example.test');
    expect(fake.calls.inserts).toHaveLength(2);
    expect('pattern_name' in fake.calls.inserts[0]).toBe(true);
    expect('pattern_name' in fake.calls.inserts[1]).toBe(false);
  });
});
