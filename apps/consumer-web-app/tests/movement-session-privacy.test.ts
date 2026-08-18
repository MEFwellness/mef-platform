/**
 * Root Movement, Level 1 — the hard privacy line, enforced as a test.
 *
 * Same rule the engine builds draw, applied to this feature's own table
 * and its four events:
 *
 *   A movement session record or event payload may carry a session key,
 *   an exercise id, timestamps and counts. It may never carry a check-in
 *   answer, a pain location, a symptom, a reason for skipping, a rating,
 *   a note, or any free text.
 *
 * Four layers are checked, because each catches a different failure:
 *
 *   1. THE SCHEMA. The run table's columns ARE the privacy boundary: if
 *      there is no column a note could live in, no call site can put one
 *      there by mistake.
 *   2. THE SANITIZER, at runtime. Health content passed under an
 *      unexpected key, or as prose, is dropped rather than persisted.
 *   3. THE CALL SITES. The server actions are read as source and checked
 *      for a parameter that could carry health content at all.
 *   4. THE REAL OUTPUT. A full session is walked against the real
 *      database and every value that landed anywhere is scanned for
 *      health content by value.
 *
 * It also re-asserts, from this build's own side, what the movement flip
 * changed and what it did NOT. Root may now recommend a session, so the
 * old "still blocked" assertion is gone. What replaced it is stricter
 * about the thing that actually mattered: the coaching loop may know a
 * session KEY and nothing else, and the Weekly Review still holds no
 * session vocabulary of its own.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs, serviceRoleClient, TEST_USERS } from './setup/test-clients';
import { sanitizeAnalyticsPayload, trackProductEvent } from '../lib/analytics/track';
import {
  appendSessionRunSkip,
  completeSessionRun,
  getSessionDetail,
  insertSessionRun,
} from '../lib/movement-sessions/data';
import {
  BLOCKED_ACTION_TYPES,
  isEmittableActionType,
} from '../lib/coaching-direction/types';

const APP_ROOT = path.resolve(__dirname, '..');
const memberId = TEST_USERS.memberOne.id;
const SESSION_KEY = 'hip_back_reset';

/**
 * The health content this test hunts for. Every string here is the kind
 * of thing a real member really produces, and none of it may ever appear
 * on a run row or in an event payload.
 */
const HEALTH_CONTENT = [
  'my lower back hurts',
  'sciatica',
  'pain',
  'shoulder impingement',
  'slept badly',
  'stress',
  'too sore to finish',
  'I felt dizzy',
  'knee',
];

/** Column names that would mean health content has somewhere to live. */
const FORBIDDEN_COLUMN_FRAGMENTS = [
  'note',
  'reason',
  'rating',
  'pain',
  'symptom',
  'comment',
  'feedback',
  'difficulty',
  'text',
];

let member: SupabaseClient;

beforeAll(async () => {
  member = await signInAs(TEST_USERS.memberOne);
  // Same reason as tests/movement-session-runs.test.ts: a prior manual
  // Playwright pass leaves real rows behind for this seeded account, and
  // the event-count assertion below counts them.
  await clearMovementRows();
});

async function clearMovementRows() {
  const service = serviceRoleClient();
  await service.from('member_movement_session_runs').delete().eq('member_id', memberId);
  await service
    .from('member_wellness_events')
    .delete()
    .eq('member_id', memberId)
    .like('event_type', 'movement_session%');
  await service
    .from('member_wellness_events')
    .delete()
    .eq('member_id', memberId)
    .eq('event_type', 'movement_exercise_skipped');
}

afterEach(clearMovementRows);

