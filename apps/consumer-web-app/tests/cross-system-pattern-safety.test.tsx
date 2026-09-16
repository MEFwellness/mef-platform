// @vitest-environment jsdom

/**
 * THE SAFETY OVERRIDE, and the claim it is here to prove: A RED FLAGGED
 * RESPONSE NEVER RENDERS AS A PATTERN EXPLANATION.
 *
 * It is proved at both layers, because either one on its own would be a
 * half proof:
 *
 *   IN THE BUILDER. A suppressed card is constructed with every pattern
 *     field null and every list empty, so there is no possible
 *     association, no coaching consideration and no display line IN THE
 *     PAYLOAD for a screen to draw, not merely none that a component
 *     chooses to show.
 *   IN THE RENDERED HTML. The real component is rendered and the real
 *     strings a coach wrote are searched for character by character, so a
 *     future refactor that started drawing a field again fails here.
 *
 * AND THE EXISTING SYSTEM IS THE ONE THAT DECIDES. Nothing in this feature
 * defines a flag, and the case below drives the survey's own
 * firedRedFlags through real flag and safety level rows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { flaggedSittingIds, redFlaggedSignalIds } from '@/lib/cross-system-patterns/safety';
import { matchOne } from '@/lib/cross-system-patterns/match';
import { buildPatternCard, buildWholeBodyPatternsView } from '@/lib/cross-system-patterns/view';
import {
  EMERGING_DISPLAY_LINE,
  SAFETY_SUPPRESSION_ACTION,
  SAFETY_SUPPRESSION_ANCHOR_ID,
  SAFETY_SUPPRESSION_BODY,
  SAFETY_SUPPRESSION_HEADING,
  STRONGER_DISPLAY_LINE,
} from '@/lib/cross-system-patterns/copy';
import { WholeBodyPatternsPanel } from '@/app/coach/clients/[id]/WholeBodyPatternsPanel';
import type {
  BodySystemsRedFlag,
  BodySystemsSafetyLevel,
} from '@/lib/body-systems/types';
import { resetFixtureIds, signal, summary } from './cross-system-pattern-fixture';

beforeEach(resetFixtureIds);

/** The survey's own rows, in the shape migration 221 seeds them. */
const FLAGS: BodySystemsRedFlag[] = [
  { flagKey: 'chest_pain', position: 1, prompt: 'Chest pain or pressure', level: 1 },
  { flagKey: 'weight_loss', position: 2, prompt: 'Unexplained weight loss', level: 2 },
];

const LEVELS: BodySystemsSafetyLevel[] = [
  { level: 1, label: 'Urgent', memberResponse: 'Please contact a medical professional today.' },
  { level: 2, label: 'Worth a check', memberResponse: 'Please mention this to a medical professional.' },
];

const ASSOCIATION = 'These are observed together and may be worth exploring.';
const CONSIDERATION = 'Ask what else she has noticed in the same week.';

function hip(overrides = {}) {
  return signal({ signalSlug: 'hip-clicking', ...overrides });
}
function kidney(overrides = {}) {
  return signal({
    signalSlug: 'frequent-urination',
    signalName: 'Frequent urination',
    categoryKey: 'kidney_bladder',
    bodyAreaKey: null,
    ...overrides,
  });
}
function lowBack(overrides = {}) {
  return signal({
    signalSlug: 'low-back-ache',
    signalName: 'Low-back ache',
    categoryKey: 'musculoskeletal',
    bodyAreaKey: 'low_back',
    ...overrides,
  });
}

// ---------------------------------------------------------------------
// 1. The existing system decides, and this feature only asks it
// ---------------------------------------------------------------------

