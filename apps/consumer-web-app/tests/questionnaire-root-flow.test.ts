/**
 * ROOT READS THE BODY SYSTEMS SURVEY, END TO END.
 *
 * Every scenario the brief names, driven through the REAL pipeline: the
 * survey's own scoring builds the stored reading, the real adapter files
 * the answers, the real survey lookup consults the real Whole-Body
 * Association Map (all five seed migrations), the real store writes the
 * findings, and the coach's real reads build what she would see. Only the
 * database is a stand-in, and it caps an unbounded read at a thousand rows
 * the way production does.
 *
 *   A new completion        B low answer          C Sometimes, no support
 *   D Sometimes, supported  E retake improves     F retake worsens
 *   G two sources           H is in questionnaire-backfill.test.ts
 *   I member privacy        J survey integrity
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cross-system-relationships/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-relationships/data')>();
  const fixture = await import('./questionnaire-root-fixture');
  return {
    ...actual,
    listRelationships: async () => ({ ok: true, summaries: fixture.REAL_SUMMARIES }),
  };
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
vi.mock('@/lib/cross-system-complaints/lexiconData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cross-system-complaints/lexiconData')>();
  const lexicon = await import('./cross-system-complaint-fixture');
  return {
    ...actual,
    loadComplaintLexicon: async () => ({
      ...lexicon.shippedLexicon(),
      surfaces: new Map([
        [
          'daily_checkin_notes',
          {
            surfaceKey: 'daily_checkin_notes',
            position: 1,
            displayName: 'Daily check-in notes',
            defaultAuthorRole: 'member' as const,
          },
        ],
      ]),
    }),
  };
});

import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ingestSitting } from '@/lib/cross-system-signals/service';
import { runQuestionnaireLookup } from '@/lib/cross-system-root/questionnaireEngine';
import { readRootNoticed } from '@/lib/cross-system-root/noticedRead';
import { readCoachSignalsView } from '@/lib/cross-system-signals/coachRead';
import { ingestComplaint } from '@/lib/cross-system-complaints/service';
import { buildResults } from '@/lib/body-systems/scoring';
import { buildMemberResultsView } from '@/lib/body-systems/memberView';
import type { CoachSignalsView, SignalGroupRow } from '@/lib/cross-system-signals/coachView';
import type { FullRootNoticedView } from '@/lib/cross-system-root/noticedView';
import { RootNoticedPanel } from '@/app/coach/clients/[id]/RootNoticedPanel';
import {
  BANDS,
  QUESTIONS,
  RED_FLAGS,
  SCALE,
  SECTIONS,
} from './body-systems-fixture';
import {
  FakeDb,
  MEMBER_ID,
  SURVEY_TRIGGERS,
  answers,
  sittingRow,
} from './questionnaire-root-fixture';

const SURVEY_LABEL = 'Rooted Reset Body Systems Survey';
const NOW = '2026-09-17T18:00:00.000Z';

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
});

/** Exactly what the survey's submit does after her result is built. */
async function complete(
  id: string,
  sheet: Record<string, string>,
  completedAt: string,
  options: { branch?: 'a' | 'b'; redFlags?: Record<string, boolean> } = {}
) {
  db.rows('member_body_systems_sessions').push(
    sittingRow({ id, answers: sheet, completedAt, ...options })
  );
  const filed = await ingestSitting({
    memberId: MEMBER_ID,
    sourceKey: 'body_systems_survey',
    sittingId: id,
    client: db.asClient(),
  });
  const lookup = await runQuestionnaireLookup({
    memberId: MEMBER_ID,
    sittingId: id,
    trigger: 'sitting_ingested',
    client: db.asClient(),
    now: NOW,
  });
  return { filed, lookup };
}

