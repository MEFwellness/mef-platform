// @vitest-environment jsdom

/**
 * THE WIRING GUARD for the two layers.
 *
 * The brief for this experience says the validated instrument and the
 * Rooted Reset experience are separate, technically as well as visually,
 * so the experience can be upgraded without accidentally changing the
 * instrument. This file is what makes that a fact rather than an
 * intention, and it checks it five ways because each one catches something
 * the others cannot:
 *
 *   1. THE IMPORT DIRECTION. The instrument imports nothing from the
 *      experience, so an edit to her wording cannot reach the scoring
 *      model through a shared module.
 *   2. THE IMPORT GRAPH. Every member surface is followed through its own
 *      imports, and the two coach modules (which hold the instrument's own
 *      name, the threshold and the per item points) must be unreachable
 *      from all of them.
 *   3. THE BUILT PAYLOAD. The real member view is built from real sittings
 *      and inspected. It MUST now carry her total, the maximum and the
 *      reference threshold, and it must still carry no per item point
 *      column and no instrument name.
 *   4. THE RENDERED SCREEN. Her results are rendered and the text is
 *      scanned, because textContent is what she actually reads.
 *   5. THE WORDS THEMSELVES. Both member facing modules are scanned for
 *      the instrument's name, for the forbidden clinical vocabulary and
 *      for causal claims.
 *
 * WHAT CHANGED ON 2026-09-12, AND WHY THIS FILE NO LONGER SAYS IT. Claims
 * 3 and 4 used to assert the OPPOSITE: that the serialised payload held no
 * digit at all and that her rendered results printed none. That rule was
 * deliberately reversed, she is shown her score, and these guards were
 * rewritten to assert the new intent rather than disabled or deleted. The
 * fence that did NOT move is claim 2: the instrument's own name, the
 * coach's score sentence and the coaching prompt library are still
 * unreachable from every member surface.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BPC_ITEMS, scoreBpcAnswers } from '../lib/breathing-check-in/instrument';
import {
  BPC_MEMBER_BANDS,
  BPC_SIGNAL_AREAS,
  bpcAreaMaxTotal,
  bpcAreaPartitionProblems,
  bpcMemberBand,
  buildBpcMemberView,
  BPC_INSTRUMENT_MAX_FOR_PARTITION,
} from '../lib/breathing-check-in/signals';
import { BPC_COPY, BPC_MILESTONES } from '../lib/breathing-check-in/copy';
import { BreathingCheckInResults } from '../components/breathing-check-in/BreathingCheckInResults';

const ROOT = path.resolve(__dirname, '..');

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/** Every file a member's browser or a member's response can reach. */
const MEMBER_SURFACES = [
  'app/breathing-check-in/page.tsx',
  'components/breathing-check-in/BreathingCheckInExperience.tsx',
  'components/breathing-check-in/BreathingCheckInResults.tsx',
  'components/breathing-check-in/BreathingCheckInEntry.tsx',
  'components/breathing-check-in/BreathRipple.tsx',
  'lib/breathing-check-in/signals.ts',
  'lib/breathing-check-in/copy.ts',
  'lib/breathing-check-in/conversationEntry.ts',
];

/** The two modules that hold what a coach reads and a member never does. */
const COACH_ONLY = ['lib/breathing-check-in/coachCopy.ts', 'lib/breathing-check-in/coachView.ts'];

// ---------------------------------------------------------------------

describe('1. the import direction: the experience cannot reach back into the instrument', () => {
  it('the instrument imports nothing from the experience layer', () => {
    const source = read('lib/breathing-check-in/instrument.ts');
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    // It is a leaf on purpose. Anything it imported could change what it
    // scores from somewhere a reviewer is not looking.
    expect(specifiers).toEqual([]);
  });

  it('the member copy module imports nothing at all, so a reworded sentence moves no number', () => {
    const source = read('lib/breathing-check-in/copy.ts');
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
    expect(specifiers).toEqual([]);
  });
});

