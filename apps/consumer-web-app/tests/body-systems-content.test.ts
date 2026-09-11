/**
 * The stored content is the content. This reads it out of the migrations
 * and asserts it is what the approved specification says.
 *
 * WHY THIS EXISTS. Every question, weight, cut off and safety response
 * lives in a database row precisely so a coach can correct it without a
 * deploy. That freedom is only safe if the seeded rows are checkable, so
 * this is the check: the counts, the scale, the bands, the six flags with
 * their levels, and the fact that every copy key the code asks for has a
 * row and every seeded row is asked for by something.
 */

import { describe, it, expect } from 'vitest';
import {
  BANDS,
  BODY_SYSTEMS_SQL_PATHS,
  COPY_ROWS,
  LIBRARY,
  QUESTIONS,
  RED_FLAGS,
  SAFETY_LEVELS,
  SCALE,
  SCHEMA_SQL_PATH,
  SECTIONS,
  SETTINGS,
  readSql,
} from './body-systems-fixture';
import { COACH_COPY_KEYS, MEMBER_COPY_KEYS } from '../lib/body-systems/copyKeys';

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

describe('the eleven sections', () => {
  it('are the eleven the specification names, in its order', () => {
    expect(SECTIONS.map((section) => section.displayName)).toEqual([
      'Digestion',
      'Blood Sugar and Energy',
      'Liver and Detox',
      'Adrenals and Stress Response',
      'Thyroid and Metabolism',
      'Heart and Circulation',
      'Immune System',
      'Kidney and Bladder',
      'Muscles and Joints',
      'Brain and Nervous System',
      'Hormonal Health',
    ]);
  });

  it('each carries its own member intro line and its own top attention line', () => {
    for (const section of SECTIONS) {
      expect(section.memberIntroLine.length).toBeGreaterThan(0);
      expect(section.topAttentionLine.startsWith('Right now, ')).toBe(true);
    }
  });

  it('each names where its Root Map row lands', () => {
    for (const section of SECTIONS) {
      expect(section.registryDomain.length).toBeGreaterThan(0);
      expect(section.registryCode.startsWith('body_systems_')).toBe(true);
    }
    // Eleven distinct codes, so two sections can never supersede each other.
    expect(new Set(SECTIONS.map((s) => s.registryCode)).size).toBe(11);
  });
});

