// @vitest-environment jsdom

/**
 * THE CARD: four blocks that never blend, the timeline inside it, and the
 * questionnaire scores it does not touch.
 *
 *   1. OBSERVED, RELATED SIGNALS, PATTERN STRENGTH and POSSIBLE
 *      ASSOCIATION are four separately headed regions, in that order, and
 *      no sentence is shared between them.
 *   2. THE COACH'S OWN WORDS ARE CARRIED THROUGH UNCHANGED. Nothing in
 *      this feature composes an association or a consideration, and the
 *      card prints the version's text character for character.
 *   3. WHY ROOT NOTICED THIS is arithmetic and says so.
 *   4. SOURCES names every contributing signal with its source and day,
 *      and VIEW CONTRIBUTING SIGNALS opens onto every exact original
 *      response with the question the member was answering.
 *   5. THE TIMELINE is per signal and observational only.
 *   6. NOTHING IS SCORED OR COMBINED. There is no total on the card and
 *      nothing here reads a questionnaire percentage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { matchOne } from '@/lib/cross-system-patterns/match';
import {
  buildPatternCard,
  buildWholeBodyPatternsView,
  relatedSystemLines,
  whyNoticedLine,
} from '@/lib/cross-system-patterns/view';
import {
  buildMovement,
  buildTrajectory,
  directionOf,
  MOVEMENT_LINES,
} from '@/lib/cross-system-patterns/timeline';
import { PATTERN_CARD_BLOCKS } from '@/lib/cross-system-patterns/copy';
import { WholeBodyPatternsPanel } from '@/app/coach/clients/[id]/WholeBodyPatternsPanel';
import { component, resetFixtureIds, signal, summary } from './cross-system-pattern-fixture';

beforeEach(resetFixtureIds);

const ROOT = path.resolve(__dirname, '..');

function hip(overrides = {}) {
  return signal({ signalSlug: 'hip-clicking', ...overrides });
}
function kidney(overrides = {}) {
  return signal({
    signalSlug: 'frequent-urination',
    signalName: 'Frequent urination',
    categoryKey: 'kidney_bladder',
    bodyAreaKey: null,
    sourceQuestionRef: 'K2',
    sourceQuestionPrompt: 'How often do you need to pass urine?',
    ...overrides,
  });
}
function lowBack(overrides = {}) {
  return signal({
    signalSlug: 'low-back-ache',
    signalName: 'Low-back ache',
    categoryKey: 'musculoskeletal',
    bodyAreaKey: 'low_back',
    sourceQuestionRef: 'M7',
    sourceQuestionPrompt: 'How often does your lower back ache?',
    ...overrides,
  });
}

/** The card every case below reads, plus the rows behind it. */
function built(extraRows: ReturnType<typeof signal>[] = []) {
  const rows = [hip(), kidney(), lowBack(), ...extraRows];
  const match = matchOne(summary(), rows);
  return { rows, match, card: buildPatternCard(match, rows, new Set()) };
}

function panelHtml(): string {
  const { rows, match } = built();
  const view = buildWholeBodyPatternsView({
    matches: [match],
    records: rows,
    flaggedSignalIds: new Set(),
    activeRelationshipCount: 1,
  });
  return renderToStaticMarkup(<WholeBodyPatternsPanel state={{ allowed: true, view }} />);
}

// ---------------------------------------------------------------------
// 1. Four blocks, in order, never blended
// ---------------------------------------------------------------------

