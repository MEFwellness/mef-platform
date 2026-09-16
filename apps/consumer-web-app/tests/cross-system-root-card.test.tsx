/**
 * THE RENDERED CARD. What a coach actually sees, checked against the real
 * HTML rather than against the object behind it.
 *
 * WHY THE HTML AND NOT THE VIEW OBJECT. A withheld finding that arrives
 * empty and a withheld finding that is merely not drawn look identical from
 * the object's side. The only way to prove nothing leaks is to render it and
 * search the output character by character, and to prove first that the
 * unwithheld version really does contain those words, so the guard cannot
 * pass by rendering nothing at all.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RootNoticedPanel } from '@/app/coach/clients/[id]/RootNoticedPanel';
import { buildFindingView, interpretationLines } from '@/lib/cross-system-root/view';
import { lookupOne } from '@/lib/cross-system-root/lookup';
import { groupHistories } from '@/lib/cross-system-root/evidence';
import { head, signal, summary, version } from './cross-system-pattern-fixture';
import type { RelationshipComponent } from '@/lib/cross-system-relationships/types';
import type { ComplaintReportRecord } from '@/lib/cross-system-complaints/types';
import type { RootNoticedPanelState } from '@/app/actions/crossSystemRootFindings';

const TODAY = '2026-09-15';

function component(
  role: RelationshipComponent['role'],
  refKind: RelationshipComponent['refKind'],
  refKey: string,
  refLabel: string,
  position: number
): RelationshipComponent {
  return {
    id: `c-${refKey}`,
    position,
    role,
    refKind,
    refKey,
    refLabel,
    side: null,
    valueKey: null,
    valueLabel: null,
    minValueNumeric: null,
    sourceKey: null,
    sourceQuestionRef: null,
    sourceQuestionPrompt: null,
    note: null,
  };
}

const REPORT: ComplaintReportRecord = {
  id: 'report-1',
  memberId: 'member-1',
  surfaceKey: 'daily_checkin_notes',
  surfaceLabel: 'Daily check-in notes',
  rawText: 'My right hip keeps clicking and bothering me.',
  fieldRef: 'optional_notes',
  fieldPrompt: 'Anything else you want to note about today?',
  sourceRecordId: 'checkin-1',
  reportedOn: TODAY,
  reportedAt: `${TODAY}T12:00:00.000Z`,
  authorRole: 'member',
  authoredBy: 'member-1',
  classifierKind: 'deterministic_lexicon',
  classifierRevision: 'deterministic-lexicon-1',
  lookupCompletedAt: null,
  ingestFingerprint: 'complaint::daily_checkin_notes::checkin-1::optional_notes',
  createdAt: `${TODAY}T12:00:01.000Z`,
};

const CLASSIFICATIONS = [
  {
    id: 'cl-1',
    reportId: 'report-1',
    position: 0,
    signalSlug: 'hip-clicking',
    bodyAreaKey: 'hip',
    side: 'right' as const,
    matchedPhrase: 'hip keeps clicking',
    isResolution: false,
    contextKey: null,
    frequencyKey: 'often',
    frequencyLabel: 'Often',
    frequencyNumeric: 6,
    signalId: 'trigger-1',
  },
];

const TRIGGER = signal({
  id: 'trigger-1',
  signalSlug: 'hip-clicking',
  signalName: 'Hip clicking',
  categoryKey: 'joint_movement',
  bodyAreaKey: 'hip',
  side: 'right',
  valueKind: 'scale',
  valueLabel: 'Often',
  valueNumeric: 6,
  sourceKey: 'member_reported',
  sourceLabel: 'Reported by the member',
  capturedOn: TODAY,
  capturedAt: `${TODAY}T12:00:00.000Z`,
  note: 'hip keeps clicking',
});

const URINATION = signal({
  id: 'sig-urination',
  signalSlug: 'frequent-urination',
  signalName: 'Frequent urination',
  categoryKey: 'kidney_bladder',
  bodyAreaKey: null,
  valueKind: 'scale',
  valueLabel: 'Often',
  valueNumeric: 6,
  sourceKey: 'body_systems_survey',
  sourceLabel: 'Body Systems Survey',
  sourceQuestionPrompt: 'I need to urinate more often than feels normal.',
  capturedOn: '2026-09-11',
});

const MAP = () =>
  summary({
    head: head({ id: 'map-1', patternKey: 'starter-hip-pelvis', isActive: true, isSeeded: true }),
    current: version({
      patternName: 'Hip and pelvis signals, whole-body areas worth reviewing',
      surfacesOnComplaint: true,
      sourceTypeKey: 'chek_hlc',
      possibleAssociationText:
        'Hip and pelvic signals are observed alongside kidney and bladder findings in this coaching methodology.',
      considerations: [
        { id: 'con-1', position: 1, body: 'Ask when the hip signal began.' },
        { id: 'con-2', position: 2, body: 'Review the Kidney and Bladder responses.' },
      ],
      components: [
        component('primary', 'body_area', 'hip', 'Hip', 0),
        component('related', 'category', 'kidney_bladder', 'Kidney/Bladder', 1),
        component('related', 'category', 'stress', 'Stress', 2),
      ],
    }),
  });

function findingView(flagged: Set<string> = new Set()) {
  const all = [TRIGGER, URINATION];
  const draft = lookupOne(
    MAP(),
    new Set(['trigger-1']),
    groupHistories(all),
    all,
    TODAY,
    flagged
  );
  return buildFindingView({
    finding: draft,
    report: REPORT,
    classifications: CLASSIFICATIONS,
    nameFor: (slug) => (slug === 'hip-clicking' ? 'Hip clicking' : slug),
    areaFor: (key) => (key === 'hip' ? 'Hip' : key),
  });
}

function panel(flagged: Set<string> = new Set()): string {
  const view = findingView(flagged);
  const state: RootNoticedPanelState = {
    allowed: true,
    view: {
      findings: [view],
      convergences: [],
      findingCount: view.suppressed ? 0 : 1,
      suppressedCount: view.suppressed ? 1 : 0,
      complaintCount: 1,
      unclassifiedCount: 0,
      mapEntryCount: 18,
    },
  };
  return renderToStaticMarkup(<RootNoticedPanel state={state} />);
}

// ---------------------------------------------------------------------
// 27 and 28. Proactive, and traceable.
// ---------------------------------------------------------------------

describe('the coach reads it without asking for it', () => {
  it('27. the finding is surfaced with her own words at the top', () => {
    const html = panel();
    expect(html).toContain('My right hip keeps clicking and bothering me.');
    expect(html).toContain('Presenting complaint');
  });

  it('27b. it says where the complaint came from and when', () => {
    const html = panel();
    expect(html).toContain('Daily check-in notes');
    expect(html).toContain('Sep 15, 2026');
  });

  it('27c. it prints what Root read her words as', () => {
    const html = panel();
    expect(html).toContain('Root read this as');
    expect(html).toContain('Hip clicking');
  });

  it('28. every area names the map entry that sent Root there', () => {
    const view = findingView();
    const kidney = view.areas.find((area) => area.refKey === 'kidney_bladder')!;
    expect(kidney.whyChecked).toContain('Whole-Body Association Map');
    expect(kidney.whyChecked).toContain('Kidney/Bladder');
    expect(kidney.whyChecked).toContain(
      'Hip and pelvis signals, whole-body areas worth reviewing'
    );
  });

  it('28b. every supporting row names its source, its date and its exact question', () => {
    const view = findingView();
    const kidney = view.areas.find((area) => area.refKey === 'kidney_bladder')!;
    const row = kidney.currentRows[0]!;
    expect(row.signalName).toBe('Frequent urination');
    expect(row.valueLabel).toBe('Often');
    expect(row.sourceLabel).toBe('Body Systems Survey');
    expect(row.capturedOnDisplay).toBe('Sep 11, 2026');
    expect(row.sourceQuestionPrompt).toBe('I need to urinate more often than feels normal.');
  });

  it('28c. the version the finding was built from is recorded on it', () => {
    expect(findingView().versionNumber).toBe(1);
  });

  it('prints the coach\'s own association text and her own considerations, unchanged', () => {
    const html = panel();
    expect(html).toContain(
      'Hip and pelvic signals are observed alongside kidney and bladder findings in this coaching methodology.'
    );
    expect(html).toContain('Ask when the hip signal began.');
    expect(html).toContain('Review the Kidney and Bladder responses.');
  });

  it('states the basis of the association rather than implying it', () => {
    const html = panel();
    expect(html).toContain('CHEK / HLC coaching methodology');
    expect(html).toContain('not an established medical finding');
  });

  it('says in words that it is not a diagnosis', () => {
    expect(panel()).toContain('Root does not diagnose');
  });

  it('prints no percent sign and no combined number', () => {
    expect(panel()).not.toContain('%');
  });

  it('an area with nothing under it is still reported, and says so', () => {
    const view = findingView();
    const stress = view.areas.find((area) => area.refKey === 'stress')!;
    expect(stress.notObserved).toBe(true);
    expect(stress.stateLabel).toBe('Not currently observed');
  });
});

// ---------------------------------------------------------------------
// 29. The withheld finding leaks nothing.
// ---------------------------------------------------------------------

describe('a finding the red flag system withheld', () => {
  it('29. is built empty, not merely drawn empty', () => {
    const view = findingView(new Set(['sig-urination']));
    expect(view.suppressed).toBe(true);
    expect(view.areas).toHaveLength(0);
    expect(view.possibleAssociation).toBeNull();
    expect(view.considerations).toHaveLength(0);
    expect(view.patternName).toBeNull();
    expect(view.basis).toBeNull();
  });

  it('29b. none of the withheld wording appears in the rendered HTML', () => {
    // Proved non vacuously: the unwithheld render is asserted to contain
    // every one of these first, so this guard cannot pass by drawing
    // nothing.
    const open = panel();
    const WORDS = [
      'Hip and pelvis signals, whole-body areas worth reviewing',
      'Hip and pelvic signals are observed alongside kidney and bladder findings in this coaching methodology.',
      'Ask when the hip signal began.',
      'Review the Kidney and Bladder responses.',
      'CHEK / HLC coaching methodology',
    ];
    for (const word of WORDS) expect(open, `unwithheld render is missing "${word}"`).toContain(word);

    const withheld = panel(new Set(['sig-urination']));
    for (const word of WORDS) expect(withheld, `withheld render leaked "${word}"`).not.toContain(word);
  });

  it('29e. the area names are absent from the PAYLOAD, not merely from the markup', () => {
    // The areas sit behind a disclosure that starts closed, so they are not
    // in the resting HTML either way and searching it would prove nothing
    // about them. The payload is where the proof is: a withheld finding
    // carries no area at all, so there is nothing for the disclosure to
    // open onto. Proved non vacuously against the unwithheld view first.
    const open = JSON.stringify(findingView());
    expect(open).toContain('Kidney/Bladder');
    expect(open).toContain('Frequent urination');
    expect(open).toContain('I need to urinate more often than feels normal.');

    const view = findingView(new Set(['sig-urination']));
    const withheld = JSON.stringify(view);
    for (const word of [
      'Kidney/Bladder',
      'I need to urinate more often than feels normal.',
      'Hip and pelvis signals, whole-body areas worth reviewing',
      'CHEK / HLC',
    ]) {
      expect(withheld, `withheld payload leaked "${word}"`).not.toContain(word);
    }

    // The flagged signal's NAME is deliberately still there, and only
    // there: the safety prompt's whole job is to send the coach to the
    // response that needs the red flag process, and a prompt that would
    // not name it would be useless. What is withheld is the whole-body
    // ASSOCIATION around it, not the fact that the response exists.
    expect(view.suppressedSignalNames).toEqual(['Frequent urination']);
    expect(view.areas).toHaveLength(0);
    expect(view.possibleAssociation).toBeNull();
  });

  it('29c. draws the safety prompt in its place, pointing at the existing process', () => {
    const html = panel(new Set(['sig-urination']));
    expect(html).toContain('A safety response needs attention first');
    expect(html).toContain('red flag');
  });

  it('29d. still shows her own words, because the complaint itself is not the risk', () => {
    expect(panel(new Set(['sig-urination']))).toContain(
      'My right hip keeps clicking and bothering me.'
    );
  });
});

// ---------------------------------------------------------------------
// The empty state, and the fence.
// ---------------------------------------------------------------------

describe('the panel when there is nothing to say', () => {
  it('says what is true rather than offering to build something', () => {
    const html = renderToStaticMarkup(
      <RootNoticedPanel
        state={{
          allowed: true,
          view: {
            findings: [],
            convergences: [],
            findingCount: 0,
            suppressedCount: 0,
            complaintCount: 0,
            unclassifiedCount: 0,
            mapEntryCount: 18,
          },
        }}
      />
    );
    expect(html).toContain('Nothing to review');
    expect(html).toContain('18 active entries');
    expect(html).not.toMatch(/create a pattern/i);
  });

  it('draws absolutely nothing for a caller who is not staff', () => {
    const html = renderToStaticMarkup(
      <RootNoticedPanel
        state={{
          allowed: false,
          view: {
            findings: [],
            convergences: [],
            findingCount: 0,
            suppressedCount: 0,
            complaintCount: 0,
            unclassifiedCount: 0,
            mapEntryCount: 0,
          },
        }}
      />
    );
    expect(html).toBe('');
  });
});

describe('the interpretation line', () => {
  it('names what was recognized and never why', () => {
    const lines = interpretationLines(
      CLASSIFICATIONS,
      () => 'Hip clicking',
      () => 'Hip'
    );
    expect(lines).toEqual(['Hip clicking (Right Hip), Often']);
  });
});