/** What the coach sees when she opens this client, on a given day of hers. */
async function coachOpens(today: string): Promise<{ noticed: FullRootNoticedView; signals: CoachSignalsView }> {
  const [noticed, signals] = await Promise.all([
    readRootNoticed(db.asClient(), MEMBER_ID, { today }),
    readCoachSignalsView(db.asClient(), MEMBER_ID, { today }),
  ]);
  return { noticed, signals };
}

function signalRows(view: CoachSignalsView, slug: string): SignalGroupRow[] {
  return view.groups.flatMap((group) => group.rows).filter((row) => row.signalSlug === slug);
}

function storedSignals(slug: string) {
  return db.rows('cross_system_signals').filter((row) => row.signal_slug === slug);
}

function traceRow(noticed: FullRootNoticedView, questionRef: string) {
  return noticed.questionnaire!.trace.flatMap((section) => section.rows).find(
    (row) => row.questionRef === questionRef
  )!;
}

function percentOf(sheet: Record<string, string>, sectionKey: string, branch: 'a' | 'b' = 'b'): number {
  return buildResults({ sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS, answers: sheet, branch })
    .sections.find((section) => section.sectionKey === sectionKey)!.percent;
}

describe('A. a new completion: headaches Often', () => {
  it('files a current headache signal with the survey as its source, and Root Noticed uses it', async () => {
    const { lookup } = await complete('sitting-a', answers({ N4: 'often' }), '2026-09-17T14:00:00.000Z');

    const rows = storedSignals('headaches');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source_key: 'body_systems_survey',
      source_label: SURVEY_LABEL,
      source_question_ref: 'N4',
      source_question_prompt: 'I get headaches.',
      value_label: 'Often',
      value_kind: 'scale',
      captured_on: '2026-09-17',
    });

    const { noticed, signals } = await coachOpens('2026-09-17');
    const [headache] = signalRows(signals, 'headaches');
    expect(headache!.stateLabel).toBe('Current');
    expect(headache!.latest.sourceLabel).toContain('Body Systems Survey');
    expect(headache!.supportLine).toBe(`Currently supported by: ${SURVEY_LABEL}.`);

    expect(lookup.skipped).toBeNull();
    expect(lookup.activeSignals).toBe(1);
    const block = noticed.questionnaire!;
    expect(block.supportsLine).toBe(`${SURVEY_LABEL} currently supports: Headaches.`);
    const card = block.findings.find((finding) => finding.patternKey === 'starter-headaches');
    expect(card, 'the headaches map entry is reached').toBeDefined();
    expect(card!.origin).toBe('questionnaire');
    expect(card!.areas.length).toBeGreaterThan(0);
    expect(noticed.findingCount).toBe(block.findings.length);
  });

  it('stores the finding under the sitting, with the exact trigger row, the rule revision and a digest', async () => {
    await complete('sitting-a', answers({ N4: 'often' }), '2026-09-17T14:00:00.000Z');
    const headacheRow = storedSignals('headaches')[0]!;
    const finding = db
      .rows('cross_system_root_findings')
      .find((row) => row.relationship_id === 'rel-starter-headaches')!;
    expect(finding).toMatchObject({
      member_id: MEMBER_ID,
      report_id: null,
      source_key: 'body_systems_survey',
      source_session_id: 'sitting-a',
      triggered_by: 'sitting_ingested',
      rule_revision: 'body-systems-signal-rule-1',
      noticed_on: '2026-09-17',
    });
    expect(finding.evidence_digest).toMatch(/^[0-9a-f]{16}$/);
    const triggers = db.rows('cross_system_root_finding_triggers').filter((row) => row.finding_id === finding.id);
    expect(triggers.map((row) => row.signal_id)).toEqual([headacheRow.id]);
  });

  it('the trace follows the answer all the way to the finding', async () => {
    await complete('sitting-a', answers({ N4: 'often' }), '2026-09-17T14:00:00.000Z');
    const { noticed } = await coachOpens('2026-09-17');
    const row = traceRow(noticed, 'N4');
    expect(row).toMatchObject({
      prompt: 'I get headaches.',
      answerLabel: 'Often',
      signalName: 'Headaches',
      decision: 'Active: answered Often or Almost always.',
      active: true,
      stateLabel: 'Current',
    });
    expect(row.ledTo).toContain('Led Root to:');
    expect(row.ledTo).toContain('Headache signals');
  });
});

