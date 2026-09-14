/**
 * THE FENCE around the Rooted Reset Fuel Pattern Assessment's two halves.
 *
 * Her stored row carries three raw scores, a confidence level, two
 * denominators, every response tendency, the digestive discomfort flag
 * and her vitality answer. None of that is hers to read, and "no member
 * component prints it" is an intention rather than a fact. This file
 * makes it a fact, three ways, because each catches something the others
 * cannot:
 *
 *   1. THE BUILT PAYLOAD. The real member object is built from a real
 *      stored row with a high confidence and non zero scores, and the
 *      serialized result must mention none of it.
 *   2. THE IMPORT GRAPH. Every member surface is followed through its own
 *      imports, and the coach modules must be unreachable from all of
 *      them. The walk reads whole files rather than lines, so a multi
 *      line import is followed rather than missed.
 *   3. THE GUARD IS NOT VACUOUS. The coach panel is walked too, and it
 *      must be able to reach exactly what a member surface may not.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildFpaMemberResult } from '../lib/fuel-pattern/memberResult';
import { computeFpaScoring } from '../lib/fuel-pattern/scoring';
import { FPA_QUESTIONS } from '../lib/fuel-pattern/questionContent';
import type { FpaWeightClass } from '../lib/fuel-pattern/types';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/** Every file a member's browser can reach on this instrument. */
const MEMBER_SURFACES = [
  'app/assessments/fuel-pattern/page.tsx',
  'app/assessments/fuel-pattern/take/page.tsx',
  'app/assessments/fuel-pattern/results/[sessionId]/page.tsx',
  'app/actions/fuelPattern.ts',
  'components/fuel-pattern/FuelPatternTaker.tsx',
  'components/fuel-pattern/FuelPatternResultView.tsx',
  'components/fuel-pattern/FuelPatternQuestionScreen.tsx',
  'components/fuel-pattern/PlateIllustration.tsx',
  'lib/fuel-pattern/copy.ts',
  'lib/fuel-pattern/plate.ts',
  'lib/fuel-pattern/memberResult.ts',
  'lib/fuel-pattern/observations.ts',
];

/** What a coach reads and a member never does. */
const COACH_ONLY = [
  'lib/fuel-pattern/coachCopy.ts',
  'lib/fuel-pattern/coachView.ts',
  'app/actions/fuelPatternCoach.ts',
];

function optionValue(questionKey: string, weight: FpaWeightClass): string {
  const question = FPA_QUESTIONS.find((q) => q.key === questionKey)!;
  return (question.options.find((o) => o.weight === weight) ?? question.options[0]!).value;
}

describe('1. the built member payload', () => {
  /*
    A DECISIVE, HIGH CONFIDENCE SITTING, on purpose: the payload is
    hardest to keep clean when there is something impressive to leak.
  */
  const responses = Object.fromEntries(
    FPA_QUESTIONS.map((q) => [
      q.key,
      optionValue(q.key, q.key === 'fpa_q6' ? 'tendency' : 'protein'),
    ])
  );
  const scoring = computeFpaScoring(responses);

  it('is built from a sitting that really does carry everything it must not leak', () => {
    expect(scoring.pattern).toBe('protein_supportive');
    expect(scoring.confidence).toBe('high');
    expect(scoring.scores.protein).toBeGreaterThan(0);
    expect(scoring.tendencies.length).toBeGreaterThan(0);
  });

  it('carries her pattern, her observation lines, and nothing else at all', () => {
    const payload = buildFpaMemberResult({ pattern: scoring.pattern, responses });
    expect(Object.keys(payload).sort()).toEqual(['observations', 'pattern']);
    expect(payload.pattern).toBe('protein_supportive');
    expect(payload.observations.length).toBeGreaterThanOrEqual(2);
  });

  it('mentions no score, no confidence, no tendency and no digit once serialized', () => {
    const serialized = JSON.stringify(buildFpaMemberResult({ pattern: scoring.pattern, responses }));
    for (const word of ['confidence', 'high', 'score', 'tendenc', 'vitality', 'discomfort']) {
      expect(serialized.toLowerCase(), word).not.toContain(word);
    }
    expect(serialized).not.toMatch(/[0-9]/);
  });
});

describe('2. the import graph', () => {
  /** Whole source rather than line by line, so a multi line import is followed. */
  function importsOf(relative: string): string[] {
    const source = read(relative);
    const specifiers = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
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

  it('is following real files, so a typo in either list fails rather than passes silently', () => {
    for (const file of [...MEMBER_SURFACES, ...COACH_ONLY]) {
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
    }
  });

  it('cannot reach any coach module from any member surface', () => {
    for (const surface of MEMBER_SURFACES) {
      const reachable = reachableFrom(surface);
      for (const banned of COACH_ONLY) {
        expect(reachable.has(banned), `${surface} can reach ${banned}`).toBe(false);
      }
    }
  });

  it('the coach panel CAN reach them, so this guard is not vacuous', () => {
    const reachable = reachableFrom('app/coach/clients/[id]/FuelPatternPanel.tsx');
    for (const banned of COACH_ONLY) {
      expect(reachable.has(banned), `the coach panel cannot reach ${banned}`).toBe(true);
    }
  });
});
