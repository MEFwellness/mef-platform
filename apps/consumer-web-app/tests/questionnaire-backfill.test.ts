/**
 * H. THE BACKFILL: members who finished the survey before Root could read it.
 *
 * Driven through the real backfill, the real ingestion and the real survey
 * lookup against the PostgREST stand-in, with the shipped Signal Library,
 * map and survey content. What it proves:
 *
 *   an existing member's stored sittings reach the coach without a retake;
 *   the latest sitting is the one Root reads, and a retake's history stays;
 *   an unfinished sitting is never treated as finished;
 *   a test account is skipped unless asked for;
 *   RUN TWICE, THE WHOLE DATABASE IS IDENTICAL, row ids included;
 *   the survey's own rows are never written;
 *   the cross-member scan pages past the thousand row cap.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system-relationships/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-relationships/data')>();
  const fixture = await import('./questionnaire-root-fixture');
  return { ...actual, listRelationships: async () => ({ ok: true, summaries: fixture.REAL_SUMMARIES }) };
});
vi.mock('@/lib/cross-system-signals/contentData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-signals/contentData')>();
  const fixture = await import('./questionnaire-root-fixture');
  return { ...actual, loadSignalLibrary: async () => fixture.REAL_LIBRARY };
});
vi.mock('@/lib/body-systems/contentData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/body-systems/contentData')>();
  const fixture = await import('./questionnaire-root-fixture');
  const survey = await import('./body-systems-fixture');
  return {
    ...actual,
    loadMemberContent: async () => fixture.SURVEY_CONTENT,
    loadAssociationTriggers: async () => fixture.SURVEY_TRIGGERS,
    loadCoachContent: async () => ({ ...fixture.SURVEY_CONTENT, library: survey.LIBRARY, coachCopy: {} }),
  };
});
vi.mock('@/lib/time/memberToday', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/time/memberToday')>();
  return { ...actual, memberTimezone: async () => 'America/New_York' };
});
vi.mock('@/lib/cross-system-patterns/evaluate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-patterns/evaluate')>();
  return { ...actual, evaluateMember: async () => ({ evaluated: 0, surfaced: 0, skipped: null }) };
});

import {
  backfillQuestionnaireRoot,
  listCompletedSittings,
} from '@/lib/cross-system-root/questionnaireBackfill';
import { readRootNoticed } from '@/lib/cross-system-root/noticedRead';
import { readCoachSignalsView } from '@/lib/cross-system-signals/coachRead';
import { DB_MAX_ROWS, FakeDb, MEMBER_ID, answers, sittingRow } from './questionnaire-root-fixture';

const REAL_TWO = '00000000-0000-4000-8000-00000000beef';
const TEST_ACCOUNT = '00000000-0000-4000-8000-00000000cafe';
const NOW = '2026-09-17T18:00:00.000Z';

let db: FakeDb;

/**
 * Production as it stood before this build: finished sittings and one
 * unfinished one, with no signal rows and no findings from any of them.
 */
function seedExistingMembers(): void {
  db = new FakeDb();
  db.rows('profiles').push(
    { id: MEMBER_ID, is_test: false },
    { id: REAL_TWO, is_test: null },
    { id: TEST_ACCOUNT, is_test: true }
  );
  db.rows('member_body_systems_sessions').push(
    // A retake: headaches Often in August, then Never in September, with
    // bloating Almost always and sleep Often on the newer sitting.
    sittingRow({ id: 'old-sitting', answers: answers({ N4: 'often' }), completedAt: '2026-08-10T14:00:00.000Z' }),
    sittingRow({
      id: 'new-sitting',
      answers: answers({ N4: 'never', D1: 'almost_always', HB7: 'often', K2: 'sometimes' }),
      completedAt: '2026-09-11T14:00:00.000Z',
    }),
    // Started and never finished. Its answers must never become signals.
    sittingRow({ id: 'unfinished', answers: answers({ M1: 'almost_always' }), completedAt: null }),
    sittingRow({ id: 'second-member', memberId: REAL_TWO, answers: answers({ A1: 'often' }), completedAt: '2026-09-05T14:00:00.000Z' }),
    sittingRow({ id: 'test-sitting', memberId: TEST_ACCOUNT, answers: answers({ N4: 'often' }), completedAt: '2026-09-05T14:00:00.000Z' })
  );
}

beforeEach(() => {
  seedExistingMembers();
});