describe('2. the import graph', () => {
  /**
   * Whole source rather than line by line, so a multi line import is
   * followed. A line based regex would pass this guard while missing the
   * import that breaks it.
   */
  function importsOf(relative: string): string[] {
    const source = read(relative);
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);
    const resolved: string[] = [];
    for (const specifier of specifiers) {
      let base: string | null = null;
      if (specifier.startsWith('@/')) base = specifier.slice(2);
      else if (specifier.startsWith('.')) {
        base = path.normalize(path.join(path.dirname(relative), specifier));
      }
      if (!base) continue;
      for (const extension of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        const candidate = `${base}${extension}`;
        if (fs.existsSync(path.join(ROOT, candidate))) {
          resolved.push(candidate);
          break;
        }
      }
    }
    return resolved;
  }

  function reachableFrom(entry: string): Set<string> {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const current = queue.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of importsOf(current)) queue.push(next);
    }
    return seen;
  }

  it('is following real files, so a typo in this list fails rather than passes silently', () => {
    for (const surface of MEMBER_SURFACES) {
      expect(fs.existsSync(path.join(ROOT, surface)), surface).toBe(true);
    }
    for (const banned of COACH_ONLY) {
      expect(fs.existsSync(path.join(ROOT, banned)), banned).toBe(true);
    }
  });

  it('cannot reach either coach module from any member surface', () => {
    for (const surface of MEMBER_SURFACES) {
      const reachable = reachableFrom(surface);
      for (const banned of COACH_ONLY) {
        expect(reachable.has(banned), `${surface} can reach ${banned}`).toBe(false);
      }
    }
  });

  it('the coach panel CAN reach them, so this guard is not vacuous', () => {
    const reachable = reachableFrom('app/coach/clients/[id]/BreathingCheckInPanel.tsx');
    for (const banned of COACH_ONLY) {
      expect(reachable.has(banned), `the coach panel cannot reach ${banned}`).toBe(true);
    }
  });
});

describe('3. the built payload carries her score, and still no coach material', () => {
  function sitting(valueKey: string) {
    return scoreBpcAnswers(Object.fromEntries(BPC_ITEMS.map((item) => [item.itemId, valueKey])));
  }

  it('carries the total, the maximum and the reference threshold', () => {
    const view = buildBpcMemberView(sitting('very_often'));
    expect(view.totalScore).toBe(64);
    expect(view.maxScore).toBe(64);
    expect(view.referenceThreshold).toBe(23);
    expect(view.aboveThreshold).toBe(true);
  });

  it('reports a quiet sitting as below the reference threshold', () => {
    const view = buildBpcMemberView(sitting('never'));
    expect(view.totalScore).toBe(0);
    expect(view.aboveThreshold).toBe(false);
  });

  it('serialises her total, so what the page ships and what it draws are one number', () => {
    const payload = JSON.stringify(buildBpcMemberView(sitting('often')));
    // Sixteen at three points each.
    expect(payload).toContain('"totalScore":48');
    expect(payload).toContain('"maxScore":64');
    expect(payload).toContain('"referenceThreshold":23');
  });

  it('is exactly these fields, so a coach only one cannot be added unnoticed', () => {
    const view = buildBpcMemberView(sitting('very_often'));
    expect(Object.keys(view).sort()).toEqual([
      'aboveThreshold',
      'areas',
      'maxScore',
      'referenceThreshold',
      'statement',
      'strongest',
      'supportingLine',
      'totalScore',
    ]);
    expect(view.areas).toHaveLength(3);
    for (const area of view.areas) {
      expect(Object.keys(area).sort()).toEqual(['areaKey', 'displayName', 'phrase']);
    }
    // A strongest signal is a name and her own frequency word. NOT a point
    // column: the per item points stay coach facing.
    for (const signal of view.strongest) {
      expect(Object.keys(signal).sort()).toEqual(['frequencyLabel', 'itemId', 'name']);
    }
  });

  it('never puts the instrument its own name in the payload', () => {
    const payload = JSON.stringify(buildBpcMemberView(sitting('very_often'))).toLowerCase();
    expect(payload).not.toContain('nijmegen');
    expect(payload).not.toContain('questionnaire');
  });
});

describe('the three areas account for the whole instrument and double count nothing', () => {
  it('puts every one of the sixteen in exactly one area', () => {
    expect(bpcAreaPartitionProblems()).toEqual({ missing: [], duplicated: [] });
  });

  it('sums to the instrument its own maximum, so no area can inflate against another', () => {
    expect(bpcAreaMaxTotal()).toBe(BPC_INSTRUMENT_MAX_FOR_PARTITION);
  });

  it('is three named areas', () => {
    expect(BPC_SIGNAL_AREAS.map((area) => area.displayName)).toEqual([
      'Breathing sensations',
      'Tension signals',
      'Body sensations',
    ]);
  });

  it('reads a quiet sitting as quiet and a maximum one as loud, in every area', () => {
    const quiet = buildBpcMemberView(
      scoreBpcAnswers(Object.fromEntries(BPC_ITEMS.map((i) => [i.itemId, 'never'])))
    );
    const loud = buildBpcMemberView(
      scoreBpcAnswers(Object.fromEntries(BPC_ITEMS.map((i) => [i.itemId, 'very_often'])))
    );
    expect(quiet.areas.every((a) => a.phrase === 'Mostly quiet')).toBe(true);
    expect(loud.areas.every((a) => a.phrase === 'Speaking louder')).toBe(true);
  });
});