describe('Root Movement privacy — layer 1, the schema itself', () => {
  it('gives the run table no column that health content could live in', async () => {
    // Reading a real row back with select('*') is what tells us the
    // table's actual column set, including any column a later migration
    // might add without this test being updated.
    const service = serviceRoleClient();
    const run = await insertSessionRun(member, memberId, SESSION_KEY);
    expect(run).not.toBeNull();

    const { data: rows } = await service
      .from('member_movement_session_runs')
      .select('*')
      .eq('id', run!.id);
    const columns = Object.keys(rows![0]!);

    for (const column of columns) {
      for (const fragment of FORBIDDEN_COLUMN_FRAGMENTS) {
        expect(
          column.toLowerCase().includes(fragment),
          `member_movement_session_runs.${column} could carry health content`
        ).toBe(false);
      }
    }

    // Positively: the only things stored are ids, a key, timestamps and
    // an array of exercise ids.
    expect(columns.sort()).toEqual(
      [
        'completed_at',
        'created_at',
        'id',
        'member_id',
        'session_key',
        'skipped_exercise_ids',
        'started_at',
        'updated_at',
      ].sort()
    );
  });

  it('stores skips as exercise ids only, never as anything a member wrote', async () => {
    const detail = await getSessionDetail(member, SESSION_KEY);
    const run = await insertSessionRun(member, memberId, SESSION_KEY);
    const validId = detail!.slots[0]!.external_id;

    const skipped = await appendSessionRunSkip(member, memberId, run!.id, validId);
    expect(skipped).toEqual([validId]);

    // Every stored value is a catalog id belonging to this session.
    const sessionIds = new Set(detail!.slots.map((s) => s.external_id));
    for (const id of skipped!) {
      expect(sessionIds.has(id)).toBe(true);
    }
  });
});

describe('Root Movement privacy — layer 2, the sanitizer', () => {
  it('drops health content passed under any key that is not on the allowlist', () => {
    const clean = sanitizeAnalyticsPayload({
      sessionKey: SESSION_KEY,
      // Every one of these is a plausible-looking key a future call site
      // might invent. None is on the allowlist, so none survives.
      skipReason: 'my lower back hurts',
      painLocation: 'lower_back',
      note: 'too sore to finish',
      symptom: 'sciatica',
    } as never);

    expect(clean).toEqual({ sessionKey: SESSION_KEY });
  });

  it('drops prose passed under a key that IS on the allowlist', () => {
    const clean = sanitizeAnalyticsPayload({
      sessionKey: 'I skipped the side plank because my shoulder was hurting again today',
      exerciseId: 'ok-id',
    } as never);

    // The long value is over the length ceiling and is dropped; the
    // short, legitimate one survives.
    expect(clean).toEqual({ exerciseId: 'ok-id' });
  });

  it('drops any non-string value, so an object of answers cannot travel', () => {
    const clean = sanitizeAnalyticsPayload({
      sessionKey: SESSION_KEY,
      exerciseCount: { pain: 4, stress: 5 },
    } as never);
    expect(clean).toEqual({ sessionKey: SESSION_KEY });
  });
});