describe('the four blocks are separate and they stay in order', () => {
  it('names all eight blocks in the order the card draws them', () => {
    expect(PATTERN_CARD_BLOCKS.map((block) => block.key)).toEqual([
      'observed',
      'related_signals',
      'pattern_strength',
      'possible_association',
      'why_noticed',
      'sources',
      'coaching_considerations',
      'contributing_signals',
    ]);
  });

  it('renders the four headings, in that order, as four separate regions', () => {
    const html = panelHtml();
    const order = ['Observed', 'Related Signals', 'Pattern Strength', 'Possible Association'];
    let cursor = -1;
    for (const heading of order) {
      const at = html.indexOf(`>${heading}<`);
      expect(at, `${heading} is missing from the card`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('OBSERVED is her reported signals with their own values, and nothing else', () => {
    const { card } = built();
    expect(card.observed).toHaveLength(1);
    expect(card.observed[0]!.signalName).toBe('Hip clicking');
    expect(card.observed[0]!.valueLabel).toBe('Often');
    // Not a coach's sentence and not an interpretation.
    expect(JSON.stringify(card.observed)).not.toContain('may be worth exploring');
  });

  it('prints an observed signal the way the brief writes one', () => {
    expect(panelHtml()).toContain('Hip clicking, Often');
  });

  it('RELATED SIGNALS is one line per related input, with a count under each', () => {
    const { card } = built();
    expect(card.relatedSystems).toEqual([
      { refKind: 'category', refKey: 'kidney_bladder', label: 'Kidney/Bladder', supportingCount: 1 },
    ]);
    expect(panelHtml()).toContain('1 supporting response');
  });

  it('lists a related input nothing matched as nought rather than dropping it', () => {
    const wider = summary({
      current: {
        components: [
          component({ role: 'primary', refKind: 'body_area', refKey: 'hip', refLabel: 'Hip' }),
          component({
            role: 'related',
            refKind: 'category',
            refKey: 'kidney_bladder',
            refLabel: 'Kidney/Bladder',
          }),
          component({
            role: 'related',
            refKind: 'category',
            refKey: 'digestion',
            refLabel: 'Digestion',
          }),
          component({
            role: 'support',
            refKind: 'signal',
            refKey: 'low-back-ache',
            refLabel: 'Low-back ache',
          }),
        ],
      },
    });
    const rows = [hip(), kidney(), lowBack()];
    const lines = relatedSystemLines(matchOne(wider, rows));
    expect(lines.map((line) => [line.label, line.supportingCount])).toEqual([
      ['Kidney/Bladder', 1],
      ['Digestion', 0],
    ]);
  });

  it('PATTERN STRENGTH is her level plus one of the two fixed lines', () => {
    const { card } = built();
    expect(card.levelLabel).toBe('Emerging');
    expect(card.displayLine).toBe('An emerging cross-system pattern may be worth reviewing.');
    const html = panelHtml();
    expect(html).toContain('Emerging');
    expect(html).toContain('An emerging cross-system pattern may be worth reviewing.');
  });

  it('POSSIBLE ASSOCIATION is her wording, character for character', () => {
    const { card } = built();
    expect(card.possibleAssociation).toBe(
      'These are observed together and may be worth exploring.'
    );
  });

  it('says so plainly rather than composing one when she has written none', () => {
    const rows = [hip(), kidney(), lowBack()];
    const bare = summary({ current: { possibleAssociationText: null } });
    const card = buildPatternCard(matchOne(bare, rows), rows, new Set());
    expect(card.possibleAssociation).toBeNull();
  });

  it('never blends the four: no block content appears inside another', () => {
    const { card } = built();
    const observed = JSON.stringify(card.observed);
    const related = JSON.stringify(card.relatedSystems);
    expect(observed).not.toContain(card.possibleAssociation!);
    expect(related).not.toContain(card.possibleAssociation!);
    expect(observed).not.toContain(card.displayLine!);
    expect(card.possibleAssociation).not.toContain(card.displayLine!);
    for (const consideration of card.considerations) {
      expect(card.possibleAssociation).not.toContain(consideration);
      expect(observed).not.toContain(consideration);
    }
  });
});

// ---------------------------------------------------------------------
// 2 to 4. The coach's words, the arithmetic, the sources, the responses
// ---------------------------------------------------------------------

describe('the coach own list, the arithmetic, and every original response', () => {
  it('COACHING CONSIDERATIONS is her list, in her order, unchanged', () => {
    const rows = [hip(), kidney(), lowBack()];
    const three = summary({
      current: {
        considerations: [
          { id: 'c3', position: 3, body: 'Third line.' },
          { id: 'c1', position: 1, body: 'First line.' },
          { id: 'c2', position: 2, body: 'Second line.' },
        ],
      },
    });
    const card = buildPatternCard(matchOne(three, rows), rows, new Set());
    expect(card.considerations).toEqual(['First line.', 'Second line.', 'Third line.']);
  });

  it('WHY ROOT NOTICED THIS names the two counts, in the brief own shape', () => {
    const { match } = built();
    expect(whyNoticedLine(match)).toBe('Root identified 2 supporting signals across 1 source.');
  });

  it('never prints "1 signals" or "1 sources"', () => {
    const rows = [hip(), kidney({ sourceLabel: 'Coach entered', sourceKey: 'coach_entered' })];
    const one = summary({ current: { minSupportingSignals: 1 } });
    const match = matchOne(one, rows);
    expect(whyNoticedLine(match)).toBe('Root identified 1 supporting signal across 2 sources.');
  });

  it('SOURCES names every contributing signal with its own source and day', () => {
    const { card } = built();
    expect(card.sources).toHaveLength(3);
    for (const entry of card.sources) {
      expect(entry.sourceLabel.length).toBeGreaterThan(0);
      expect(entry.capturedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const html = panelHtml();
    expect(html).toContain('Rooted Reset Body Systems Survey');
    expect(html).toContain('Sep 1, 2026');
  });

  it('VIEW CONTRIBUTING SIGNALS carries every exact original response', () => {
    const { card } = built();
    expect(card.contributingResponses).toHaveLength(3);
    expect(card.contributingResponses.map((entry) => entry.sourceQuestionPrompt)).toEqual([
      'How often does your hip click or snap?',
      'How often do you need to pass urine?',
      'How often does your lower back ache?',
    ]);
    expect(card.contributingResponses.map((entry) => entry.role)).toEqual([
      'primary',
      'related',
      'support',
    ]);
  });

  it('links each response back to the card that reads its sitting, and only where there is one', () => {
    const { rows, match } = built();
    const coachRow = signal({
      signalSlug: 'low-back-ache',
      sourceKey: 'coach_entered',
      sourceLabel: 'Coach entered',
      sourceSessionId: null,
      entryMode: 'coach_entered',
      capturedOn: '2026-09-10',
      capturedAt: '2026-09-10T10:00:00.000Z',
    });
    const card = buildPatternCard(match, [...rows, coachRow], new Set());
    const survey = card.contributingResponses.find(
      (entry) => entry.sourceLabel === 'Rooted Reset Body Systems Survey'
    );
    expect(survey!.anchorId).toBe('detail-card-body-systems');

    // A coach entry has no sitting at all, so it gets no link rather than
    // one that lands nowhere.
    const rebuilt = buildPatternCard(
      matchOne(summary(), [hip(), kidney(), coachRow]),
      [hip(), kidney(), coachRow],
      new Set()
    );
    const entered = rebuilt.contributingResponses.find((entry) => entry.entryMode === 'coach_entered');
    expect(entered!.anchorId).toBeNull();
  });

  it('offers the expansion as a control rather than burying the responses', () => {
    const html = panelHtml();
    expect(html).toContain('View contributing signals');
    expect(html).toContain('aria-expanded="false"');
    // Folded, so the exact questions are not in the document yet.
    expect(html).not.toContain('How often do you need to pass urine?');
  });
});

// ---------------------------------------------------------------------
// 5. The timeline
// ---------------------------------------------------------------------

describe('the pattern timeline', () => {
  /** Three dated rows for one signal, loudest first in time. */
  function fading() {
    return [
      signal({ capturedOn: '2026-07-01', capturedAt: '2026-07-01T10:00:00.000Z', valueLabel: 'Often', valueNumeric: 6 }),
      signal({ capturedOn: '2026-08-01', capturedAt: '2026-08-01T10:00:00.000Z', valueLabel: 'Sometimes', valueNumeric: 3 }),
      signal({ capturedOn: '2026-09-01', capturedAt: '2026-09-01T10:00:00.000Z', valueLabel: 'Rarely', valueNumeric: 1 }),
    ];
  }

  it('prints a per signal trajectory in the brief own shape', () => {
    const rows = fading();
    const contribution = {
      record: rows[2]!,
      role: 'primary' as const,
      componentPosition: 1,
      componentLabel: 'Hip',
    };
    const trajectory = buildTrajectory(contribution, rows);
    expect(trajectory.line).toBe('Often to Sometimes to Rarely');
    expect(trajectory.direction).toBe('quieter');
  });

  it('reads oldest first, whatever order the rows arrive in', () => {
    const rows = fading();
    const contribution = {
      record: rows[2]!,
      role: 'primary' as const,
      componentPosition: 1,
      componentLabel: 'Hip',
    };
    expect(buildTrajectory(contribution, [...rows].reverse()).line).toBe(
      'Often to Sometimes to Rarely'
    );
  });

  it('keeps a left and a right apart, because they are two things', () => {
    const rows = [
      signal({ side: 'left', capturedOn: '2026-08-01', valueLabel: 'Often', valueNumeric: 6 }),
      signal({ side: 'left', capturedOn: '2026-09-01', valueLabel: 'Rarely', valueNumeric: 1 }),
      signal({ side: 'right', capturedOn: '2026-09-01', valueLabel: 'Often', valueNumeric: 6 }),
    ];
    const left = buildTrajectory(
      { record: rows[1]!, role: 'primary', componentPosition: 1, componentLabel: 'Hip' },
      rows
    );
    expect(left.line).toBe('Often to Rarely');
    expect(left.sideLabel).toBe('Left');
  });

  it('says nothing about a trajectory for a signal recorded once', () => {
    const row = hip();
    const trajectory = buildTrajectory(
      { record: row, role: 'primary', componentPosition: 1, componentLabel: 'Hip' },
      [row]
    );
    expect(trajectory.line).toBeNull();
    expect(trajectory.direction).toBe('unknown');
  });

  it('refuses a direction where the two values are not on one ladder', () => {
    expect(
      directionOf([
        { valueLabel: 'Found', valueNumeric: null, capturedOn: '2026-08-01' },
        { valueLabel: 'Often', valueNumeric: 6, capturedOn: '2026-09-01' },
      ])
    ).toBe('unknown');
  });

  it('says several have become quieter when several have', () => {
    const rows = [
      ...fading(),
      kidney({ capturedOn: '2026-08-01', valueLabel: 'Often', valueNumeric: 6 }),
      kidney({ capturedOn: '2026-09-01', valueLabel: 'Rarely', valueNumeric: 1 }),
      lowBack(),
    ];
    const match = matchOne(summary(), rows);
    const movement = buildMovement([...match.primary, ...match.supporting], rows);
    expect(movement.quieterCount).toBe(2);
    expect(movement.lines).toEqual([MOVEMENT_LINES.quieter]);
  });

  it('does not say SEVERAL about one signal', () => {
    const rows = [
      ...fading(),
      kidney(),
      lowBack(),
    ];
    const match = matchOne(summary(), rows);
    const movement = buildMovement([...match.primary, ...match.supporting], rows);
    expect(movement.quieterCount).toBe(1);
    expect(movement.lines).toEqual([MOVEMENT_LINES.oneQuieter]);
  });

  it('says the pattern has become more active when something got louder', () => {
    const rows = [
      signal({ capturedOn: '2026-08-01', valueLabel: 'Rarely', valueNumeric: 1 }),
      signal({ capturedOn: '2026-09-01', valueLabel: 'Often', valueNumeric: 6 }),
      kidney(),
      lowBack(),
    ];
    const match = matchOne(summary(), rows);
    const movement = buildMovement([...match.primary, ...match.supporting], rows);
    expect(movement.lines).toEqual([MOVEMENT_LINES.louder]);
    expect(movement.lines[0]).toBe(
      'This pattern has become more active since the previous assessment.'
    );
  });

  it('says both when both happened and neither side is clearly larger', () => {
    const rows = [
      signal({ capturedOn: '2026-08-01', valueLabel: 'Often', valueNumeric: 6 }),
      signal({ capturedOn: '2026-09-01', valueLabel: 'Rarely', valueNumeric: 1 }),
      kidney({ capturedOn: '2026-08-01', valueLabel: 'Rarely', valueNumeric: 1 }),
      kidney({ capturedOn: '2026-09-01', valueLabel: 'Often', valueNumeric: 6 }),
      lowBack(),
    ];
    const match = matchOne(summary(), rows);
    const movement = buildMovement([...match.primary, ...match.supporting], rows);
    expect(movement.quieterCount).toBe(1);
    expect(movement.louderCount).toBe(1);
    expect(movement.lines).toEqual([MOVEMENT_LINES.mixed]);
  });

  it('says nothing moved rather than inventing a movement', () => {
    const rows = [
      signal({ capturedOn: '2026-08-01', valueLabel: 'Often', valueNumeric: 6 }),
      signal({ capturedOn: '2026-09-01', valueLabel: 'Often', valueNumeric: 6 }),
      kidney(),
      lowBack(),
    ];
    const match = matchOne(summary(), rows);
    expect(buildMovement([...match.primary, ...match.supporting], rows).lines).toEqual([
      MOVEMENT_LINES.steady,
    ]);
  });

  it('says there is nothing to compare when every signal is new', () => {
    const { rows, match } = built();
    expect(buildMovement([...match.primary, ...match.supporting], rows).lines).toEqual([
      MOVEMENT_LINES.tooEarly,
    ]);
  });

  it('writes ONE pattern level line, never a stack of them', () => {
    const { rows, match } = built();
    expect(buildMovement([...match.primary, ...match.supporting], rows).lines).toHaveLength(1);
  });

  /**
   * THE CLAIM THE BRIEF MAKES ABOUT MOVEMENT, proved structurally. Every
   * sentence this generator can produce is a fixed string with no slot in
   * it, so none of them can be made to name two things and say one
   * produced the other.
   */
  it('no movement sentence names a signal, a body area or a body system', () => {
    for (const line of Object.values(MOVEMENT_LINES)) {
      expect(line).not.toMatch(/\$\{/);
      for (const word of ['hip', 'kidney', 'bladder', 'back', 'digestion', 'skin']) {
        expect(line.toLowerCase().split(/\W+/), line).not.toContain(word);
      }
    }
  });

  it('no movement sentence says one thing produced another', () => {
    const source = readFileSync(path.join(ROOT, 'lib/cross-system-patterns/timeline.ts'), 'utf8');
    const block = source.slice(source.indexOf('export const MOVEMENT_LINES'));
    const lines = block.slice(0, block.indexOf('} as const;'));
    for (const banned of ['because', 'due to', 'leads to', 'result of', 'driving', 'explains']) {
      expect(lines.toLowerCase(), banned).not.toContain(banned);
    }
  });

  it('renders the trajectory and the line on the card', () => {
    const rows = [
      signal({ capturedOn: '2026-07-01', capturedAt: '2026-07-01T10:00:00.000Z', valueLabel: 'Often', valueNumeric: 6 }),
      signal({ capturedOn: '2026-09-01', capturedAt: '2026-09-01T10:00:00.000Z', valueLabel: 'Rarely', valueNumeric: 1 }),
      kidney(),
      lowBack(),
    ];
    const view = buildWholeBodyPatternsView({
      matches: [matchOne(summary(), rows)],
      records: rows,
      flaggedSignalIds: new Set(),
      activeRelationshipCount: 1,
    });
    const html = renderToStaticMarkup(<WholeBodyPatternsPanel state={{ allowed: true, view }} />);
    expect(html).toContain('Change over time');
    expect(html).toContain('Often to Rarely');
    expect(html).toContain(MOVEMENT_LINES.oneQuieter);
  });
});

// ---------------------------------------------------------------------
// 6. Nothing is scored and nothing is combined
// ---------------------------------------------------------------------

describe('nothing on this card is a score, and nothing is combined with a questionnaire', () => {
  it('the feature reads no questionnaire percentage, band or section total', () => {
    for (const file of [
      'lib/cross-system-patterns/match.ts',
      'lib/cross-system-patterns/view.ts',
      'lib/cross-system-patterns/timeline.ts',
      'app/coach/clients/[id]/WholeBodyPatternsPanel.tsx',
    ]) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      for (const forbidden of [
        'buildBodySystemsCoachView',
        'scoreSections',
        'bandFor',
        'body_systems_scale',
        'results.sections',
      ]) {
        expect(source, `${file} reaches ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('carries no total, no index and no percentage field', () => {
    const { card } = built();
    const keys = Object.keys(card);
    for (const forbidden of ['score', 'total', 'index', 'percent', 'severity', 'confidence']) {
      expect(keys.some((key) => key.toLowerCase().includes(forbidden)), forbidden).toBe(false);
    }
  });

  it('prints no percent sign anywhere on the card', () => {
    expect(panelHtml()).not.toContain('%');
  });

  it('the section says out loud that nothing is scored and nothing is shown to her', () => {
    const html = panelHtml();
    expect(html).toContain('nothing is added to a questionnaire result');
    expect(html).toContain('nothing here is shown to her');
  });
});

// ---------------------------------------------------------------------
// The empty states
// ---------------------------------------------------------------------

describe('an empty section says which kind of empty it is', () => {
  function empty(activeRelationshipCount: number): string {
    const view = buildWholeBodyPatternsView({
      matches: [],
      records: [],
      flaggedSignalIds: new Set(),
      activeRelationshipCount,
    });
    return renderToStaticMarkup(<WholeBodyPatternsPanel state={{ allowed: true, view }} />);
  }

  it('says the library has nothing switched on when it has nothing switched on', () => {
    expect(empty(0)).toContain('No pattern in your Relationship Library is active yet');
  });

  it('says nothing to review when definitions are active and she matches none', () => {
    expect(empty(2)).toContain('Nothing to review');
  });
});