describe('B. a low answer: headaches Never', () => {
  it('files no headache signal and triggers nothing', async () => {
    const { lookup } = await complete('sitting-b', answers({}), '2026-09-17T14:00:00.000Z');
    expect(storedSignals('headaches')).toHaveLength(0);
    expect(lookup.activeSignals).toBe(0);
    expect(db.rows('cross_system_root_findings')).toHaveLength(0);

    const { noticed, signals } = await coachOpens('2026-09-17');
    expect(signalRows(signals, 'headaches')).toHaveLength(0);
    expect(noticed.questionnaire!.findings).toHaveLength(0);
    expect(noticed.questionnaire!.supportsLine).toBeNull();
    expect(traceRow(noticed, 'N4').decision).toBe('Not active: answered Rarely or Never.');
    expect(traceRow(noticed, 'N4').ledTo).toBe('Led to no Root finding.');
  });

  it('Rarely is treated exactly like Never', async () => {
    await complete('sitting-b', answers({ N4: 'rarely' }), '2026-09-17T14:00:00.000Z');
    expect(storedSignals('headaches')).toHaveLength(0);
  });
});

describe('C. Sometimes with no support', () => {
  it('does not make headaches active, file a row, or reach the map', async () => {
    const sheet = answers({ N4: 'sometimes' });
    expect(percentOf(sheet, 'brain')).toBeLessThan(50);
    const { lookup } = await complete('sitting-c', sheet, '2026-09-17T14:00:00.000Z');
    expect(storedSignals('headaches')).toHaveLength(0);
    expect(lookup.activeSignals).toBe(0);

    const { noticed } = await coachOpens('2026-09-17');
    expect(traceRow(noticed, 'N4')).toMatchObject({
      answerLabel: 'Sometimes',
      decision: 'Not active: answered Sometimes, with nothing supporting it.',
      active: false,
      stateLabel: 'Not reported',
    });
  });

  it('does not flood Root: every question answered Sometimes produces no active signal at all', async () => {
    const everySometimes = Object.fromEntries(Object.keys(answers({})).map((ref) => [ref, 'sometimes']));
    // Every section lands in the survey's own loudest band, which is exactly
    // why that band is NOT the rule's definition of strongly elevated.
    for (const section of SECTIONS) {
      expect(percentOf(everySometimes, section.sectionKey)).toBeGreaterThanOrEqual(35);
      expect(percentOf(everySometimes, section.sectionKey)).toBeLessThan(50);
    }
    const { lookup } = await complete('sitting-flood', everySometimes, '2026-09-17T14:00:00.000Z');
    expect(lookup.activeSignals).toBe(0);
    expect(db.rows('cross_system_signals').filter((row) => row.value_kind === 'scale')).toHaveLength(0);
    expect(db.rows('cross_system_root_findings')).toHaveLength(0);
  });
});

