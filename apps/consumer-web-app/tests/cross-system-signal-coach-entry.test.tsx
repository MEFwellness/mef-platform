// @vitest-environment jsdom

/**
 * THE COACH'S SIDE: the entry tool, and the list it lands in.
 *
 * What is worth proving about a tool built to be used mid conversation:
 *
 *   1. THE SERVER DECIDES, NOT THE FORM. Every field the client posts is
 *      re-resolved from the library, so a hand built request cannot choose
 *      its own category, invent a frequency the scale does not hold or
 *      send a signal name nobody has reviewed.
 *   2. THE TAP FLOW COMPOSES A REAL NAME. Hip plus Clicking is "Hip
 *      clicking", the grammar comes from the stored phrase rather than a
 *      lowercased label, and a name the library already holds is reused
 *      rather than redefined.
 *   3. NOTHING IS REQUIRED THAT SHOULD NOT BE. No free text is ever
 *      needed, and a note is one line or nothing.
 *   4. THE LIST GROUPS, KEEPS THE TIMELINE AND ALWAYS NAMES THE SOURCE.
 *      Two sides of one signal stay two rows, the latest value is the
 *      latest, the older ones are still there, and every single row says
 *      where its value came from.
 *   5. THE RENDERED CARD SHOWS ALL OF THAT, and says nothing about a
 *      correlation, because there is no correlation in this prompt.
 */

