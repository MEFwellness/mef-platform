/**
 * THE LANGUAGE GUARDRAIL, enforced over the strings this feature ships.
 *
 * WHY IT EXISTS. A coaching platform that tells a coach one thing CAUSES
 * another, or names a diagnosis, or says a symptom comes from an organ, is
 * making a clinical claim on her behalf. The Relationship Library is her
 * own notes about what she has observed together and what is worth
 * exploring next, and every word this build puts on the screen has to read
 * that way. lib/cross-system-relationships/language.ts holds the banned
 * list and the editor reads the SAME list to warn her while she types, so
 * the rule is one rule rather than two that drift.
 *
 * WHAT IS SCANNED, and it is deliberately narrow: this feature's own
 * source files, every string in them the compiler can see, plus the words
 * seeded into the database by migration 244, which no source guard can
 * see at all. It is the same two halves as the em dash guard
 * (tests/no-em-dash-guard.test.ts), for the same reason.
 *
 * WHAT IS NOT SCANNED: what the coach herself types. She is the author of
 * her own library, she may have a reason to quote a phrase, and the editor
 * warns her rather than refusing her. The SHIPPED copy, which she did not
 * write, is what is held to zero here.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  ASSOCIATION_VOCABULARY,
  BANNED_PHRASES,
  bannedLanguageWarning,
  findBannedLanguage,
} from '@/lib/cross-system-relationships/language';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

/**
 * Every file this feature ships. Named one by one rather than globbed, so
 * a new file in the feature is a deliberate addition to this list and
 * cannot arrive unscanned.
 */
/**
 * ONE FILE IS DELIBERATELY NOT IN THE LIST BELOW: language.ts itself. It
 * is the banned list, so every banned phrase appears in it as data, and
 * scanning it would be scanning the rule for breaking itself. The one
 * string it renders to a human is the warning, which QUOTES BACK the
 * phrase it found on purpose, because a warning that would not name the
 * words is not a warning. Its own contents are checked by the cases at the
 * foot of this file instead.
 */
const FEATURE_FILES = [
  'lib/cross-system-relationships/constants.ts',
  'lib/cross-system-relationships/data.ts',
  'lib/cross-system-relationships/draft.ts',
  'lib/cross-system-relationships/filters.ts',
  'lib/cross-system-relationships/history.ts',
  'lib/cross-system-relationships/types.ts',
  'app/actions/crossSystemRelationships.ts',
  'app/coach/relationships/page.tsx',
  'components/coach-relationships/RelationshipEditor.tsx',
  'components/coach-relationships/RelationshipLibraryPanel.tsx',
  'components/coach-relationships/RelationshipVersionHistory.tsx',
  'components/coach-relationships/styles.ts',
];

type Violation = { file: string; line: number; phrase: string; text: string };