describe('D. Sometimes with a support condition', () => {
  it('becomes active when its own section is strongly elevated', async () => {
    const sheet = answers({
      N1: 'often', N2: 'often', N3: 'often', N5: 'often', N6: 'often', N7: 'often', N8: 'often',
      N4: 'sometimes',
    });
    expect(percentOf(sheet, 'brain')).toBeGreaterThanOrEqual(50);
    const { lookup } = await complete('sitting-d1', sheet, '2026-09-17T14:00:00.000Z');
    expect(storedSignals('headaches')).toHaveLength(1);
    expect(lookup.activeSignals).toBeGreaterThan(0);

    const { noticed } = await coachOpens('2026-09-17');
    expect(traceRow(noticed, 'N4').decision).toBe(
      'Active: answered Sometimes, and its survey section is strongly elevated on this sitting.'
    );
    expect(noticed.questionnaire!.supportsLine).toContain('Headaches');
  });

  it('becomes active when another source reported the same signal within 30 days', async () => {
    await ingestComplaint({
      memberId: MEMBER_ID,
      surfaceKey: 'daily_checkin_notes',
      rawText: 'My headaches have been bad this week',
      sourceRecordId: '00000000-0000-4000-8000-0000000c0001',
      fieldRef: 'notes',
      reportedAt: '2026-09-10T15:00:00.000Z',
      client: db.asClient(),
      now: '2026-09-10T15:00:00.000Z',
    });
    await complete('sitting-d2', answers({ N4: 'sometimes' }), '2026-09-17T14:00:00.000Z');
    const survey = storedSignals('headaches').filter((row) => row.source_key === 'body_systems_survey');
    expect(survey).toHaveLength(1);

    const { noticed } = await coachOpens('2026-09-17');
    expect(traceRow(noticed, 'N4').decision).toBe(
      'Active: answered Sometimes, and Reported by the member also reported it within 30 days.'
    );
  });

  it('does not borrow support from a report more than 30 days away', async () => {
    // Filed, because she has reported headaches before and a quieter answer
    // is how a signal settles. Filed as NOT active: 47 days is outside the
    // window, so nothing supports this Sometimes.
    await ingestComplaint({
      memberId: MEMBER_ID,
      surfaceKey: 'daily_checkin_notes',
      rawText: 'My headaches have been bad this week',
      sourceRecordId: '00000000-0000-4000-8000-0000000c0002',
      fieldRef: 'notes',
      reportedAt: '2026-08-01T15:00:00.000Z',
      client: db.asClient(),
      now: '2026-08-01T15:00:00.000Z',
    });
    const { lookup } = await complete('sitting-d3', answers({ N4: 'sometimes' }), '2026-09-17T14:00:00.000Z');
    expect(lookup.activeSignals).toBe(0);
    const { noticed } = await coachOpens('2026-09-17');
    expect(traceRow(noticed, 'N4')).toMatchObject({
      decision: 'Not active: answered Sometimes, with nothing supporting it.',
      active: false,
    });
    expect(noticed.questionnaire!.supportsLine).toBeNull();
  });

  it('becomes active when a coach approved survey association fired around it', async () => {
    // Found from the SHIPPED library rather than chosen by hand: a question
    // condition whose other questions, answered Often, fire it while this
    // question's own section stays under the section threshold.
    let chosen: { sheet: Record<string, string>; ref: string } | null = null;
    for (const row of SURVEY_TRIGGERS) {
      const trigger = row.trigger;
      if (row.branch === 'a') continue;
      if (trigger.type !== 'cluster' && trigger.type !== 'min_elevated') continue;
      for (const ref of trigger.questions) {
        const others = trigger.questions.filter((other) => other !== ref).slice(0, trigger.min);
        if (others.length < trigger.min) continue;
        const sheet = answers({ ...Object.fromEntries(others.map((other) => [other, 'often'])), [ref]: 'sometimes' });
        const question = QUESTIONS.find((entry) => entry.questionRef === ref);
        if (!question || question.branch === 'a') continue;
        if (percentOf(sheet, question.sectionKey) >= 50) continue;
        chosen = { sheet, ref };
        break;
      }
      if (chosen) break;
    }
    expect(chosen, 'the shipped library has a cluster this case can use').not.toBeNull();

    await complete('sitting-d4', chosen!.sheet, '2026-09-17T14:00:00.000Z');
    const { noticed } = await coachOpens('2026-09-17');
    const row = traceRow(noticed, chosen!.ref);
    expect(row.active).toBe(true);
    expect(row.decision).toMatch(/^Active: answered Sometimes, and a related Body Systems association fired/);
  });
});

