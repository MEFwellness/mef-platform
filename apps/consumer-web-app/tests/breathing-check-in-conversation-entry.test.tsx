// @vitest-environment jsdom

/**
 * THE TAP FROM HER RESULTS INTO ROOT, wired end to end.
 *
 * "Review With My Coach" used to point at /conversation with nothing
 * attached, which opened a blank thread that knew nothing about the check
 * in she had just finished. It now carries its own entry point, and the
 * conversation page reads HER stored sitting to open with.
 *
 * THREE THINGS CAN SILENTLY BREAK THAT, AND ALL THREE ARE CHECKED HERE:
 *
 *   1. THE ENTRY POINT NOT BEING ACCEPTED. /conversation validates `entry`
 *      against a set and falls back to 'nav' for anything else. A missing
 *      entry there is not an error, it is a blank thread, which is exactly
 *      the failure this build exists to remove.
 *   2. THE DATABASE REFUSING IT. conversation_sessions.entry_point carries
 *      a check constraint. A value the app sends and the constraint does
 *      not hold means no session row at all.
 *   3. THE CONTEXT NOT BEING SENT. The seed is built on the server and
 *      handed to the client component. If that component does not pass it
 *      to the action, Root is told nothing and no test of the builder
 *      alone would notice.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '../..');
const EM_DASH = '—';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const sendMessage = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock('@/app/actions/conversation-coach', () => ({
  sendConversationMessageAction: (...args: unknown[]) => sendMessage(...args),
  requestCoachHandoffAction: async () => ({}),
}));

const { ConversationView } = await import('../app/conversation/ConversationView');
const { SUGGESTED_PROMPTS } = await import('../lib/conversation-coach/suggestedPrompts');
const { BPC_CONVERSATION_ENTRY, BPC_CONVERSATION_OPENER } = await import(
  '../lib/breathing-check-in/copy'
);

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

// ---------------------------------------------------------------------

describe('1. the route accepts the entry point her button sends', () => {
  it('lists it among the valid ones, so the link does not quietly fall back to a blank thread', () => {
    const source = read('app/conversation/page.tsx');
    const validSet = source.slice(
      source.indexOf('VALID_ENTRY_POINTS'),
      source.indexOf('export default')
    );
    expect(validSet).toContain(`'${BPC_CONVERSATION_ENTRY}'`);
  });

  it('has its own suggestion chips, and none of them carries an em dash', () => {
    const prompts = SUGGESTED_PROMPTS[BPC_CONVERSATION_ENTRY];
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) expect(prompt).not.toContain(EM_DASH);
  });
});

describe('2. the database holds the entry point', () => {
  const MIGRATION = 'supabase/migrations/00000000000232_breathing_check_in_conversation_entry.sql';

  it('exists and adds exactly this value to the check constraint', () => {
    const sql = fs.readFileSync(path.join(REPO, MIGRATION), 'utf8');
    expect(sql).toContain('conversation_sessions_entry_point_check');
    expect(sql).toContain(`'${BPC_CONVERSATION_ENTRY}'`);
  });

  it('is additive: every value the constraint already held is still in it', () => {
    const sql = fs.readFileSync(path.join(REPO, MIGRATION), 'utf8');
    // The list as migration 58 left it. A re-add that dropped one of these
    // would break an unrelated entry point without any test naming it.
    for (const existing of [
      'nav',
      'today_focus',
      'today_easier_option',
      'today_why',
      'today_completed',
      'progress_pattern',
      'progress_improved',
      'progress_focus',
      'checkin_explain',
      'checkin_feeling',
      'dashboard',
      'profile',
      'assessment',
      'body_assessment',
      'food_lens',
      'movement',
    ]) {
      expect(sql, existing).toContain(`'${existing}'`);
    }
  });

  it('touches migration 231 not at all', () => {
    const sql = fs.readFileSync(path.join(REPO, MIGRATION), 'utf8').toLowerCase();
    expect(sql).not.toContain('member_breathing_check_in_sessions');
    expect(sql).not.toContain('drop table');
  });
});

describe('3. the context actually reaches the action', () => {
  let host: HTMLDivElement;
  let root: Root;

  const session = {
    id: 'session-1',
    member_id: 'member-1',
    entry_point: 'breathing_check_in' as const,
    status: 'active' as const,
    title: null,
    started_at: '2026-09-12T00:00:00.000Z',
    last_message_at: '2026-09-12T00:00:00.000Z',
    created_at: '2026-09-12T00:00:00.000Z',
    updated_at: '2026-09-12T00:00:00.000Z',
  };

  const CONTEXT = 'her own Breathing Pattern Check-In results. Her total for this sitting: 27.';

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    sendMessage.mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function mount(options: { opener?: string | null; entryContext?: string | null } = {}) {
    act(() => {
      root.render(
        <ConversationView
          session={session}
          initialMessages={[]}
          entryPoint="breathing_check_in"
          suggestedPrompts={SUGGESTED_PROMPTS.breathing_check_in}
          opener={options.opener ?? null}
          entryContext={options.entryContext ?? null}
        />
      );
    });
  }

  async function click(label: string) {
    const target = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label
    );
    if (!target) {
      throw new Error(
        `no button labelled "${label}". Present: ${Array.from(host.querySelectorAll('button'))
          .map((b) => b.textContent?.trim())
          .join(' | ')}`
      );
    }
    await act(async () => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // The send runs inside a transition, so the action call and the state
    // it settles both land after the click returns.
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('opens with the breathing line rather than the generic question', () => {
    mount({ opener: BPC_CONVERSATION_OPENER });
    const text = host.textContent ?? '';
    expect(text).toContain(BPC_CONVERSATION_OPENER);
    expect(text).not.toContain('What would you like to talk through today?');
  });

  it('keeps the generic question on every other entry point', () => {
    mount({});
    expect(host.textContent ?? '').toContain('What would you like to talk through today?');
  });

  it('sends this sitting as the context with her first message', async () => {
    mount({ opener: BPC_CONVERSATION_OPENER, entryContext: CONTEXT });
    const prompt = SUGGESTED_PROMPTS.breathing_check_in[0]!;
    await click(prompt);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const call = sendMessage.mock.calls[0]!;
    expect(call[0]).toBe(prompt);
    expect(call[1]).toBe(session.id);
    expect(call[3]).toBe('breathing_check_in');
    // The fifth argument is the entry context. Before this build it was
    // simply never passed from this component, and nothing failed.
    expect(call[4]).toBe(CONTEXT);
  });

  it('sends null rather than a stale context when there is none', async () => {
    mount({});
    await click(SUGGESTED_PROMPTS.breathing_check_in[0]!);
    const call = sendMessage.mock.calls[0]!;
    expect(call[4]).toBeNull();
  });
});