describe('H. an existing member, backfilled', () => {
  it('reaches the coach from her stored sittings without a retake', async () => {
    const result = await backfillQuestionnaireRoot({ client: db.asClient(), now: NOW });

    expect(result.members.map((member) => member.memberId).sort()).toEqual(
      [MEMBER_ID, REAL_TWO, TEST_ACCOUNT].sort()
    );
    const her = result.members.find((member) => member.memberId === MEMBER_ID)!;
    expect(her.sittingIds).toEqual(['old-sitting', 'new-sitting']);
    expect(her.signalsWritten).toBeGreaterThan(0);
    expect(her.lookup!.sittingId).toBe('new-sitting');
    expect(her.lookup!.skipped).toBeNull();
    expect(her.lookup!.findings).toBeGreaterThan(0);

    const noticed = await readRootNoticed(db.asClient(), MEMBER_ID, { today: '2026-09-17' });
    const block = noticed.questionnaire!;
    expect(block.sittingId).toBe('new-sitting');
    expect(block.supportsLine).toContain('Bloating after eating');
    expect(block.supportsLine).toContain('Lighter or broken sleep');
    expect(block.supportsLine).not.toContain('Headaches');
    expect(block.findings.length).toBeGreaterThan(0);

    const signals = await readCoachSignalsView(db.asClient(), MEMBER_ID, { today: '2026-09-17' });
    const rows = signals.groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.signalSlug === 'headaches')!.stateLabel).toBe('Reported before, not current');
    expect(rows.find((row) => row.signalSlug === 'bloating-after-eating')!.stateLabel).toBe('Current');
    // The unsupported Sometimes is not a signal.
    expect(rows.find((row) => row.signalSlug === 'frequent-urination')).toBeUndefined();
  });

  it('never treats an unfinished sitting as finished', async () => {
    await backfillQuestionnaireRoot({ client: db.asClient(), now: NOW });
    expect(db.rows('cross_system_signals').filter((row) => row.source_session_id === 'unfinished')).toHaveLength(0);
    expect(db.rows('cross_system_root_findings').filter((row) => row.source_session_id === 'unfinished')).toHaveLength(0);
    const scan = await listCompletedSittings(db.asClient(), null);
    expect(scan.rows.map((row) => row.id)).not.toContain('unfinished');
  });

  it('skips a test account unless asked, and walks it when asked or named', async () => {
    const plain = await backfillQuestionnaireRoot({ client: db.asClient(), now: NOW });
    const test = plain.members.find((member) => member.memberId === TEST_ACCOUNT)!;
    expect(test.skippedAsTest).toBe(true);
    expect(db.rows('cross_system_signals').filter((row) => row.member_id === TEST_ACCOUNT)).toHaveLength(0);

    await backfillQuestionnaireRoot({ client: db.asClient(), memberId: TEST_ACCOUNT, now: NOW });
    expect(db.rows('cross_system_signals').filter((row) => row.member_id === TEST_ACCOUNT).length).toBeGreaterThan(0);
  });

  it('a dry run writes nothing at all', async () => {
    const before = db.snapshot();
    const result = await backfillQuestionnaireRoot({ client: db.asClient(), dryRun: true, now: NOW });
    expect(result.members.length).toBe(3);
    expect(db.snapshot()).toEqual(before);
  });
});

describe('idempotency: the backfill run twice leaves an identical database', () => {
  it('the second run files nothing, rewrites nothing, and every row keeps its id', async () => {
    const first = await backfillQuestionnaireRoot({ client: db.asClient(), includeTest: true, now: NOW });
    expect(first.signalsWritten).toBeGreaterThan(0);
    expect(first.findingsWritten).toBeGreaterThan(0);
    const afterFirst = db.snapshot();

    const second = await backfillQuestionnaireRoot({ client: db.asClient(), includeTest: true, now: '2026-09-18T09:00:00.000Z' });
    expect(second.signalsWritten).toBe(0);
    expect(second.findingsWritten).toBe(0);
    expect(second.membersUnchanged).toBe(3);
    expect(second.members.every((member) => member.lookup!.unchanged)).toBe(true);

    // Byte for byte, every table, ids and timestamps included. A later "now"
    // on the second run would have shown up in noticed_at had anything been
    // rewritten.
    expect(db.snapshot()).toEqual(afterFirst);
  });

  it('a live submit followed by the backfill writes nothing twice either', async () => {
    await backfillQuestionnaireRoot({ client: db.asClient(), memberId: MEMBER_ID, now: NOW });
    const findings = db.rows('cross_system_root_findings').length;
    const signals = db.rows('cross_system_signals').length;
    await backfillQuestionnaireRoot({ client: db.asClient(), memberId: MEMBER_ID, now: NOW });
    expect(db.rows('cross_system_root_findings')).toHaveLength(findings);
    expect(db.rows('cross_system_signals')).toHaveLength(signals);
  });

  it('the survey sittings themselves are never written', async () => {
    const before = JSON.stringify(db.rows('member_body_systems_sessions'));
    await backfillQuestionnaireRoot({ client: db.asClient(), includeTest: true, now: NOW });
    await backfillQuestionnaireRoot({ client: db.asClient(), includeTest: true, now: NOW });
    expect(JSON.stringify(db.rows('member_body_systems_sessions'))).toBe(before);
  });
});

describe('the cross-member scan is paged', () => {
  it('reads every completed sitting when there are more than a thousand', async () => {
    const big = new FakeDb();
    for (let index = 0; index < 2500; index += 1) {
      big.rows('member_body_systems_sessions').push({
        id: `s-${String(index).padStart(5, '0')}`,
        member_id: `m-${index % 900}`,
        completed_at: `2026-09-${String(1 + (index % 28)).padStart(2, '0')}T12:00:00.000Z`,
        results: { branch: 'b', sections: [] },
      });
    }
    const scan = await listCompletedSittings(big.asClient(), null);
    expect(scan.ok).toBe(true);
    expect(scan.rows).toHaveLength(2500);
    expect(new Set(scan.rows.map((row) => row.id)).size).toBe(2500);
  });

  it('is non vacuous: one unbounded read of the same table stops at the cap', async () => {
    const big = new FakeDb();
    for (let index = 0; index < 2500; index += 1) {
      big.rows('member_body_systems_sessions').push({ id: `s-${index}`, member_id: 'm', completed_at: 'x', results: {} });
    }
    const { data } = (await big.from('member_body_systems_sessions').select('id')) as { data: unknown[] };
    expect(data).toHaveLength(DB_MAX_ROWS);
  });
});