describe('E. a retake that improves', () => {
  it('Often then Never: the survey headache is no longer current, and the history stays', async () => {
    await complete('sitting-e1', answers({ N4: 'often' }), '2026-09-01T14:00:00.000Z');
    const firstFindings = db.rows('cross_system_root_findings').length;
    expect(firstFindings).toBeGreaterThan(0);

    await complete('sitting-e2', answers({ N4: 'never' }), '2026-09-17T14:00:00.000Z');

    // Both answers are on her timeline. Nothing was deleted or rewritten.
    const rows = storedSignals('headaches');
    expect(rows.map((row) => row.value_label).sort()).toEqual(['Never', 'Often']);
    expect(
      db.rows('cross_system_root_findings').filter((row) => row.source_session_id === 'sitting-e1')
    ).toHaveLength(firstFindings);

    const { noticed, signals } = await coachOpens('2026-09-17');
    const [headache] = signalRows(signals, 'headaches');
    expect(headache!.stateLabel).toBe('Reported before, not current');
    expect(headache!.supportLine).toBeNull();
    expect(headache!.latest.valueLabel).toBe('Never');
    expect(headache!.history[0]!.ruleLine).toBe(
      'Not current: a newer Body Systems Survey has replaced this answer.'
    );

    const block = noticed.questionnaire!;
    expect(block.sittingId).toBe('sitting-e2');
    expect(block.supportsLine).toBeNull();
    expect(block.findings.some((finding) => finding.patternKey === 'starter-headaches')).toBe(false);
  });

  it('Almost always then Sometimes with no support: reflected as no longer current', async () => {
    await complete('sitting-e3', answers({ N4: 'almost_always' }), '2026-09-01T14:00:00.000Z');
    await complete('sitting-e4', answers({ N4: 'sometimes' }), '2026-09-17T14:00:00.000Z');
    const { signals } = await coachOpens('2026-09-17');
    const [headache] = signalRows(signals, 'headaches');
    expect(headache!.latest.valueLabel).toBe('Sometimes');
    expect(headache!.stateLabel).toBe('Reported before, not current');
    expect(headache!.latest.ruleLine).toBe('Not active: answered Sometimes, with nothing supporting it.');
  });

  it('an answer the newer sitting did not ask is superseded too, rather than left current', async () => {
    // Branch b asks HB7; branch a does not.
    await complete('sitting-e5', answers({ HB7: 'often' }, 'b'), '2026-09-01T14:00:00.000Z', { branch: 'b' });
    await complete('sitting-e6', answers({}, 'a'), '2026-09-17T14:00:00.000Z', { branch: 'a' });
    const { signals } = await coachOpens('2026-09-17');
    const [sleep] = signalRows(signals, 'lighter-or-broken-sleep');
    expect(sleep!.stateLabel).toBe('Reported before, not current');
    expect(sleep!.supportLine).toBeNull();
  });
});

describe('F. a retake that worsens', () => {
  it('Rarely then Almost always: headaches becomes current', async () => {
    await complete('sitting-f1', answers({ N4: 'rarely' }), '2026-09-01T14:00:00.000Z');
    expect(storedSignals('headaches')).toHaveLength(0);
    await complete('sitting-f2', answers({ N4: 'almost_always' }), '2026-09-17T14:00:00.000Z');

    const { noticed, signals } = await coachOpens('2026-09-17');
    const [headache] = signalRows(signals, 'headaches');
    expect(headache!.stateLabel).toBe('Current');
    expect(headache!.latest.valueLabel).toBe('Almost always');
    expect(noticed.questionnaire!.findings.some((finding) => finding.patternKey === 'starter-headaches')).toBe(true);
  });
});

