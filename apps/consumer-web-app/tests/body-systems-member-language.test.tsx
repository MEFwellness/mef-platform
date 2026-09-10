// @vitest-environment jsdom

/**
 * Nothing from the coach layer can reach a member surface, and no
 * member facing sentence in this feature speaks in medical conclusions.
 *
 * THREE PROOFS, BECAUSE ONE WOULD NOT BE ENOUGH.
 *
 *   THE IMPORT GRAPH. Every member surface in this feature is walked
 *   transitively, and the walk fails if any coach only module is reachable
 *   from any of them. This is the one that keeps holding when somebody adds
 *   a screen next year.
 *
 *   THE STORED WORDS. Every 'member.' copy row, every section name and
 *   intro line, every band status line, every question prompt, every red
 *   flag prompt and both safety responses are checked for the banned
 *   vocabulary. These are database rows, so the app wide source guards
 *   cannot see them.
 *
 *   THE RENDERED SCREEN. Her real results component is rendered from a
 *   sitting that fires several library entries, and the HTML is searched
 *   for every one of that library's sentences and titles. A leak would
 *   have to survive all three.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BANDS,
  LIBRARY,
  MEMBER_COPY,
  QUESTIONS,
  RED_FLAGS,
  SAFETY_LEVELS,
  SCALE,
  SECTIONS,
} from './body-systems-fixture';
import { buildResults } from '../lib/body-systems/scoring';
import { buildMemberResultsView } from '../lib/body-systems/memberView';
import { fireAssociations } from '../lib/body-systems/associations';
import { BodySystemsResults } from '../components/body-systems/BodySystemsResults';

const ROOT = path.resolve(__dirname, '..');

/** The words the build prompt bans from every member facing surface here. */
const BANNED_MEMBER_WORDS = [
  'disease',
  'diagnosis',
  'condition',
  'dysfunction',
  'deficiency',
  'disorder',
];

function bannedWordsIn(text: string): string[] {
  return BANNED_MEMBER_WORDS.filter((word) =>
    new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, 'i').test(text)
  );
}

// ---------------------------------------------------------------------
// 1. The import graph.
// ---------------------------------------------------------------------

/** Modules only a coach may ever read from. */
const COACH_ONLY = [
  'lib/body-systems/associations.ts',
  'lib/body-systems/patterns.ts',
  'lib/body-systems/coachView.ts',
];

/** Every file that renders on a member's screen in this feature. */
const MEMBER_SURFACES = [
  'app/body-systems/page.tsx',
  'components/body-systems/BodySystemsExperience.tsx',
  'components/body-systems/BodySystemsResults.tsx',
  'components/body-systems/BodySystemsEntry.tsx',
  'components/body-systems/BodySystemsBranchPreference.tsx',
];

/**
 * Every import STATEMENT in a file, matched whole rather than line by
 * line, because a multi line import is exactly the thing a per line regex
 * passes over in silence.
 */
function importedPaths(file: string): string[] {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out: string[] = [];
  const pattern = /(?:^|\n)\s*import[\s\S]*?from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) out.push(match[1]!);
  return out;
}