describe('the survey own red flag layer is what decides', () => {
  it('names a sitting that fired and leaves a sitting that did not', () => {
    const flagged = flaggedSittingIds(
      [
        { sittingId: 'sitting-1', redFlagAnswers: { chest_pain: true, weight_loss: false } },
        { sittingId: 'sitting-2', redFlagAnswers: { chest_pain: false } },
        { sittingId: 'sitting-3', redFlagAnswers: {} },
      ],
      FLAGS,
      LEVELS
    );
    expect([...flagged]).toEqual(['sitting-1']);
  });

  it('only a literal Yes counts, so nothing invents a safety event', () => {
    const flagged = flaggedSittingIds(
      [
        // A key nobody defined, and a value that is not a boolean, both
        // read as No there, which is the direction that never invents one.
        { sittingId: 'a', redFlagAnswers: { made_up_flag: true } as Record<string, boolean> },
        { sittingId: 'b', redFlagAnswers: {} },
      ],
      FLAGS,
      LEVELS
    );
    expect(flagged.size).toBe(0);
  });

  it('flags every signal captured from that sitting, and no other', () => {
    const rows = [
      hip({ sourceSessionId: 'sitting-1' }),
      kidney({ sourceSessionId: 'sitting-2' }),
      lowBack({ sourceKey: 'coach_entered', sourceLabel: 'Coach entered', sourceSessionId: null }),
    ];
    const ids = redFlaggedSignalIds(rows, new Set(['sitting-1']));
    expect([...ids]).toEqual([rows[0]!.id]);
  });

  it('a sitting id from another instrument cannot flag a row it has nothing to do with', () => {
    const rows = [
      signal({
        sourceKey: 'breathing_pattern_check_in',
        sourceLabel: 'Breathing Pattern Check-In',
        sourceSessionId: 'sitting-1',
      }),
    ];
    expect(redFlaggedSignalIds(rows, new Set(['sitting-1'])).size).toBe(0);
  });

  it('nothing is flagged when nothing fired', () => {
    expect(redFlaggedSignalIds([hip()], new Set()).size).toBe(0);
  });
});

// ---------------------------------------------------------------------
// 2. A suppressed card carries no explanation in its payload
// ---------------------------------------------------------------------