describe('G. two sources on one signal', () => {
  it('one coherent headache signal, both sources preserved and both named as current support', async () => {
    await complete('sitting-g', answers({ N4: 'often' }), '2026-09-15T14:00:00.000Z');
    const heard = await ingestComplaint({
      memberId: MEMBER_ID,
      surfaceKey: 'daily_checkin_notes',
      rawText: 'My headaches have been bad this week',
      sourceRecordId: '00000000-0000-4000-8000-0000000c0003',
      fieldRef: 'notes',
      reportedAt: '2026-09-17T15:00:00.000Z',
      client: db.asClient(),
      now: '2026-09-17T15:00:00.000Z',
    });
    expect(heard.classified).toBeGreaterThan(0);

    const { noticed, signals } = await coachOpens('2026-09-17');

    // ONE signal row, not two.
    const rows = signalRows(signals, 'headaches');
    expect(rows).toHaveLength(1);
    const labels = [rows[0]!.latest.sourceLabel, ...rows[0]!.history.map((entry) => entry.sourceLabel)];
    expect(labels).toContain(SURVEY_LABEL);
    expect(labels).toContain('Reported by the member');
    expect(rows[0]!.supportLine).toContain(SURVEY_LABEL);
    expect(rows[0]!.supportLine).toContain('Reported by the member');

    // ONE card for the headaches entry: the complaint's, saying the survey
    // supports it too, and no second survey card beside it.
    const complaintCards = noticed.findings.filter((finding) => finding.patternKey === 'starter-headaches');
    expect(complaintCards).toHaveLength(1);
    expect(complaintCards[0]!.alsoSupportedBy).toBe(`Also currently supported by: ${SURVEY_LABEL}.`);
    expect(noticed.questionnaire!.findings.some((finding) => finding.patternKey === 'starter-headaches')).toBe(false);
    expect(noticed.questionnaire!.mergedCount).toBeGreaterThan(0);
  });
});

describe('red flags keep their priority', () => {
  it('a sitting that fired a red flag withholds every survey finding behind one safety prompt', async () => {
    const flags = Object.fromEntries(RED_FLAGS.map((flag, index) => [flag.flagKey, index === 0]));
    await complete('sitting-flag', answers({ N4: 'often', D1: 'often' }), '2026-09-17T14:00:00.000Z', { redFlags: flags });
    const { noticed } = await coachOpens('2026-09-17');
    const block = noticed.questionnaire!;
    expect(block.suppressed).toBe(true);
    expect(block.suppressedHeading).toBe('A safety response needs attention first');
    expect(block.findings).toHaveLength(0);
    expect(block.trace.flatMap((section) => section.rows).every((row) => !row.ledTo.startsWith('Led Root to'))).toBe(true);
    expect(noticed.suppressedCount).toBe(1);
    // Stored with no areas and no triggers, so nothing is in the database to leak.
    const stored = db.rows('cross_system_root_findings');
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((row) => row.is_safety_withheld === true)).toBe(true);
    expect(db.rows('cross_system_root_finding_areas')).toHaveLength(0);
    expect(db.rows('cross_system_root_finding_triggers')).toHaveLength(0);
  });
});