import { describe, it, expect, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

// The entry tool is a client component and asks for the router so it can
// refresh the page after a save. Nothing below exercises that refresh, and
// a static render has no app router mounted.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
import { resolveCoachSignal, normalizeNote } from '@/lib/cross-system-signals/entry';
import { composeSignalName, searchSignalNames, slugify } from '@/lib/cross-system-signals/library';
import { buildCoachSignalsView, sideLabelOf } from '@/lib/cross-system-signals/coachView';
import { signalsDigest } from '@/lib/coach-detail/digests';
import { COACH_FREQUENCY_OPTIONS, COACH_NOTE_MAX_LENGTH } from '@/lib/cross-system-signals/constants';
import { CrossSystemSignalsPanel } from '@/app/coach/clients/[id]/CrossSystemSignalsPanel';
import type { SignalRecord } from '@/lib/cross-system-signals/types';
import {
  TEST_BODY_AREAS,
  TEST_CATEGORIES,
  TEST_LIBRARY,
  TEST_NAMES,
  TEST_SYMPTOMS,
} from './cross-system-signal-library-fixture';

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------
// 1 and 2. What the server accepts
// ---------------------------------------------------------------------

describe('the coach entry tool resolves everything on the server', () => {
  it('accepts a standardized name the coach chose, and takes its category from the library', () => {
    const result = resolveCoachSignal(
      { signalSlug: 'frequent-urination', side: 'not_applicable', frequencyKey: 'often' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signal.signalName).toBe('Frequent urination');
    expect(result.signal.categoryKey).toBe('kidney_bladder');
    expect(result.signal.valueLabel).toBe('Often');
    expect(result.signal.valueNumeric).toBe(6);
    expect(result.signal.isNewName).toBe(false);
  });

  it('composes a name from an area tap and a symptom tap', () => {
    const result = resolveCoachSignal(
      { bodyAreaKey: 'hip', symptomKey: 'clicking', side: 'right', frequencyKey: 'often' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signal.signalSlug).toBe('hip-clicking');
    expect(result.signal.signalName).toBe('Hip clicking');
    expect(result.signal.side).toBe('right');
    // Already in the library, so it is reused rather than redefined.
    expect(result.signal.isNewName).toBe(false);
    expect(result.signal.categoryKey).toBe('joint_movement');
  });

  it('flags a composed name the library has never held, so it can be added once', () => {
    const result = resolveCoachSignal(
      { bodyAreaKey: 'low_back', symptomKey: 'tightness', side: 'both', frequencyKey: 'sometimes' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signal.signalSlug).toBe('low-back-tightness');
    expect(result.signal.signalName).toBe('Low back tightness');
    expect(result.signal.isNewName).toBe(true);
    expect(result.signal.categoryKey).toBe('musculoskeletal');
  });

  it('uses the stored phrase rather than a lowercased label, so the grammar holds', () => {
    const area = TEST_LIBRARY.bodyAreas.get('hip')!;
    const symptom = TEST_LIBRARY.symptoms.get('reduced_range')!;
    expect(composeSignalName(area, symptom).displayName).toBe('Hip reduced range');
    expect(slugify('Hip reduced range')).toBe('hip-reduced-range');
  });

  it('refuses a frequency the scale does not hold', () => {
    const result = resolveCoachSignal(
      { signalSlug: 'frequent-urination', side: 'left', frequencyKey: 'constantly' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('how often');
  });

  it('refuses a side it does not recognise', () => {
    const result = resolveCoachSignal(
      { signalSlug: 'frequent-urination', side: 'dorsal', frequencyKey: 'often' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a signal slug the library does not hold, rather than creating one from it', () => {
    const result = resolveCoachSignal(
      { signalSlug: 'something-nobody-reviewed', side: 'left', frequencyKey: 'often' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('not in the library');
  });

  it('refuses an instrument rollup, which is a real signal and not a thing a coach types', () => {
    const result = resolveCoachSignal(
      { signalSlug: 'breathing-pattern-total', side: 'not_applicable', frequencyKey: 'often' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(false);
  });

  it('refuses a body area the library does not hold', () => {
    const result = resolveCoachSignal(
      { bodyAreaKey: 'tail', symptomKey: 'pain', side: 'left', frequencyKey: 'often' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(false);
  });

  it('refuses an entry with neither a name nor a symptom', () => {
    const result = resolveCoachSignal(
      { bodyAreaKey: 'hip', side: 'right', frequencyKey: 'often' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Choose a signal');
  });
});

describe('nothing is required that should not be', () => {
  it('saves with no note at all', () => {
    const result = resolveCoachSignal(
      { signalSlug: 'frequent-urination', side: 'not_applicable', frequencyKey: 'rarely' },
      TEST_LIBRARY
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signal.note).toBeNull();
  });

  it('treats a blank or whitespace note as no note', () => {
    expect(normalizeNote('')).toBeNull();
    expect(normalizeNote('   \n  ')).toBeNull();
    expect(normalizeNote(undefined)).toBeNull();
  });

  it('flattens a note to one line and caps it, because this is not Coach Notes', () => {
    expect(normalizeNote('  worse   after\nstairs  ')).toBe('worse after stairs');
    expect(normalizeNote('x'.repeat(500))!.length).toBe(COACH_NOTE_MAX_LENGTH);
  });

  it('offers three frequency words, and they are the survey own middle three', () => {
    expect(COACH_FREQUENCY_OPTIONS.map((option) => option.label)).toEqual([
      'Rarely',
      'Sometimes',
      'Often',
    ]);
  });
});

describe('the search field over standardized names', () => {
  it('matches partially and case insensitively on the name', () => {
    expect(searchSignalNames(TEST_NAMES, 'FREQ').map((n) => n.signalSlug)).toContain(
      'frequent-urination'
    );
  });

  it('matches on the stored search terms too, so a coach word finds a clinical one', () => {
    expect(searchSignalNames(TEST_NAMES, 'bloat').map((n) => n.signalSlug)).toContain(
      'bloating-after-eating'
    );
  });

  it('never offers an instrument rollup', () => {
    expect(searchSignalNames(TEST_NAMES, 'signal').map((n) => n.signalSlug)).not.toContain(
      'bss-system-digestion'
    );
  });

  it('offers nothing for an empty query, because a list of everything is not an answer', () => {
    expect(searchSignalNames(TEST_NAMES, '')).toEqual([]);
    expect(searchSignalNames(TEST_NAMES, '   ')).toEqual([]);
  });

  it('puts a title match above a match that only hit a hidden search term', () => {
    const hits = searchSignalNames(TEST_NAMES, 'hip');
    expect(hits[0]!.displayName).toBe('Hip clicking');
  });
});

// ---------------------------------------------------------------------
// 4. The list
// ---------------------------------------------------------------------

function record(over: Partial<SignalRecord> & Pick<SignalRecord, 'id'>): SignalRecord {
  return {
    memberId: 'member-1',
    signalSlug: 'frequent-urination',
    signalName: 'Frequent urination',
    categoryKey: 'kidney_bladder',
    bodyAreaKey: null,
    symptomKey: null,
    side: null,
    valueKind: 'scale',
    valueLabel: 'Often',
    valueKey: 'often',
    valueNumeric: 6,
    sourceKey: 'body_systems_survey',
    sourceLabel: 'Rooted Reset Body Systems Survey',
    sourceSessionId: 'sit-1',
    sourceQuestionRef: 'K2',
    sourceQuestionPrompt: 'I urinate more often than feels normal.',
    sourceRecordId: null,
    capturedOn: '2026-09-01',
    capturedAt: '2026-09-01T10:00:00.000Z',
    note: null,
    enteredBy: null,
    entryMode: 'ingested',
    ingestFingerprint: null,
  complaintSurfaceKey: null,
  complaintSurfaceLabel: null,
    ...over,
  };
}

const RECORDS: SignalRecord[] = [
  record({ id: 'r1', capturedOn: '2026-09-01', valueLabel: 'Often' }),
  record({
    id: 'r2',
    capturedOn: '2026-09-14',
    capturedAt: '2026-09-14T10:00:00.000Z',
    valueLabel: 'Sometimes',
    valueKey: 'sometimes',
  }),
  record({
    id: 'r3',
    signalSlug: 'hip-clicking',
    signalName: 'Hip clicking',
    categoryKey: 'joint_movement',
    bodyAreaKey: 'hip',
    symptomKey: 'clicking',
    side: 'right',
    valueKind: 'coach_tap',
    valueLabel: 'Often',
    sourceKey: 'coach_entered',
    sourceLabel: 'Coach entered',
    sourceSessionId: null,
    sourceQuestionRef: null,
    sourceQuestionPrompt: null,
    capturedOn: '2026-09-15',
    capturedAt: '2026-09-15T16:00:00.000Z',
    note: 'Said it clicks going up stairs.',
    enteredBy: 'coach-1',
    entryMode: 'coach_entered',
    ingestFingerprint: null,
  }),
  record({
    id: 'r4',
    signalSlug: 'hip-clicking',
    signalName: 'Hip clicking',
    categoryKey: 'joint_movement',
    bodyAreaKey: 'hip',
    symptomKey: 'clicking',
    side: 'left',
    valueKind: 'coach_tap',
    valueLabel: 'Rarely',
    sourceKey: 'coach_entered',
    sourceLabel: 'Coach entered',
    sourceSessionId: null,
    sourceQuestionRef: null,
    sourceQuestionPrompt: null,
    capturedOn: '2026-09-15',
    capturedAt: '2026-09-15T16:01:00.000Z',
    entryMode: 'coach_entered',
    ingestFingerprint: null,
  }),
];

const VIEW = buildCoachSignalsView(RECORDS, TEST_LIBRARY);

describe('the coach signal list', () => {
  it('groups by category, in the library own order', () => {
    expect(VIEW.groups.map((group) => group.categoryLabel)).toEqual([
      'Joint/Movement',
      'Kidney/Bladder',
    ]);
  });

  it('counts three distinct signals behind four entries', () => {
    expect(VIEW.signalCount).toBe(3);
    expect(VIEW.entryCount).toBe(4);
    expect(VIEW.latestCapturedOn).toBe('2026-09-15');
  });

  it('shows the latest value and keeps the older ones as a timeline', () => {
    const kidney = VIEW.groups.find((group) => group.categoryKey === 'kidney_bladder')!;
    const row = kidney.rows[0]!;
    expect(row.latest.valueLabel).toBe('Sometimes');
    expect(row.latest.capturedOn).toBe('2026-09-14');
    expect(row.history).toHaveLength(1);
    expect(row.history[0]!.valueLabel).toBe('Often');
    expect(row.history[0]!.capturedOn).toBe('2026-09-01');
  });

  it('keeps a left and a right of one signal as two rows a coach treats separately', () => {
    const joints = VIEW.groups.find((group) => group.categoryKey === 'joint_movement')!;
    expect(joints.rows).toHaveLength(2);
    expect(joints.rows.map((row) => row.sideLabel).sort()).toEqual(['Left', 'Right']);
  });

  it('names a source on the latest value and on every older one', () => {
    for (const group of VIEW.groups) {
      for (const row of group.rows) {
        expect(row.latest.sourceLabel.length).toBeGreaterThan(0);
        for (const entry of row.history) expect(entry.sourceLabel.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the exact original question, so the original answer can always be shown', () => {
    const kidney = VIEW.groups.find((group) => group.categoryKey === 'kidney_bladder')!;
    expect(kidney.rows[0]!.latest.sourceQuestionPrompt).toBe(
      'I urinate more often than feels normal.'
    );
  });

  it('prints no side chip where a side says nothing', () => {
    expect(sideLabelOf(null)).toBeNull();
    expect(sideLabelOf('not_applicable')).toBeNull();
    expect(sideLabelOf('both')).toBe('Both');
  });

  it('is empty rather than wrong when she has nothing yet', () => {
    const empty = buildCoachSignalsView([], TEST_LIBRARY);
    expect(empty.groups).toEqual([]);
    expect(empty.signalCount).toBe(0);
    expect(empty.latestCapturedOn).toBeNull();
  });
});

describe('the folded header counts what the card counts', () => {
  it('reads the two numbers off the view itself', () => {
    const digest = signalsDigest({ signals: VIEW.signalCount, entries: VIEW.entryCount });
    expect(digest.text).toContain('3 signals');
    expect(digest.text).toContain('4 entries');
  });

  it('is grey and honest when there is nothing', () => {
    expect(signalsDigest({ signals: 0, entries: 0 })).toEqual({
      text: 'Nothing recorded yet',
      dot: 'grey',
    });
  });

  /**
   * A signal is a thing her body said, not a thing asking for anything.
   * Colouring a count of symptoms would turn a record into an alarm scale.
   */
  it('is never gold, however many signals there are', () => {
    for (const count of [1, 5, 40, 400]) {
      expect(signalsDigest({ signals: count, entries: count * 3 }).dot).toBe('green');
    }
  });
});

// ---------------------------------------------------------------------
// 5. The rendered card
// ---------------------------------------------------------------------

describe('the rendered Signals card', () => {
  const html = renderToStaticMarkup(
    <CrossSystemSignalsPanel
      state={{
        memberId: 'member-1',
        view: VIEW,
        categories: TEST_CATEGORIES,
        bodyAreas: TEST_BODY_AREAS,
        symptoms: TEST_SYMPTOMS,
        searchableNames: TEST_NAMES.filter((name) => name.isCoachAddable),
      }}
    />
  );

  it('offers Add Signal', () => {
    expect(html).toContain('Add Signal');
  });

  it('prints every category heading, every signal name and every latest value', () => {
    for (const text of [
      'Joint/Movement',
      'Kidney/Bladder',
      'Hip clicking',
      'Frequent urination',
      'Sometimes',
      'Right',
      'Left',
    ]) {
      expect(html, text).toContain(text);
    }
  });

  it('prints the source on the visible row, because a value with no provenance is an assertion', () => {
    expect(html).toContain('Rooted Reset Body Systems Survey');
    expect(html).toContain('Coach entered');
  });

  it('offers the older entries behind a control rather than burying them', () => {
    expect(html).toContain('1 earlier entry');
  });

  it('says nothing about a correlation, a pattern or a relationship, because none exists yet', () => {
    const text = html.toLowerCase();
    for (const banned of ['correlat', 'pattern card', 'because of', 'caused by', 'linked to']) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it('never claims this is one of the two assessments it is not', () => {
    expect(html).not.toContain('Whole-Body Check-In');
    expect(html).not.toContain('Rooted Reset Whole-Body Signal Assessment');
  });

  it('carries no em dash, because a coach reads every word of it', () => {
    expect(html).not.toContain('—');
  });
});

// ---------------------------------------------------------------------
// The structural claims a render cannot make
// ---------------------------------------------------------------------

describe('this whole feature is coach only, structurally', () => {
  function source(relative: string): string {
    return readFileSync(path.join(ROOT, relative), 'utf8');
  }

  it('the two coach actions both establish a coach and both ask the test account rule', () => {
    const actions = source('app/actions/crossSystemSignals.ts');
    for (const fn of ['getClientSignalsPanelAction', 'addCoachSignalAction']) {
      const start = actions.indexOf(`export async function ${fn}(`);
      expect(start, fn).toBeGreaterThan(-1);
      const body = actions.slice(start, actions.indexOf('\nexport ', start + 1));
      expect(body, `${fn} does not check the role`).toContain('isCoachOrAdmin');
      expect(body, `${fn} does not apply the test account rule`).toContain(
        'isMemberVisibleToStaff'
      );
    }
  });

  it('no member route or member component imports anything from this feature', () => {
    // Every file under app/ and components/ that is not under a coach or
    // admin path. Two kinds of file are named below. The five completion
    // points import the ingestion engine rather than the coach surface,
    // because a completion is where a signal is captured. The two coach
    // action files live under app/actions/ by this codebase's convention
    // and establish a coach or an administrator before they read or write
    // anything, which the case above this one proves for the first of them.
    const hits = execSync(
      "grep -rl 'cross-system-signals\\|crossSystemSignals' app components || true",
      { cwd: ROOT, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean);
    expect(hits.length).toBeGreaterThan(0);

    const ALLOWED_MEMBER_SIDE = [
      'app/actions/bodySystems.ts',
      'app/actions/wholeBodySignal.ts',
      'app/actions/breathingCheckIn.ts',
      'app/actions/checkin.ts',
      'app/actions/body-assessment.ts',
      'app/actions/crossSystemSignals.ts',
      // The Relationship Library's own actions (Prompt 2). Coach only, and
      // guarded the same way: tests/cross-system-relationship-editor.test.tsx
      // asserts every exported function in it establishes a coach first.
      'app/actions/crossSystemRelationships.ts',
      // The Relationship Library editor's components. They live under
      // components/ rather than under app/coach/ because three screens
      // share them, and the case below proves nothing outside app/coach
      // and app/admin imports the folder.
      'components/coach-relationships/RelationshipEditor.tsx',
      'components/coach-relationships/RelationshipLibraryPanel.tsx',
      'components/coach-relationships/RelationshipVersionHistory.tsx',
      // The matching engine's own coach read (Prompt 3). Coach only, and
      // guarded the same way: tests/cross-system-pattern-engine.test.tsx
      // asserts it establishes a coach and applies the test account rule
      // before it reads a single row.
      'app/actions/crossSystemPatterns.ts',
      // The Root Noticed coach read. Coach only, and guarded the same way:
      // tests/cross-system-root-schema.test.ts asserts no member surface
      // reaches its copy, and the action establishes a coach and applies
      // the test account rule before it reads a single row.
      'app/actions/crossSystemRootFindings.ts',
      // The Body Systems Survey question to signal mapping editor's action.
      // Coach only, and guarded the same way:
      // tests/questionnaire-signal-mapping.test.ts asserts every exported
      // function establishes a coach or an administrator first.
      'app/actions/crossSystemSignalMappings.ts',
      // Its panel, which lives under components/ beside the Relationship
      // Library's and is imported only by app/coach/signal-mappings, which
      // the same test proves.
      'components/coach-signal-mappings/SurveySignalMappingPanel.tsx',
    ];
    for (const hit of hits) {
      const isCoachSurface = hit.startsWith('app/coach/') || hit.startsWith('app/admin/');
      expect(
        isCoachSurface || ALLOWED_MEMBER_SIDE.includes(hit),
        `${hit} reaches the Signal Library from outside a coach surface`
      ).toBe(true);
    }
  });

  it('nothing outside a coach or admin route imports the relationship editor', () => {
    const importers = execSync(
      "grep -rl 'coach-relationships\\|cross-system-relationships' app components || true",
      { cwd: ROOT, encoding: 'utf8' }
    )
      .split('\n')
      .filter(Boolean);
    expect(importers.length).toBeGreaterThan(0);
    for (const hit of importers) {
      expect(
        hit.startsWith('app/coach/') ||
          hit.startsWith('app/admin/') ||
          hit.startsWith('components/coach-relationships/') ||
          hit === 'app/actions/crossSystemRelationships.ts' ||
          // The matching engine's own coach read (Prompt 3), which is the
          // one place the definitions and a member's signals meet.
          hit === 'app/actions/crossSystemPatterns.ts' ||
          // The Root Noticed coach read, which is the other one: it reads
          // the Whole-Body Association Map against a member's complaint.
          hit === 'app/actions/crossSystemRootFindings.ts' ||
          // The survey mapping editor borrows the Relationship Library's
          // class strings so the two coach tools look like one feature.
          hit === 'components/coach-signal-mappings/SurveySignalMappingPanel.tsx',
        `${hit} reaches the Relationship Library from outside a coach surface`
      ).toBe(true);
    }
  });

  it('the five completion points each ingest exactly one source, and never the coach one', () => {
    const points: [string, string][] = [
      ['app/actions/bodySystems.ts', 'SOURCE_BODY_SYSTEMS'],
      ['app/actions/wholeBodySignal.ts', 'SOURCE_WHOLE_BODY_SIGNAL'],
      ['app/actions/breathingCheckIn.ts', 'SOURCE_BREATHING_CHECK_IN'],
      ['app/actions/checkin.ts', 'SOURCE_DAILY_CHECK_IN'],
      ['app/actions/body-assessment.ts', 'SOURCE_BODY_ASSESSMENT'],
    ];
    for (const [file, constant] of points) {
      const text = source(file);
      expect(text, `${file} does not ingest`).toContain('ingestSitting({');
      expect(text, `${file} ingests the wrong source`).toContain(`sourceKey: ${constant},`);
      expect(text).not.toContain('SOURCE_COACH_ENTERED');
    }
  });

  it('ingestion never writes through a member session, and the coach path never uses the service role', () => {
    const service = source('lib/cross-system-signals/service.ts');
    expect(service).toContain('signalLibraryServiceRoleClient');
    const actions = source('app/actions/crossSystemSignals.ts');
    expect(actions).not.toContain('serviceRole');
  });
});