describe('the question bank', () => {
  it('is 103 questions on Branch A and 101 on Branch B', () => {
    const a = QUESTIONS.filter((q) => q.branch === 'all' || q.branch === 'a');
    const b = QUESTIONS.filter((q) => q.branch === 'all' || q.branch === 'b');
    expect(a.length).toBe(103);
    expect(b.length).toBe(101);
  });

  it('has the section counts the specification lists', () => {
    const counts = new Map<string, number>();
    for (const question of QUESTIONS) {
      if (question.branch === 'b') continue;
      counts.set(question.sectionKey, (counts.get(question.sectionKey) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      digestion: 10,
      blood_sugar: 9,
      liver: 9,
      adrenals: 10,
      thyroid: 9,
      heart: 9,
      immune: 9,
      kidney: 8,
      muscles: 10,
      brain: 10,
      hormonal: 10,
    });
  });

  it('offers Does not apply to me on exactly the four questions marked DNA', () => {
    const dna = QUESTIONS.filter((question) => question.allowsDna);
    expect(dna.map((question) => question.questionRef).sort()).toEqual([
      'HA1',
      'HA2',
      'HA6',
      'L2',
    ]);
    // Every one of them names its own words, which is what the database
    // check constraint also insists on.
    for (const question of dna) expect(question.dnaLabel).toBeTruthy();
    expect(dna.find((q) => q.questionRef === 'L2')?.dnaLabel).toBe('I do not drink');
    expect(dna.find((q) => q.questionRef === 'HA1')?.dnaLabel).toBe('I no longer have a cycle');
  });

  it('asks one symptom per question, with no compound question anywhere', () => {
    // A compound question is what the specification's first global rule
    // bans. The tell it bans is an "A, B, or C" list of separate symptoms.
    for (const question of QUESTIONS) {
      expect(question.prompt).not.toMatch(/\ba, b, or c\b/i);
    }
  });
});

describe('the one answer scale', () => {
  it('is the five options with the specification weights', () => {
    expect(SCALE.map((option) => [option.label, option.points])).toEqual([
      ['Never', 0],
      ['Rarely', 1],
      ['Sometimes', 3],
      ['Often', 6],
      ['Almost always', 8],
    ]);
  });

  it('calls Often and Almost always elevated, and nothing else', () => {
    expect(SCALE.filter((option) => option.isElevated).map((option) => option.valueKey)).toEqual([
      'often',
      'almost_always',
    ]);
  });
});

describe('the three loudness bands', () => {
  it('cut at 15 and 35, with the specification labels and status lines', () => {
    expect(BANDS.map((band) => [band.bandKey, band.minPercent, band.maxPercent])).toEqual([
      ['quiet', 0, 15],
      ['showing_up', 15, 35],
      ['speaking_loudly', 35, null],
    ]);
    expect(BANDS.map((band) => band.memberLabel)).toEqual([
      'Quiet',
      'Showing up',
      'Speaking loudly',
    ]);
    expect(BANDS[0]!.memberStatusLine).toBe(
      'Quiet. Signals here are barely showing up right now.'
    );
    expect(BANDS[1]!.memberStatusLine).toBe(
      'Showing up. Some signals here are making themselves known.'
    );
    expect(BANDS[2]!.memberStatusLine).toBe(
      'Speaking loudly. Signals here are showing up strongly and often.'
    );
  });
});

describe('the red flag layer', () => {
  it('is the six questions, at the two levels the specification assigns', () => {
    expect(RED_FLAGS.map((flag) => [flag.level, flag.prompt])).toEqual([
      [1, 'Have you felt pain or pressure in your chest, especially during activity?'],
      [1, 'Have you fainted or blacked out?'],
      [1, 'Have you had severe headaches, or headaches that are suddenly getting worse?'],
      [2, 'Have you noticed blood in your stool, or stool that is black?'],
      [2, 'Have you had any unexplained bleeding?'],
      [2, 'Have you lost a noticeable amount of weight without trying?'],
    ]);
  });

  it('carries both safety responses verbatim', () => {
    const one = SAFETY_LEVELS.find((level) => level.level === 1);
    const two = SAFETY_LEVELS.find((level) => level.level === 2);
    expect(one?.memberResponse).toBe(
      'Thank you for telling me. This one matters more than anything else in this survey. ' +
        'Please contact your doctor promptly, or seek urgent care if it happens again. This is ' +
        'not something coaching should work on alone. Your coach will see this and will check in with you.'
    );
    expect(two?.memberResponse).toBe(
      'Thank you for telling me. This one is outside what coaching should work on alone. ' +
        'Please bring it to your doctor soon, even if it turns out to be nothing. Your coach ' +
        'will see this too, and will check in with you about it.'
    );
  });

  it('has no points column anywhere in its schema, so nothing can weight one', () => {
    const schema = readSql(SCHEMA_SQL_PATH);
    const table = schema.slice(
      schema.indexOf('create table body_systems_red_flags'),
      schema.indexOf('create unique index body_systems_red_flags_position_idx')
    );
    expect(table).not.toMatch(/points/);
    expect(table).not.toMatch(/weight/);
    expect(table).not.toMatch(/score/);
  });
});

describe('the copy table', () => {
  it('has a row for every key the code asks for', () => {
    const seeded = new Set(COPY_ROWS.map((row) => row.key));
    const missing = [...MEMBER_COPY_KEYS, ...COACH_COPY_KEYS].filter((key) => !seeded.has(key));
    expect(missing, `Copy keys with no seeded row: ${missing.join(', ')}`).toEqual([]);
  });

  it('seeds nothing nobody asks for', () => {
    const asked = new Set<string>([...MEMBER_COPY_KEYS, ...COACH_COPY_KEYS]);
    const orphans = COPY_ROWS.filter((row) => !asked.has(row.key)).map((row) => row.key);
    expect(orphans, `Seeded copy nothing reads: ${orphans.join(', ')}`).toEqual([]);
  });

  it('files every key under the audience its prefix claims', () => {
    for (const row of COPY_ROWS) {
      expect(row.key.startsWith(`${row.audience}.`)).toBe(true);
    }
  });

  it('carries the closing line and the coverage note verbatim', () => {
    const closing = COPY_ROWS.find((row) => row.key === 'member.results_closing');
    expect(closing?.value).toBe(
      "Your coach has the full picture. This is where you'll start together."
    );
    const coverage = COPY_ROWS.find((row) => row.key === 'coach.coverage_note');
    expect(coverage?.value).toBe(
      'This section is loud, and no defined pattern matched. Review the top-contributing answers directly.'
    );
  });
});

describe('the editable thresholds', () => {
  it('include the retake move threshold', () => {
    expect(SETTINGS['compare.min_delta_percent']).toBe(1);
  });
});

describe('the association library', () => {
  it('is the thirty eight approved entries', () => {
    expect(LIBRARY.length).toBe(38);
  });

  it('gives the two Hormonal Health families their own branch', () => {
    const a = LIBRARY.filter((entry) => entry.branch === 'a').map((entry) => entry.entryCode);
    const b = LIBRARY.filter((entry) => entry.branch === 'b').map((entry) => entry.entryCode);
    expect(a).toEqual(['HA-1', 'HA-2', 'HA-3']);
    expect(b).toEqual(['HB-1', 'HB-2']);
  });

  it('leaves the three cross system meta patterns unattached to a section', () => {
    const loose = LIBRARY.filter((entry) => entry.sectionKey === null).map((e) => e.entryCode);
    expect(loose).toEqual(['X-1', 'X-2', 'X-3']);
  });

  it('names only real questions and real sections in every trigger', () => {
    const refs = new Set(QUESTIONS.map((question) => question.questionRef));
    const sections = new Set(SECTIONS.map((section) => section.sectionKey));
    const bands = new Set(BANDS.map((band) => band.bandKey));

    const walk = (trigger: unknown, code: string): void => {
      const value = trigger as Record<string, unknown>;
      for (const ref of (value.questions as string[] | undefined) ?? []) {
        expect(refs.has(ref), `${code} names an unknown question ${ref}`).toBe(true);
      }
      for (const key of (value.sections as string[] | undefined) ?? []) {
        expect(sections.has(key), `${code} names an unknown section ${key}`).toBe(true);
      }
      if (typeof value.band === 'string') {
        expect(bands.has(value.band), `${code} names an unknown band ${value.band}`).toBe(true);
      }
      for (const nested of (value.conditions as unknown[] | undefined) ?? []) walk(nested, code);
    };

    for (const entry of LIBRARY) walk(entry.trigger, entry.entryCode);
  });
});

describe('no em dash and no en dash anywhere in the stored content', () => {
  // The app wide source guard cannot see a database row, and this content
  // is entirely database rows, so the migrations themselves are scanned.
  it.each(BODY_SYSTEMS_SQL_PATHS)('%s is clean', (file) => {
    const sql = readSql(file);
    expect(sql.includes(EM_DASH), 'em dash found').toBe(false);
    expect(sql.includes(EN_DASH), 'en dash found').toBe(false);
  });
});