describe('Root Movement privacy — layer 3, the call sites', () => {
  const actionsSource = readFileSync(path.join(APP_ROOT, 'app/actions/movement-sessions.ts'), 'utf8');
  // Both halves of the player. The screen itself now lives in
  // GuidedSessionPlayer (an assigned program workout is walked through the
  // same one), so reading only the Root file would leave these two
  // assertions passing on a file that no longer contains any member-facing
  // copy at all.
  const playerSource = [
    'components/movement-sessions/MovementSessionPlayer.tsx',
    'components/movement-sessions/GuidedSessionPlayer.tsx',
  ]
    .map((relative) => readFileSync(path.join(APP_ROOT, relative), 'utf8'))
    .join('\n');

  it('gives the server actions no parameter that could carry health content', () => {
    // Parameter lists only, not prose in the file's own comments.
    const signatures = actionsSource.match(/export async function[\s\S]*?\)\s*:/g) ?? [];
    expect(signatures.length).toBeGreaterThanOrEqual(4);

    for (const signature of signatures) {
      for (const fragment of ['note', 'reason', 'rating', 'pain', 'symptom', 'feedback']) {
        expect(
          signature.toLowerCase().includes(fragment),
          `a movement server action takes a "${fragment}" parameter`
        ).toBe(false);
      }
    }
  });

  it('never asks the member why she skipped anything', () => {
    expect(playerSource).not.toMatch(/why did you skip/i);
    expect(playerSource).not.toMatch(/how did that feel/i);
    // No free-text input of any kind on this screen.
    expect(playerSource).not.toMatch(/<textarea/i);
    expect(playerSource).not.toMatch(/type="text"/i);
  });

  it('keeps the Root voice: no em dashes and no exclamation marks in member-facing copy', () => {
    // Comments in this codebase legitimately use em dashes; the check is
    // on JSX text and string literals the member actually reads.
    const memberFacing = playerSource
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');
    expect(memberFacing).not.toMatch(/—/);
    expect(memberFacing).not.toMatch(/!['"<]/);
  });
});

describe('Root Movement privacy — layer 4, the real output', () => {
  it('walks a whole session and persists nothing but keys, ids, timestamps and counts', async () => {
    const detail = await getSessionDetail(member, SESSION_KEY);
    const run = await insertSessionRun(member, memberId, SESSION_KEY);
    const skippedId = detail!.slots[3]!.external_id;

    await trackProductEvent(member, {
      memberId,
      eventType: 'movement_session_viewed',
      timezone: 'America/New_York',
      payload: { sessionKey: SESSION_KEY, exerciseCount: String(detail!.slots.length) },
    });
    await trackProductEvent(member, {
      memberId,
      eventType: 'movement_session_started',
      timezone: 'America/New_York',
      payload: { sessionKey: SESSION_KEY },
    });
    await appendSessionRunSkip(member, memberId, run!.id, skippedId);
    await trackProductEvent(member, {
      memberId,
      eventType: 'movement_exercise_skipped',
      timezone: 'America/New_York',
      payload: { sessionKey: SESSION_KEY, exerciseId: skippedId },
    });
    const completed = await completeSessionRun(member, memberId, run!.id);
    await trackProductEvent(member, {
      memberId,
      eventType: 'movement_session_completed',
      timezone: 'America/New_York',
      payload: { sessionKey: SESSION_KEY, skipCount: String(completed!.skipped_exercise_ids.length) },
    });

    const service = serviceRoleClient();
    const { data: runRows } = await service
      .from('member_movement_session_runs')
      .select('*')
      .eq('member_id', memberId);
    const { data: eventRows } = await service
      .from('member_wellness_events')
      .select('event_type, payload')
      .eq('member_id', memberId)
      .or('event_type.like.movement_session%,event_type.eq.movement_exercise_skipped');

    expect(eventRows).toHaveLength(4);

    const persisted = JSON.stringify({ runRows, eventRows }).toLowerCase();
    for (const content of HEALTH_CONTENT) {
      expect(
        persisted.includes(content.toLowerCase()),
        `"${content}" reached a movement row or payload`
      ).toBe(false);
    }

    // Positively: every payload value is a short slug, an id or digits.
    for (const row of eventRows!) {
      for (const [key, value] of Object.entries(row.payload as Record<string, unknown>)) {
        expect(['sessionKey', 'exerciseId', 'exerciseCount', 'skipCount']).toContain(key);
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeLessThanOrEqual(48);
        expect(value as string).toMatch(/^[a-z0-9_-]+$/i);
      }
    }
  });
});

describe('Root Movement — what the engine may know about a session', () => {
  /**
   * GUARD TEST, asserted again from this feature's own side. The movement
   * flip made 'movement' emittable, so the old "still blocked" assertion
   * would now be asserting the opposite of the product. What is guarded
   * instead is the line that always mattered: the coaching loop may carry a
   * session KEY, and nothing else about a session.
   */
  it('blocks no action type, and requires a movement action to carry a session key', () => {
    expect(BLOCKED_ACTION_TYPES).toEqual([]);
    expect(isEmittableActionType('movement')).toBe(true);

    const select = readFileSync(path.join(APP_ROOT, 'lib/priority/select.ts'), 'utf8');
    // Both universal filters are still applied in the walk rather than
    // special-cased inside a rule.
    expect(select).toMatch(/isEmittableActionType/);
    expect(select).toMatch(/hasSessionBehindIt/);
  });

  it('carries a session key into the ledger and nothing else about the session', () => {
    const evidence = readFileSync(path.join(APP_ROOT, 'lib/coaching-direction/evidence.ts'), 'utf8');
    expect(evidence).toMatch(/'sessionKey'/);
    // Nothing that could describe the lineup itself.
    for (const forbidden of [
      'exerciseId',
      'exerciseName',
      'externalId',
      'slotOrder',
      'prescription',
      'cues',
      'durationSeconds',
      'reps',
    ]) {
      expect(evidence, `${forbidden} reached the evidence allowlist`).not.toMatch(
        new RegExp(`'${forbidden}'`)
      );
    }
  });

  it('gives the Weekly Review no session vocabulary of its own', () => {
    // The review speaks about KINDS of action, which it already could. It
    // still holds no session key, no session route and no lineup.
    for (const relative of ['lib/weekly-review/compose.ts', 'lib/weekly-review/plan.ts']) {
      const source = readFileSync(path.join(APP_ROOT, relative), 'utf8');
      expect(source, `${relative} references a session key`).not.toMatch(/sessionKey/);
      expect(source, `${relative} references the session routes`).not.toMatch(/movement-sessions/);
    }
  });
});