describe('her band moves with her total and never leaves her without one', () => {
  it('gives every possible total a band', () => {
    for (let total = 0; total <= 64; total += 1) {
      expect(bpcMemberBand(total), `total ${total}`).toBeTruthy();
    }
  });

  it('never goes backwards as the total rises', () => {
    let lastIndex = -1;
    for (let total = 0; total <= 64; total += 1) {
      const index = BPC_MEMBER_BANDS.findIndex((b) => b.bandKey === bpcMemberBand(total).bandKey);
      expect(index).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
    }
  });
});

describe('4. the rendered screen: what she actually reads', () => {
  function renderResults(totalAnswer: string): string {
    const view = buildBpcMemberView(
      scoreBpcAnswers(Object.fromEntries(BPC_ITEMS.map((i) => [i.itemId, totalAnswer])))
    );
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(<BreathingCheckInResults view={view} onHome={() => {}} />);
    });
    const text = host.textContent ?? '';
    act(() => root.unmount());
    host.remove();
    return text;
  }

  it('prints her score on a maximum scoring sitting', () => {
    const text = renderResults('very_often');
    expect(text).toContain('64');
    expect(text).toContain(BPC_COPY.resultsAboveThresholdLine);
  });

  it('prints her score on a quiet one, and says it is below the reference figure', () => {
    const text = renderResults('never');
    expect(text).toContain('0');
    expect(text).toContain(BPC_COPY.resultsBelowThresholdLine);
    expect(text).not.toContain(BPC_COPY.resultsAboveThresholdLine);
  });

  it('never prints the name of the underlying instrument', () => {
    const text = renderResults('very_often').toLowerCase();
    expect(text).not.toContain('nijmegen');
    expect(text).not.toContain('questionnaire');
  });

  it('always prints both disclaimers, on every reading', () => {
    for (const answer of ['never', 'sometimes', 'very_often']) {
      expect(renderResults(answer)).toContain(BPC_COPY.resultsDisclaimer);
      expect(renderResults(answer)).toContain(BPC_COPY.resultsScoreDisclaimer);
    }
  });
});