/** Resolve one import specifier to a repo relative path, or null for a package. */
function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = specifier.slice(2);
  else if (specifier.startsWith('.')) base = path.normalize(path.join(path.dirname(fromFile), specifier));
  else return null;

  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importedPaths(file)) {
      const resolved = resolveImport(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

describe('the coach layer is not reachable from any member surface', () => {
  it.each(MEMBER_SURFACES)('%s imports no coach only module, transitively', (surface) => {
    const reachable = reachableFrom(surface);
    const leaks = COACH_ONLY.filter((coachOnly) => reachable.has(coachOnly));
    expect(leaks, `${surface} can reach: ${leaks.join(', ')}`).toEqual([]);
  });

  it('is non vacuous: the coach panel really can reach all three', () => {
    // If the walker were broken it would find nothing anywhere, and the
    // assertions above would pass for the wrong reason.
    const reachable = reachableFrom('app/coach/clients/[id]/BodySystemsPanel.tsx');
    for (const coachOnly of COACH_ONLY) {
      expect(reachable.has(coachOnly), `walker cannot see ${coachOnly}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------
// 2. The stored words.
// ---------------------------------------------------------------------

describe('no member facing stored content speaks in medical conclusions', () => {
  it('holds for every member copy row', () => {
    const violations: string[] = [];
    for (const [key, value] of Object.entries(MEMBER_COPY)) {
      const found = bannedWordsIn(value);
      if (found.length > 0) violations.push(`${key}: ${found.join(', ')}`);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('holds for every section name, intro line and attention line', () => {
    const violations: string[] = [];
    for (const section of SECTIONS) {
      for (const text of [section.displayName, section.memberIntroLine, section.topAttentionLine]) {
        const found = bannedWordsIn(text);
        if (found.length > 0) violations.push(`${section.sectionKey}: ${found.join(', ')}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('holds for every band label and status line', () => {
    for (const band of BANDS) {
      expect(bannedWordsIn(band.memberLabel)).toEqual([]);
      expect(bannedWordsIn(band.memberStatusLine)).toEqual([]);
    }
  });

  it('holds for every question prompt', () => {
    const violations: string[] = [];
    for (const question of QUESTIONS) {
      const found = bannedWordsIn(question.prompt);
      if (found.length > 0) violations.push(`${question.questionRef}: ${found.join(', ')}`);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('holds for every red flag prompt and both safety responses', () => {
    for (const flag of RED_FLAGS) expect(bannedWordsIn(flag.prompt)).toEqual([]);
    for (const level of SAFETY_LEVELS) {
      expect(bannedWordsIn(level.label)).toEqual([]);
      expect(bannedWordsIn(level.memberResponse)).toEqual([]);
    }
  });

  it('is non vacuous: the checker really does catch these words', () => {
    expect(bannedWordsIn('a possible thyroid condition')).toEqual(['condition']);
    expect(bannedWordsIn('adrenal dysfunction')).toEqual(['dysfunction']);
    // And it is a whole word match, so an ordinary word that merely
    // contains one is not a false positive.
    expect(bannedWordsIn('conditioning work')).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 3. The rendered screen.
// ---------------------------------------------------------------------

/** A sheet loud enough to fire a good part of the library. */
function loudAnswers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const question of QUESTIONS) {
    if (question.branch === 'b') continue;
    out[question.questionRef] = 'almost_always';
  }
  return out;
}

describe('her rendered results screen carries no association text', () => {
  const answers = loudAnswers();
  const results = buildResults({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    answers,
    branch: 'a',
  });
  const fired = fireAssociations({
    sections: SECTIONS,
    questions: QUESTIONS,
    scale: SCALE,
    bands: BANDS,
    answers,
    results,
    branch: 'a',
    library: LIBRARY,
  });
  const html = renderToStaticMarkup(
    <BodySystemsResults
      view={buildMemberResultsView({
        sections: SECTIONS,
        bands: BANDS,
        results,
        previousResults: null,
        minDeltaPercent: 1,
      })}
      copy={MEMBER_COPY}
    />
  );

  it('fires a real part of the library on this sheet, so the check has something to catch', () => {
    expect(fired.length).toBeGreaterThan(10);
  });

  it('contains none of the fired entries title, association text or next step', () => {
    const leaks: string[] = [];
    for (const entry of fired) {
      for (const text of [entry.title, entry.associationText, entry.nextStep]) {
        if (html.includes(text)) leaks.push(`${entry.entryCode}: ${text}`);
      }
    }
    expect(leaks, leaks.join('\n')).toEqual([]);
  });

  it('contains none of the WHOLE library either, fired or not', () => {
    for (const entry of LIBRARY) {
      expect(html.includes(entry.associationText), `${entry.entryCode} leaked`).toBe(false);
    }
  });

  it('contains none of the banned words', () => {
    // The rendered HTML carries class names and inline styles as well as
    // copy, so the text is pulled out before it is checked.
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(bannedWordsIn(text)).toEqual([]);
  });

  it('speaks in loudness, which is what it is supposed to say instead', () => {
    expect(html).toContain('Speaking loudly');
    expect(html).toContain("Your coach has the full picture. This is where you&#x27;ll start together.");
  });

  it('shows no total, no grade and no overall score', () => {
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(text).not.toMatch(/\boverall\b/i);
    expect(text).not.toMatch(/\btotal\b/i);
    expect(text).not.toMatch(/\bgrade\b/i);
    expect(text).not.toMatch(/\bscore\b/i);
  });
});
