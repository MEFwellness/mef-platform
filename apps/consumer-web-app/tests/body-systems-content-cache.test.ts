/**
 * THE CONTENT BUNDLE IS READ ONCE, NOT ONCE PER TAP. (2026-09-11)
 *
 * Measured on production: a Continue on the survey took a median of
 * 1311ms and as much as 5025ms, forty-three times in one sitting, and
 * behind every one of them, and behind every autosave as well, were the
 * same eight queries fetching the same global content. One survey asked
 * for it more than a hundred and fifty times and was handed the identical
 * answer every time.
 *
 * Holding it is safe because none of it is scoped to a member and none of
 * it is written by the app: it changes when a migration changes it. What
 * this file pins is the part that would be dangerous to get wrong.
 *
 *   IT IS THE SAME BUNDLE FOR EVERY CALLER, so a hold cannot leak one
 *   member's view of it to another. Nothing below is filtered by who is
 *   asking.
 *   AN EMPTY READ IS NEVER HELD. A policy refusing a read, or a database
 *   having a bad minute, must not put emptiness in front of everybody for
 *   the next five minutes.
 *   AND IT DOES EXPIRE, so a content fix applied straight to the database
 *   is live without a deploy.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadMemberContent, forgetMemberContentCache } from '../lib/body-systems/contentData';

const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * A Supabase stand-in that counts how many table reads it is asked for.
 * `rows` decides what comes back, so the empty case can be driven too.
 */
function countingClient(rows: (table: string) => unknown[]) {
  const reads: string[] = [];
  const builder = (table: string) => {
    const result = Promise.resolve({ data: rows(table), error: null });
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve({ data: (rows(table)[0] ?? null) as unknown, error: null }),
      single: () => Promise.resolve({ data: (rows(table)[0] ?? null) as unknown, error: null }),
      then: (...args: unknown[]) => (result as unknown as { then: (...a: unknown[]) => unknown }).then(...args),
    };
    return chain;
  };
  return {
    reads,
    client: {
      from: (table: string) => {
        reads.push(table);
        return builder(table);
      },
    } as never,
  };
}

/** One plausible row per content table, enough for the bundle to be real. */
const FULL = (table: string): unknown[] => {
  if (table.includes('sections')) {
    return [{ section_key: 's1', display_name: 'Digestion', position: 1, member_intro_line: 'x' }];
  }
  if (table.includes('questions')) {
    return [
      {
        question_ref: 'q1',
        section_key: 's1',
        prompt: 'A prompt',
        position: 1,
        branch: 'all',
        allows_dna: false,
        dna_label: null,
      },
    ];
  }
  if (table.includes('scale')) return [{ value_key: 'v1', label: 'Never', points: 0, position: 1 }];
  if (table.includes('red_flag')) {
    return [{ flag_key: 'f1', prompt: 'A flag', position: 1, level: 'urgent' }];
  }
  return [{ copy_key: 'member.save_error', body: 'Could not save.', audience: 'member' }];
};

beforeEach(() => {
  forgetMemberContentCache();
  vi.useRealTimers();
});

afterEach(() => {
  forgetMemberContentCache();
  vi.useRealTimers();
});

describe('holding the bundle', () => {
  it('reads the tables once and serves every later caller from the hold', async () => {
    const a = countingClient(FULL);
    await loadMemberContent(a.client);
    const firstCount = a.reads.length;
    expect(firstCount).toBeGreaterThan(1);

    const b = countingClient(FULL);
    await loadMemberContent(b.client);
    expect(b.reads.length).toBe(0);
  });

  it('hands the second caller the same bundle, not a different view of it', async () => {
    const a = countingClient(FULL);
    const first = await loadMemberContent(a.client);
    const b = countingClient(FULL);
    const second = await loadMemberContent(b.client);
    expect(second).toBe(first);
  });

  it('never holds an empty read, so one bad minute is not five bad ones', async () => {
    const empty = countingClient(() => []);
    const result = await loadMemberContent(empty.client);
    expect(result.sections).toEqual([]);
    // The next caller must go back to the database rather than inherit it.
    const again = countingClient(FULL);
    await loadMemberContent(again.client);
    expect(again.reads.length).toBeGreaterThan(1);
  });

  it('lets go again, so a content fix does not need a deploy', () => {
    const source = read('lib/body-systems/contentData.ts');
    const ttl = source.match(/MEMBER_CONTENT_TTL_MS = ([\d_]+)/)?.[1]?.replace(/_/g, '');
    expect(ttl).toBeDefined();
    const ms = Number(ttl);
    expect(ms).toBeGreaterThan(0);
    // Long enough to cover one whole survey, short enough to correct.
    expect(ms).toBeGreaterThanOrEqual(60_000);
    expect(ms).toBeLessThanOrEqual(600_000);
  });

  it('holds nothing that belongs to a member', () => {
    const source = read('lib/body-systems/contentData.ts');
    const held = source.slice(
      source.indexOf('export async function loadMemberContent'),
      source.indexOf('export function forgetMemberContentCache')
    );
    // Every read in the held bundle is content. A member id anywhere in
    // here would mean one person's hold being served to another.
    expect(held).not.toContain('member_id');
    expect(held).not.toContain('user.id');
    expect(held).not.toContain('memberId');
  });
});

describe('the save no longer waits on one read before starting the other', () => {
  it('asks for the bundle and her assignment side by side', () => {
    const source = read('app/actions/bodySystems.ts');
    expect(source).toContain('const [content, assignmentRead] = await Promise.all([');
    expect(source).toContain('loadMemberContent(supabase)');
    expect(source).toContain('fetchPendingBodySystemsAssignment(supabase, user.id)');
  });
});