describe('5. the words themselves', () => {
  const MEMBER_WORD_MODULES = ['lib/breathing-check-in/copy.ts', 'lib/breathing-check-in/signals.ts'];

  /**
   * Every string literal in the file, through the real TypeScript parser.
   *
   * NOT A REGEX, AND THAT IS THE SECOND TIME THIS FILE LEARNED IT. A
   * quote-matching regex reads "You're doing well." as the start of a
   * string and runs on to the next apostrophe several lines later, which
   * produced a "number in member copy" failure naming a fragment of the
   * source rather than any sentence. The parser knows what a string is.
   * app/globals.css's own guard (tests/no-em-dash-guard.test.ts) uses the
   * same compiler API for the same reason.
   */
  function memberStrings(relative: string): string[] {
    const source = ts.createSourceFile(
      relative,
      read(relative),
      ts.ScriptTarget.Latest,
      true
    );
    const out: string[] = [];
    const walk = (node: ts.Node): void => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        out.push(node.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
    return out;
  }

  it('never names the underlying instrument anywhere a member can read it', () => {
    for (const file of MEMBER_WORD_MODULES) {
      for (const text of memberStrings(file)) {
        expect(text.toLowerCase(), `${file}: ${text}`).not.toContain('nijmegen');
      }
    }
  });

  /**
   * THE CONDITIONS THIS EXPERIENCE MAY NOT NAME. The brief is explicit:
   * avoid diagnosing dysfunctional breathing, hyperventilation syndrome,
   * anxiety disorders, respiratory disease, or any medical condition.
   */
  const FORBIDDEN_CONDITIONS = [
    'dysfunctional breathing',
    'hyperventilation',
    'anxiety disorder',
    'panic disorder',
    'respiratory disease',
    'asthma',
    'diagnos',
    'syndrome',
    'disorder',
    'condition',
    'symptom',
  ];

  it('names no condition and claims no diagnosis', () => {
    for (const file of MEMBER_WORD_MODULES) {
      for (const text of memberStrings(file)) {
        const lower = text.toLowerCase();
        for (const word of FORBIDDEN_CONDITIONS) {
          // The disclaimer is the one sentence allowed to use the word
          // "diagnosis", and only to say this is not one.
          if (word === 'diagnos' && lower.includes('is not a diagnosis')) continue;
          // AND ONE NAMED CONSTANT MAY SAY WHAT HER SCORE IS NOT. The
          // exception is this exact sentence, addressed by constant rather
          // than by a pattern, so widening it is an edit to this line
          // rather than something a new string can slip through.
          if (text === BPC_COPY.resultsScoreDisclaimer) continue;
          expect(lower, `${file}: ${text}`).not.toContain(word);
        }
      }
    }
  });

  const CAUSAL_WORDS = [
    'cause',
    'caused',
    'causing',
    'because',
    'leads to',
    'due to',
    'explains',
  ];

  it('is one sentence that is exempt, and it is the disclaimer, worded exactly this way', () => {
    // The exemption above is addressed by constant. This is what that
    // constant is allowed to be: a refusal, not a claim.
    expect(BPC_COPY.resultsScoreDisclaimer).toBe(
      'This is not a diagnosis of a breathing disorder. Your score is one part of understanding your breathing pattern, stress load, and overall health.'
    );

    // And nothing else in either module leans on it.
    const exempted = MEMBER_WORD_MODULES.flatMap((file) => memberStrings(file)).filter(
      (text) => text === BPC_COPY.resultsScoreDisclaimer
    );
    expect(exempted).toHaveLength(1);
  });

  it('claims no causation', () => {
    for (const file of MEMBER_WORD_MODULES) {
      for (const text of memberStrings(file)) {
        const lower = text.toLowerCase();
        for (const word of CAUSAL_WORDS) {
          expect(lower, `${file}: ${text}`).not.toContain(word);
        }
      }
    }
  });

  it('carries no score anywhere in the member copy, and says the two task facts separately', () => {
    // The only digits allowed in the member copy module are the ones that
    // describe the TASK in front of her: how many questions, and how long.
    // They are named constants precisely so this scan can allow exactly
    // those and nothing else.
    const strings = memberStrings('lib/breathing-check-in/copy.ts');
    const withDigits = strings.filter((text) => /\d/.test(text));
    for (const text of withDigits) {
      expect(
        text === BPC_COPY.introMeta ||
          text === BPC_COPY.cardDuration ||
          text.includes('16 questions') ||
          text.includes('2 minutes'),
        `unexpected number in member copy: ${text}`
      ).toBe(true);
    }
    expect(strings.join(' ')).not.toContain('64');
    expect(strings.join(' ')).not.toContain('23');
  });

  it('carries no digit at all in the module that reads her result', () => {
    for (const text of memberStrings('lib/breathing-check-in/signals.ts')) {
      // Bands carry numeric BOUNDS, but those are number literals in code,
      // not strings. A digit inside a STRING here would be one on its way
      // to her screen.
      expect(/\d/.test(text), `digit in a member sentence: ${text}`).toBe(false);
    }
  });
});

describe('the three pauses say nothing about her answers', () => {
  it('is three of them, after questions four, eight and twelve', () => {
    expect(BPC_MILESTONES.map((m) => m.afterPosition)).toEqual([4, 8, 12]);
  });

  it('is three different screens rather than one shown three times', () => {
    const headings = BPC_MILESTONES.map((m) => m.heading);
    const lines = BPC_MILESTONES.map((m) => m.line);
    expect(new Set(headings).size).toBe(3);
    expect(new Set(lines).size).toBe(3);
  });

  /**
   * A pause that told her anything about what she had said so far would
   * change what she said next, which a validated instrument cannot
   * tolerate. These are the shapes such a sentence takes.
   */
  const JUDGEMENT_OPENINGS = [
    'you seem',
    'you appear',
    'your answers suggest',
    'your answers show',
    'so far you',
    'it looks like you',
  ];

  it('makes no observation about what she has answered', () => {
    for (const milestone of BPC_MILESTONES) {
      const text = `${milestone.heading} ${milestone.line}`.toLowerCase();
      for (const opening of JUDGEMENT_OPENINGS) {
        expect(text, milestone.heading).not.toContain(opening);
      }
      // And no score, no count and no category.
      expect(/\d/.test(text), milestone.heading).toBe(false);
      for (const area of BPC_SIGNAL_AREAS) {
        expect(text).not.toContain(area.displayName.toLowerCase());
      }
    }
  });
});