/**
 * Every string, template chunk and JSX text node in a file, with its line.
 *
 * THE COMPILER, NOT A GREP, for the same reason the em dash guard uses it:
 * a comment explaining why a word is banned must not itself trip the
 * guard, and a grep cannot tell a comment from a label.
 */
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
      const text = node.text;
      if (text && text.trim().length > 0) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        out.push({ line: line + 1, text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

function sourceViolations(): Violation[] {
  const out: Violation[] = [];
  for (const file of FEATURE_FILES) {
    for (const { line, text } of renderedStrings(file)) {
      for (const hit of findBannedLanguage(text)) {
        out.push({ file, line, phrase: hit.phrase, text: text.replace(/\s+/g, ' ').slice(0, 120) });
      }
    }
  }
  return out;
}

/**
 * Every quoted string in the migrations that seed content into this
 * library.
 *
 * THIS IS THE ONLY GUARD THAT CAN SEE THEM. A seeded association text and a
 * seeded coaching consideration are rows in a database, not strings in a
 * file, so the TypeScript walk above is blind to every one of them. That
 * mattered when there was one example row and it matters far more now: the
 * Whole-Body Association Map is over two hundred authored entries across
 * five migrations, carrying an association text and six coaching
 * considerations each, and every word of it is content a coach reads.
 *
 * THE GENERATOR IS NOT TRUSTED TO POLICE ITSELF. The map migrations were
 * produced from structured data, and the producer ran the same banned list
 * over its own output. That is a useful first pass and it is not a guard:
 * what ships is the SQL, and this is what reads the SQL.
 */
const SEED_MIGRATIONS = [
  '00000000000244_cross_system_relationship_example.sql',
  '00000000000248_cross_system_association_map_seed.sql',
  '00000000000252_cross_system_map_structure.sql',
  '00000000000253_cross_system_map_systems.sql',
  '00000000000254_cross_system_map_posture.sql',
  '00000000000255_cross_system_map_signals.sql',
];

function seededStringsIn(file: string): string[] {
  const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
  // Only the statements. The header comment explains what the banned words
  // are, and quoting them there is the point of the comment.
  const start = sql.indexOf('insert into');
  const select = sql.indexOf('select pg_temp.');
  const from = [start, select].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0;
  const body = sql.slice(from);
  return [...body.matchAll(/'((?:[^']|'')*)'/g)].map((match) => match[1]!);
}

function seededStrings(): string[] {
  return SEED_MIGRATIONS.flatMap((file) => seededStringsIn(file));
}

describe('the shipped copy writes in association language', () => {
  it('is non vacuous: it really reads this feature files and finds strings in them', () => {
    for (const file of FEATURE_FILES) {
      expect(fs.existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(true);
    }
    const strings = FEATURE_FILES.flatMap((file) => renderedStrings(file));
    expect(strings.length).toBeGreaterThan(200);
  });

  it('carries no banned phrase in any string this feature renders', () => {
    const violations = sourceViolations();
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

  it('carries no banned phrase in the seeded example, which no source guard can see', () => {
    const offending: string[] = [];
    for (const value of seededStrings()) {
      for (const hit of findBannedLanguage(value)) {
        offending.push(`"${hit.found}" in "${value.slice(0, 120)}"`);
      }
    }
    expect(offending, offending.join('\n')).toHaveLength(0);
  });

  it('is non vacuous about the seed too: it really reads the example rows', () => {
    const seeded = seededStrings();
    expect(seeded.length).toBeGreaterThan(20);
    expect(seeded.some((value) => value.startsWith('Example:'))).toBe(true);
  });

  it('really reads the whole seeded map, not just the example', () => {
    const seeded = seededStringsIn(
      '00000000000248_cross_system_association_map_seed.sql'
    );
    // Eighteen entries, each with a key, a name, a basis, an association
    // text and several considerations.
    expect(seeded.length).toBeGreaterThan(150);
    expect(seeded).toContain('starter-hip-pelvis');
    expect(seeded).toContain('starter-musculoskeletal-general');

    // And the four migrations that grew it into a whole-body map. Each is
    // named so that dropping one from SEED_MIGRATIONS fails here rather
    // than silently leaving a family of entries unscanned.
    const structure = seededStringsIn('00000000000252_cross_system_map_structure.sql');
    expect(structure).toContain('map-area-jaw');
    expect(structure).toContain('map-area-si-joint');
    const systems = seededStringsIn('00000000000253_cross_system_map_systems.sql');
    expect(systems).toContain('map-system-neurological');
    expect(systems).toContain('map-reverse-digestion');
    const posture = seededStringsIn('00000000000254_cross_system_map_posture.sql');
    expect(posture).toContain('map-posture-upper-crossed-pattern');
    expect(posture).toContain('map-posture-sway-back-pattern');
    const signals = seededStringsIn('00000000000255_cross_system_map_signals.sql');
    expect(signals.length).toBeGreaterThan(1000);
    expect(signals).toContain('map-signal-joint-grinding');
  });

  it('every seeded map entry states a basis, so no claim is presented bare', () => {
    // A source type key on every entry, and only keys migration 246 holds.
    const KNOWN = [
      'chek_hlc',
      'referred_pain',
      'biomechanics',
      'lifestyle',
      'mef_internal',
      'coach_added',
      'other',
    ];
    const files = SEED_MIGRATIONS.filter((file) => file.includes('cross_system_map_'));
    expect(files.length).toBe(4);
    let entries = 0;
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
      for (const call of sql.matchAll(/select pg_temp\.seed_map_entry\(([\s\S]*?)\n\);/g)) {
        entries += 1;
        const found = KNOWN.filter((key) => call[1]!.includes(`'${key}'`));
        expect(found.length, call[1]!.slice(0, 80)).toBeGreaterThan(0);
      }
    }
    expect(entries).toBeGreaterThan(200);
  });

  it('the seeded map uses cautious wording everywhere a coach reads it', () => {
    const offending: string[] = [];
    for (const value of seededStringsIn(
      '00000000000248_cross_system_association_map_seed.sql'
    )) {
      for (const hit of findBannedLanguage(value)) {
        offending.push(`"${hit.found}" in "${value.slice(0, 160)}"`);
      }
    }
    expect(offending, offending.join('\n')).toHaveLength(0);
  });

  it('no seeded string carries an em dash, which no member or coach may read', () => {
    const offending = seededStrings().filter((value) => value.includes('\u2014'));
    expect(offending, offending.join('\n')).toHaveLength(0);
  });
});

describe('the banned list itself', () => {
  it.each(BANNED_PHRASES.map((rule) => rule.phrase))('catches "%s"', (phrase) => {
    const hits = findBannedLanguage(`Some copy that says ${phrase} in the middle of it.`);
    expect(hits.map((hit) => hit.phrase)).toContain(phrase);
  });

  it.each([
    ['cause', 'caused', 'causing', 'causes'],
    ['diagnosis', 'diagnose', 'diagnosed', 'diagnostic'],
    ['confirms', 'confirm', 'confirmed', 'confirmation'],
  ])('catches the whole family of %s', (...forms) => {
    for (const form of forms) {
      expect(findBannedLanguage(`It ${form} the thing.`).length, form).toBeGreaterThan(0);
    }
  });

  /**
   * THE FALSE POSITIVES THAT WOULD MAKE THIS GUARD UNUSABLE. "because"
   * carries the letters of "cause" and is an ordinary English word; the
   * bare word "organ" is how the Signal Library names a body system and a
   * coach has every reason to write one down.
   */
  it.each([
    'She noticed it because the week had been heavy.',
    'Two body systems are speaking at once.',
    'An increase in how often she reports it.',
    'These are observed together and may be relevant.',
    'Worth exploring, as a coaching consideration.',
    'A cross-system pattern with supporting signals.',
  ])('does not flag ordinary copy: %s', (copy) => {
    expect(findBannedLanguage(copy)).toEqual([]);
  });

  it('names what it found and what to write instead', () => {
    const warning = bannedLanguageWarning(findBannedLanguage('This confirms it.'));
    expect(warning).toContain('confirms');
    expect(warning).toContain('association language');
  });

  it('says nothing when there is nothing to say', () => {
    expect(bannedLanguageWarning([])).toBeNull();
    expect(findBannedLanguage(null)).toEqual([]);
    expect(findBannedLanguage('')).toEqual([]);
  });

  it('covers every phrase the brief named by hand', () => {
    for (const phrase of [
      'cause',
      'disease',
      'diagnosis',
      'organ dysfunction',
      'confirms',
      'indicates that you have',
      'this symptom comes from',
      'your organ is causing this',
    ]) {
      expect(
        BANNED_PHRASES.some((rule) => rule.phrase === phrase),
        phrase
      ).toBe(true);
    }
  });

  it('holds the approved vocabulary the brief named, so the editor can show it', () => {
    for (const term of [
      'possible association',
      'whole-body pattern',
      'cross-system pattern',
      'supporting signals',
      'worth exploring',
      'coaching consideration',
      'observed together',
      'may be relevant',
    ]) {
      expect(ASSOCIATION_VOCABULARY as readonly string[]).toContain(term);
    }
  });
});
