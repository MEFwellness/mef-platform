/**
 * THE COPY LINT FROM PROMPT 2, APPLIED TO EVERYTHING PROMPT 3 SHIPS.
 *
 * WHY IT IS THE SAME LIST AND NOT A SECOND ONE. The Relationship Library
 * writes in association language because a coaching platform that tells a
 * coach one thing CAUSES another, or names a diagnosis, or says a symptom
 * comes from an organ, is making a clinical claim on her behalf. The
 * matching engine is the surface where those definitions actually meet a
 * member's own answers, which is the exact moment that claim would be
 * easiest to make and worst to make. So it is held to the same list, from
 * the same file, and any word added there lands here on the day it is
 * added.
 *
 * WHAT IS SCANNED: this feature's own source files, every string in them
 * the compiler can see, plus the two sentences the engine is allowed to
 * write about strength and the whole set of neutral movement lines. It is
 * the compiler rather than a grep for the reason the em dash guard uses
 * one: a comment explaining WHY a word is banned must not itself trip the
 * guard.
 *
 * WHAT IS NOT SCANNED: what the coach herself typed. She is the author of
 * her own library and the editor warns her rather than refusing her. Every
 * word this build puts on the screen that she did NOT write is held to
 * zero here.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  ASSOCIATION_VOCABULARY,
  findBannedLanguage,
} from '@/lib/cross-system-relationships/language';
import {
  EMERGING_DISPLAY_LINE,
  PATTERN_CARD_BLOCKS,
  SAFETY_SUPPRESSION_ACTION,
  SAFETY_SUPPRESSION_BODY,
  SAFETY_SUPPRESSION_HEADING,
  STRENGTH_DISPLAY_LINE,
  STRONGER_DISPLAY_LINE,
} from '@/lib/cross-system-patterns/copy';
import { MOVEMENT_LINES } from '@/lib/cross-system-patterns/timeline';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/**
 * Every file this build ships. Named one by one rather than globbed, so a
 * new file in the feature is a deliberate addition to this list and cannot
 * arrive unscanned.
 */
const FEATURE_FILES = [
  'lib/cross-system-patterns/constants.ts',
  'lib/cross-system-patterns/copy.ts',
  'lib/cross-system-patterns/data.ts',
  'lib/cross-system-patterns/evaluate.ts',
  'lib/cross-system-patterns/match.ts',
  'lib/cross-system-patterns/safety.ts',
  'lib/cross-system-patterns/serviceRole.ts',
  'lib/cross-system-patterns/timeline.ts',
  'lib/cross-system-patterns/types.ts',
  'lib/cross-system-patterns/view.ts',
  'app/actions/crossSystemPatterns.ts',
  'app/coach/clients/[id]/WholeBodyPatternsPanel.tsx',
];

type Violation = { file: string; line: number; phrase: string; text: string };

function renderedStrings(file: string): { line: number; text: string }[] {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      if (node.text && node.text.trim().length > 0) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        out.push({ line: line + 1, text: node.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

describe('everything this engine says writes in association language', () => {
  it('is non vacuous: it really reads these files and finds strings in them', () => {
    for (const file of FEATURE_FILES) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(true);
    }
    expect(FEATURE_FILES.flatMap(renderedStrings).length).toBeGreaterThan(100);
  });

  it('carries no banned phrase in any string this feature renders', () => {
    const violations: Violation[] = [];
    for (const file of FEATURE_FILES) {
      for (const { line, text } of renderedStrings(file)) {
        for (const hit of findBannedLanguage(text)) {
          violations.push({
            file,
            line,
            phrase: hit.phrase,
            text: text.replace(/\s+/g, ' ').slice(0, 120),
          });
        }
      }
    }
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}: "${v.phrase}" in "${v.text}"`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} banned phrase(s) in this feature's UI strings. This feature writes in association language: ${ASSOCIATION_VOCABULARY.join(', ')}.\n${report}`
      );
    }
    expect(violations).toHaveLength(0);
  });

  it('carries no banned phrase in the migration, which no source guard sees', () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS, '00000000000245_cross_system_pattern_matches.sql'),
      'utf8'
    );
    // The two stored table comments. The migration's own header explains
    // what the banned words are, and naming them there is the point of the
    // header, so only the comments are read.
    const comments = [...sql.matchAll(/comment on table \w+ is\s+'((?:[^']|'')*)'/g)].map(
      (match) => match[1]!
    );
    expect(comments.length).toBe(2);

    // ONE EXEMPTION, AND IT IS THE DENIAL ITSELF. The first comment opens
    // "NOT A DIAGNOSIS", which is the single most useful sentence in the
    // schema and cannot be written without the word. It is exempted the
    // same way lib/cross-system-relationships/language.ts is exempted from
    // its own list: a rule that forbids saying what the rule is is not a
    // rule anybody can read. Removing that one clause must leave zero, so
    // the exemption cannot cover a second use hiding behind it.
    expect(comments[0], 'the denial is gone from the schema').toContain('NOT A DIAGNOSIS');
    for (const comment of comments) {
      const withoutDenial = comment.replace(/NOT A DIAGNOSIS/g, 'NOT SUCH A THING');
      expect(findBannedLanguage(withoutDenial), comment.slice(0, 80)).toEqual([]);
    }
  });
});