describe('I. member privacy', () => {
  const ROOT = path.resolve(__dirname, '..');
  const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

  it('the survey submit hands her the same results view, and nothing Root produced', () => {
    const action = read('app/actions/bodySystems.ts');
    const submit = action.slice(action.indexOf('export async function submitBodySystemsSurveyAction'));
    const body = submit.slice(0, submit.indexOf('\nexport async function'));
    // The lookup is awaited for its side effect and its outcome is never
    // bound, so it cannot be returned to her.
    expect(body).toMatch(/\n {2}await runQuestionnaireLookup\(\{/);
    expect(body).not.toMatch(/=\s*await runQuestionnaireLookup/);
    // Every returned object literal, braces balanced, so one statement
    // never swallows the code between it and the next.
    const returns: string[] = [];
    for (const match of body.matchAll(/return \{/g)) {
      let depth = 0;
      let end = match.index! + 'return '.length;
      for (; end < body.length; end += 1) {
        if (body[end] === '{') depth += 1;
        if (body[end] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      returns.push(body.slice(match.index!, end + 1));
    }
    expect(returns.length).toBeGreaterThan(0);
    for (const statement of returns) {
      expect(statement).not.toMatch(/questionnaire|finding|signal|lookup/i);
    }
  });

  it('a rendered survey card carries no percentage and no score', async () => {
    await complete('sitting-i', answers({ N4: 'often', D1: 'almost_always', A1: 'often', D2: 'often' }), '2026-09-17T14:00:00.000Z');
    const { noticed } = await coachOpens('2026-09-17');
    expect(noticed.questionnaire!.findings.length).toBeGreaterThan(0);
    // The briefing sits on top and the survey cards are behind "All
    // evidence Root checked", so both renders are held to the same rule:
    // the one a coach sees first, and the evidence itself.
    const briefingHtml = renderToStaticMarkup(
      createElement(RootNoticedPanel, { state: { allowed: true, view: noticed } })
    );
    expect(noticed.briefing!.cards.length).toBeGreaterThan(0);
    expect(briefingHtml).not.toContain('%');
    expect(briefingHtml).not.toMatch(/\d+\s*percent/i);
    expect(briefingHtml).not.toContain('—');
    const html = renderToStaticMarkup(
      createElement(RootNoticedPanel, { state: { allowed: true, view: { ...noticed, briefing: null } } })
    );
    expect(html).toContain('currently supports: ');
    expect(html).not.toContain('%');
    expect(html).not.toMatch(/\d+\s*percent/i);
    expect(JSON.stringify(noticed)).not.toMatch(/\d+\s*percent/i);
    expect(html).not.toContain('—');
  });
});

describe('J. survey integrity', () => {
  it('filing and reading a sitting never changes the sitting, its answers or its stored results', async () => {
    const sheet = answers({ N4: 'often', D1: 'almost_always', K2: 'sometimes' });
    const before = sittingRow({ id: 'sitting-j', answers: sheet, completedAt: '2026-09-17T14:00:00.000Z' });
    await complete('sitting-j', sheet, '2026-09-17T14:00:00.000Z');
    await coachOpens('2026-09-17');
    await runQuestionnaireLookup({ memberId: MEMBER_ID, trigger: 'backfill', client: db.asClient(), now: NOW });
    expect(db.rows('member_body_systems_sessions')).toEqual([before]);
  });

  it('the member results view built from the stored reading is unchanged by any of it', async () => {
    const sheet = answers({ N4: 'often', D1: 'almost_always' });
    const results = buildResults({ sections: SECTIONS, questions: QUESTIONS, scale: SCALE, bands: BANDS, answers: sheet, branch: 'b' });
    const view = () =>
      buildMemberResultsView({ sections: SECTIONS, bands: BANDS, results, previousResults: null, minDeltaPercent: 1 });
    const beforeView = JSON.stringify(view());
    await complete('sitting-j2', sheet, '2026-09-17T14:00:00.000Z');
    expect(JSON.stringify(view())).toBe(beforeView);
    const stored = db.rows('member_body_systems_sessions')[0]!;
    expect(stored.results).toEqual(results);
  });

  it('no new module writes to a survey table', () => {
    const ROOT = path.resolve(__dirname, '..');
    for (const file of [
      'lib/cross-system-signals/questionnaireRules.ts',
      'lib/cross-system-signals/questionnaireState.ts',
      'lib/cross-system-signals/questionnaireFacts.ts',
      'lib/cross-system-root/questionnaireEngine.ts',
      'lib/cross-system-root/questionnaireBackfill.ts',
      'lib/cross-system-root/noticedRead.ts',
      'lib/cross-system-root/noticedView.ts',
      'lib/body-systems/triggerEvaluation.ts',
    ]) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const match of source.matchAll(/\.from\('(member_body_systems_sessions|body_systems_[a-z_]+)'\)([\s\S]{0,200})/g)) {
        expect(match[2], `${file} touches ${match[1]}`).not.toMatch(/^\s*\.(insert|upsert|update|delete)\(/);
      }
    }
  });
});