describe('a suppressed card is built empty, not merely drawn empty', () => {
  function suppressedCard() {
    const rows = [hip({ sourceSessionId: 'sitting-1' }), kidney(), lowBack()];
    const match = matchOne(summary(), rows);
    expect(match.surfaced).toBe(true);
    return buildPatternCard(match, rows, new Set([rows[0]!.id]));
  }

  it('the pattern really would have surfaced without the flag', () => {
    const rows = [hip({ sourceSessionId: 'sitting-1' }), kidney(), lowBack()];
    const match = matchOne(summary(), rows);
    const unsuppressed = buildPatternCard(match, rows, new Set());
    expect(unsuppressed.suppressed).toBe(false);
    expect(unsuppressed.possibleAssociation).toBe(ASSOCIATION);
    expect(unsuppressed.considerations).toEqual([CONSIDERATION]);
    expect(unsuppressed.displayLine).toBe(EMERGING_DISPLAY_LINE);
  });

  it('carries no pattern name, no strength, no association and no consideration', () => {
    const card = suppressedCard();
    expect(card.suppressed).toBe(true);
    expect(card.patternName).toBeNull();
    expect(card.versionNumber).toBeNull();
    expect(card.versionId).toBeNull();
    expect(card.strength).toBeNull();
    expect(card.levelLabel).toBeNull();
    expect(card.displayLine).toBeNull();
    expect(card.possibleAssociation).toBeNull();
    expect(card.whyNoticed).toBeNull();
    expect(card.movement).toBeNull();
    expect(card.observed).toEqual([]);
    expect(card.relatedSystems).toEqual([]);
    expect(card.sources).toEqual([]);
    expect(card.considerations).toEqual([]);
    expect(card.contributingResponses).toEqual([]);
  });

  it('names the signal carrying the response, so the coach knows where to look', () => {
    expect(suppressedCard().suppressedSignalNames).toEqual(['Hip clicking']);
  });

  it('a flag on a SUPPORTING row withholds the whole card too, not only a primary one', () => {
    const rows = [hip(), kidney({ sourceSessionId: 'sitting-1' }), lowBack()];
    const match = matchOne(summary(), rows);
    const card = buildPatternCard(match, rows, new Set([rows[1]!.id]));
    expect(card.suppressed).toBe(true);
    expect(card.possibleAssociation).toBeNull();
  });

  it('a flag on a row that did NOT contribute leaves the card alone', () => {
    const rows = [hip(), kidney(), lowBack()];
    const unrelated = signal({ signalSlug: 'cold-hands-or-feet', sourceSessionId: 'sitting-9' });
    const match = matchOne(summary(), rows);
    const card = buildPatternCard(match, [...rows, unrelated], new Set([unrelated.id]));
    expect(card.suppressed).toBe(false);
    expect(card.possibleAssociation).toBe(ASSOCIATION);
  });

  it('counts the withheld cards separately from the patterns', () => {
    const rows = [hip({ sourceSessionId: 'sitting-1' }), kidney(), lowBack()];
    const view = buildWholeBodyPatternsView({
      matches: [matchOne(summary(), rows)],
      records: rows,
      flaggedSignalIds: new Set([rows[0]!.id]),
      activeRelationshipCount: 1,
    });
    expect(view.patternCount).toBe(0);
    expect(view.suppressedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------
// 3. And the rendered HTML says none of it either
// ---------------------------------------------------------------------

describe('the rendered card never shows a red flagged response as a pattern explanation', () => {
  function html(flagged: boolean): string {
    const rows = [hip({ sourceSessionId: 'sitting-1' }), kidney(), lowBack()];
    const view = buildWholeBodyPatternsView({
      matches: [matchOne(summary(), rows)],
      records: rows,
      flaggedSignalIds: flagged ? new Set([rows[0]!.id]) : new Set(),
      activeRelationshipCount: 1,
    });
    return renderToStaticMarkup(<WholeBodyPatternsPanel state={{ allowed: true, view }} />);
  }

  it('is non vacuous: unflagged, every one of those strings really is on the screen', () => {
    const shown = html(false);
    expect(shown).toContain(ASSOCIATION);
    expect(shown).toContain(CONSIDERATION);
    expect(shown).toContain(EMERGING_DISPLAY_LINE);
    expect(shown).toContain('Hip area signals observed alongside kidney and bladder signals');
    expect(shown).toContain('Possible Association');
  });

  it.each([
    ['the possible association', ASSOCIATION],
    ['the coaching consideration', CONSIDERATION],
    ['the emerging display line', EMERGING_DISPLAY_LINE],
    ['the stronger display line', STRONGER_DISPLAY_LINE],
    ['the pattern name', 'Hip area signals observed alongside kidney and bladder signals'],
    ['the Possible Association heading', 'Possible Association'],
    ['the Pattern Strength heading', 'Pattern Strength'],
    ['the Coaching Considerations heading', 'Coaching Considerations'],
    ['the level label', 'Emerging'],
    ['the arithmetic line', 'Root identified'],
  ])('suppressed, it does not render %s', (_name, text) => {
    expect(html(true)).not.toContain(text);
  });

  it('draws the safety prompt in its place, pointing at the existing safety process', () => {
    const shown = html(true);
    expect(shown).toContain(SAFETY_SUPPRESSION_HEADING);
    expect(shown).toContain(SAFETY_SUPPRESSION_BODY);
    expect(shown).toContain(SAFETY_SUPPRESSION_ACTION);
    // The existing red flags block, pinned at the top of the Body Systems
    // Survey card on this same page.
    expect(SAFETY_SUPPRESSION_ANCHOR_ID).toBe('detail-card-body-systems');
  });

  it('wears the safety treatment the Body Systems card already uses', () => {
    // The same deep red border and wash, so a coach meets one visual
    // language for safety rather than two.
    expect(html(true)).toContain('border-[#9B2C2C]/30');
    expect(html(true)).toContain('bg-[#FDF6F5]');
  });
});