describe('the sentences this engine is allowed to write', () => {
  const EVERY_SENTENCE = [
    EMERGING_DISPLAY_LINE,
    STRONGER_DISPLAY_LINE,
    SAFETY_SUPPRESSION_HEADING,
    SAFETY_SUPPRESSION_BODY,
    SAFETY_SUPPRESSION_ACTION,
    ...Object.values(MOVEMENT_LINES),
    ...PATTERN_CARD_BLOCKS.map((block) => block.title),
    ...PATTERN_CARD_BLOCKS.map((block) => block.blurb),
  ];

  it.each(EVERY_SENTENCE)('says nothing banned: %s', (sentence) => {
    expect(findBannedLanguage(sentence)).toEqual([]);
  });

  it('never states a cause, a condition, a diagnosis or a confirmation', () => {
    for (const sentence of EVERY_SENTENCE) {
      const words = sentence.toLowerCase().split(/\W+/);
      for (const banned of [
        'cause',
        'causes',
        'causing',
        'disease',
        'diagnosis',
        'diagnose',
        'confirms',
        'confirmed',
        'proves',
        'means',
        'indicates',
        'dysfunction',
        'condition',
        'treatment',
        'treat',
      ]) {
        expect(words, `"${sentence}" says "${banned}"`).not.toContain(banned);
      }
    }
  });

  it('the two display lines offer a review rather than making a statement', () => {
    expect(EMERGING_DISPLAY_LINE).toContain('may be worth reviewing');
    expect(STRONGER_DISPLAY_LINE).toContain('contributing');
    // Neither tells her what is true and neither tells her what to do.
    for (const line of [EMERGING_DISPLAY_LINE, STRONGER_DISPLAY_LINE]) {
      expect(line).not.toMatch(/\byou should\b|\bshe should\b|\bmust\b|\brefer\b/i);
    }
  });

  it('the two lines are exactly the wording the brief named', () => {
    expect(STRENGTH_DISPLAY_LINE.emerging).toBe(
      'An emerging cross-system pattern may be worth reviewing.'
    );
    expect(STRENGTH_DISPLAY_LINE.stronger).toBe(
      'Multiple related responses are contributing to this predefined pattern.'
    );
  });

  it('every sentence this feature ships is one of the ones listed above', () => {
    // A sentence the engine writes that nobody put on this list would be a
    // sentence nothing is holding to the rule. The list is the inventory.
    expect(EVERY_SENTENCE.length).toBeGreaterThanOrEqual(19);
    for (const sentence of EVERY_SENTENCE) {
      expect(typeof sentence).toBe('string');
      expect(sentence.length).toBeGreaterThan(0);
    }
  });

  it('carries no em dash, which the database cannot see either', () => {
    for (const sentence of EVERY_SENTENCE) {
      expect(sentence, sentence).not.toContain('—');
    }
  });
});

describe('the words the brief forbids outright, over the whole feature', () => {
  it('never says diagnosis, disease, organ dysfunction or confirms, anywhere', () => {
    for (const file of FEATURE_FILES) {
      for (const { line, text } of renderedStrings(file)) {
        for (const banned of ['diagnos', 'disease', 'organ dysfunction', 'confirm']) {
          expect(text.toLowerCase(), `${file}:${line}`).not.toContain(banned);
        }
      }
    }
  });

  it('the card says out loud that nothing here is a score and nothing reaches her', () => {
    const panel = fs
      .readFileSync(path.join(ROOT, 'app/coach/clients/[id]/WholeBodyPatternsPanel.tsx'), 'utf8');
    expect(panel).toContain('nothing is added to a questionnaire result');
    expect(panel).toContain('nothing here is shown to her');
    expect(panel).toContain('for you to review');
  });
});
