/**
 * The content this instrument is made of, checked against the migrations
 * that seed it.
 *
 * WHAT THIS FILE IS FOR. Every word and every number is a database row, so
 * the two facts that can silently drift are (a) a key the code asks for
 * that no migration seeds, and (b) a row nobody asks for. Both are caught
 * here. So is the punctuation rule, over the SQL itself, because the em
 * dash guard walks TypeScript and cannot see a sentence stored in a
 * migration.
 *
 * IT IS ALSO WHERE THE SPECIFICATION'S OWN NUMBERS LIVE. The band cut
 * offs, the three Signal Load weights and the two secondary Zone
 * thresholds are asserted against the approved values, so retuning one is
 * a deliberate change to a test rather than a silent change to a reading.
 */

import { describe, it, expect } from 'vitest';
import {
  COACH_COPY_KEYS,
  MEMBER_COPY_KEYS,
} from '../lib/whole-body-signal/copyKeys';
import { DEFAULT_SETTINGS, SETTING_KEYS } from '../lib/whole-body-signal/settings';
import { WBS_DEFINITION_ID, WBS_KEY, WBS_LABEL } from '../lib/whole-body-signal/constants';
import {
  BANDS,
  BRANCH_RULES,
  COACH_COPY,
  COACHING_LIBRARY,
  COPY_ROWS,
  MEMBER_COPY,
  PATTERNS,
  QUESTIONS,
  readSql,
  ROUTING_OPTIONS,
  SCALE,
  SECTIONS,
  SETTING_ROWS,
  WBS_SCHEMA_SQL_PATH,
  WBS_SQL_PATHS,
  ZONES,
} from './whole-body-signal-fixture';

const EM_DASH = '—';

describe('the shape of the instrument', () => {
  it('has nine sections, in one fixed order', () => {
    expect(SECTIONS.length).toBe(9);
    expect(SECTIONS.map((section) => section.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(SECTIONS.map((section) => section.displayName)).toEqual([
      'Fuel Quality',
      'Fuel Rhythm',
      'Digestive Flow',
      'Gut Environment',
      'Clearance & Elimination',
      'Stress & Recovery',
      'Body Clock',
      'Hormone & Pelvic Rhythm',
      'Recovery Capacity',
    ]);
  });

  it('has the six approved Zones, with their spinal segments and chakra lenses verbatim', () => {
    expect(ZONES.map((zone) => zone.zoneKey)).toEqual([
      'zone_1',
      'zone_2',
      'zone_3',
      'zone_4',
      'zone_5',
      'zone_6',
    ]);
    expect(ZONES.map((zone) => zone.chakraLens)).toEqual([
      'Root',
      'Sacral',
      'Solar Plexus',
      'Heart',
      'Throat',
      'Third Eye',
    ]);
    expect(ZONES[0]!.spinalSegments).toBe('L1 to L5 + Sacral Plexus');
    expect(ZONES[5]!.spinalSegments).toBe('C1 to C2 (Cerebral)');
    expect(ZONES[2]!.organGlandList).toBe(
      'Pancreas, Adrenals, Digestive System, Muscles of Body, Liver and Gall Bladder'
    );
  });

  it('has the four approved bands, at the approved cut offs, with the approved words', () => {
    expect(BANDS.map((band) => [band.memberLabel, band.minPercent, band.maxPercent])).toEqual([
      ['Quiet', 0, 25],
      ['Showing Up', 25, 50],
      ['Speaking Loudly', 50, 75],
      ['Asking for Priority', 75, null],
    ]);
    expect(BANDS.map((band) => band.memberLine)).toEqual([
      'Few signals are showing up here right now.',
      'There are some patterns worth paying attention to.',
      'Several responses suggest this area deserves attention.',
      'This area is showing up strongly in your current picture.',
    ]);
    expect(BANDS.map((band) => band.coachColor)).toEqual(['green', 'yellow', 'orange', 'red']);
  });

  it('labels every bar with one of the three plain intensity words', () => {
    for (const band of BANDS) {
      expect(['Mild', 'Moderate', 'Strong']).toContain(band.memberIntensityWord);
    }
  });

  it('has ninety six questions, each in a real section and tagged to real Zones', () => {
    expect(QUESTIONS.length).toBe(96);
    const sectionKeys = new Set(SECTIONS.map((section) => section.sectionKey));
    const zoneKeys = new Set(ZONES.map((zone) => zone.zoneKey));
    for (const question of QUESTIONS) {
      expect(sectionKeys.has(question.sectionKey)).toBe(true);
      expect(zoneKeys.has(question.primaryZoneKey)).toBe(true);
      if (question.secondaryZoneKey) expect(zoneKeys.has(question.secondaryZoneKey)).toBe(true);
      if (question.feedsSectionKey) expect(sectionKeys.has(question.feedsSectionKey)).toBe(true);
    }
  });

  it('never tags a question to the same Zone twice, which would inflate that Zone silently', () => {
    for (const question of QUESTIONS) {
      if (question.secondaryZoneKey) {
        expect(question.secondaryZoneKey).not.toBe(question.primaryZoneKey);
      }
    }
  });

  it('gives every question a coach topic, an organ or gland, and a plain member theme', () => {
    for (const question of QUESTIONS) {
      expect(question.coachTopic.length).toBeGreaterThan(0);
      expect(question.organGland.length).toBeGreaterThan(0);
      expect(question.memberTheme.length).toBeGreaterThan(0);
    }
  });

  it('numbers each section from one with no gaps and no repeats', () => {
    for (const section of SECTIONS) {
      const positions = QUESTIONS.filter((q) => q.sectionKey === section.sectionKey)
        .map((q) => q.position)
        .sort((a, b) => a - b);
      expect(positions).toEqual(positions.map((_, index) => index + 1));
    }
  });

  it('has one branch rule per routing option, naming only real questions', () => {
    expect(ROUTING_OPTIONS.length).toBe(6);
    expect(BRANCH_RULES.length).toBe(ROUTING_OPTIONS.length);
    const refs = new Set(QUESTIONS.map((question) => question.questionRef));
    for (const rule of BRANCH_RULES) {
      expect(ROUTING_OPTIONS.some((option) => option.optionKey === rule.optionKey)).toBe(true);
      for (const ref of rule.questionRefs) expect(refs.has(ref)).toBe(true);
    }
  });

  it('marks exactly one Prefer not to answer routing option', () => {
    expect(ROUTING_OPTIONS.filter((option) => option.isPnta).map((o) => o.optionKey)).toEqual([
      'prefer_not',
    ]);
  });

  it('has the five point scale with both of its point maps stored', () => {
    expect(SCALE.length).toBe(5);
    for (const option of SCALE) {
      expect(option.directPoints + option.reversePoints).toBe(4);
    }
  });
});

describe('the copy rows and the keys that ask for them', () => {
  it('seeds a row for every member key the code asks for', () => {
    for (const key of MEMBER_COPY_KEYS) {
      expect(MEMBER_COPY[key], `no member copy row for ${key}`).toBeTruthy();
    }
  });

  it('seeds a row for every coach key the code asks for', () => {
    for (const key of COACH_COPY_KEYS) {
      expect(COACH_COPY[key], `no coach copy row for ${key}`).toBeTruthy();
    }
  });

  it('asks for every row it seeds, so a stored sentence nothing prints is caught', () => {
    const asked = new Set<string>([...MEMBER_COPY_KEYS, ...COACH_COPY_KEYS]);
    for (const row of COPY_ROWS) {
      expect(asked.has(row.key), `nothing asks for ${row.key}`).toBe(true);
    }
  });

  it('files every key under the audience its prefix claims', () => {
    for (const row of COPY_ROWS) {
      expect(row.key.startsWith(`${row.audience}.`)).toBe(true);
    }
  });

  it('carries the approved member lines verbatim', () => {
    expect(MEMBER_COPY['member.popup_body']).toBe(
      'Your coach asked Root to take a deeper look with you on this one.'
    );
    expect(MEMBER_COPY['member.card_body']).toBe(
      'A deeper look at the patterns your body has been giving you.'
    );
    expect(MEMBER_COPY['member.intro_line_3']).toBe(
      'Answer based on how you have generally felt over the last 8 to 12 weeks, not just today.'
    );
    expect(MEMBER_COPY['member.transition_micro_line']).toBe(
      'Answer based on what happens most often.'
    );
    expect(MEMBER_COPY['member.results_heading']).toBe('Your Whole-Body Signal Picture');
    expect(MEMBER_COPY['member.results_intro']).toBe(
      'Some areas are quieter. Others are asking for more attention.'
    );
    expect(MEMBER_COPY['member.closing_line_1']).toBe(
      'You do not need to work on everything at once.'
    );
    expect(MEMBER_COPY['member.results_done']).toBe('Return Home');
  });

  it('NEVER PUTS A NUMBER, A COLOUR, A ZONE, AN ORGAN OR A CHAKRA IN A MEMBER LINE', () => {
    const banned = [
      /\bzone\b/i,
      /\bchakra\b/i,
      /\bgland\b/i,
      /\bspinal\b/i,
      /\bpercent\b/i,
      /%/,
      /\bgreen\b/i,
      /\byellow\b/i,
      /\borange\b/i,
      /\bred\b/i,
      /\badrenal/i,
      /\bthyroid\b/i,
      /\bpancreas\b/i,
      /\bgonad/i,
      /\bpituitary\b/i,
      /\bpineal\b/i,
    ];
    for (const [key, value] of Object.entries(MEMBER_COPY)) {
      for (const pattern of banned) {
        expect(pattern.test(value), `${key} says "${value}"`).toBe(false);
      }
    }
  });

  it('never puts a score in a member line, and never compares her to anybody', () => {
    for (const [key, value] of Object.entries(MEMBER_COPY)) {
      expect(/\b\d+\s*%/.test(value), `${key}`).toBe(false);
      expect(/percentile|average|compared to|better than|worse than|grade/i.test(value), key).toBe(
        false
      );
    }
  });
});

describe('the editable numbers', () => {
  it('seeds a row for every setting the code reads', () => {
    for (const key of Object.values(SETTING_KEYS)) {
      expect(SETTING_ROWS[key], `no setting row for ${key}`).toBeTypeOf('number');
    }
  });

  it('reads for every row it seeds', () => {
    const asked = new Set(Object.values(SETTING_KEYS));
    for (const key of Object.keys(SETTING_ROWS)) {
      expect(asked.has(key), `nothing reads ${key}`).toBe(true);
    }
  });

  it('agrees with the fallbacks in code, so a missing row degrades to the approved behaviour', () => {
    for (const [name, key] of Object.entries(SETTING_KEYS)) {
      expect(SETTING_ROWS[key], name).toBe(DEFAULT_SETTINGS[name as keyof typeof DEFAULT_SETTINGS]);
    }
  });

  it('holds the specification numbers', () => {
    expect(SETTING_ROWS['load.weight_a']).toBe(0.6);
    expect(SETTING_ROWS['load.weight_b']).toBe(0.25);
    expect(SETTING_ROWS['load.weight_c']).toBe(0.15);
    expect(SETTING_ROWS['load.elevated_min_percent']).toBe(50);
    expect(SETTING_ROWS['load.top_component_count']).toBe(3);
    expect(SETTING_ROWS['zone.secondary_min_percent']).toBe(25);
    expect(SETTING_ROWS['zone.secondary_min_ratio']).toBe(0.6);
    expect(SETTING_ROWS['coaching.max_questions']).toBe(6);
  });
});

describe('the practitioner library', () => {
  it('has the eight approved cross section patterns, with their copy verbatim', () => {
    expect(PATTERNS.map((pattern) => pattern.title)).toEqual([
      'Stress and Digestion Axis',
      'Rhythm Disruption Cluster',
      'Depletion Pattern',
      'Elimination Chain',
      'Gut History Echo',
      'Fuel Instability',
      'Hormone and Sleep Link',
      'Whole-System Load',
    ]);
    expect(PATTERNS[0]!.coachText).toBe(
      'Stress and digestion are elevated together. The nervous system and the digestive system are likely feeding each other.'
    );
    expect(PATTERNS[7]!.coachText).toBe(
      'Signals are widespread rather than concentrated. Prioritize capacity and foundations before chasing any single area.'
    );
  });

  it('names only real sections in every pattern rule', () => {
    const sectionKeys = new Set(SECTIONS.map((section) => section.sectionKey));
    for (const pattern of PATTERNS) {
      if (pattern.rule.type !== 'sections_at_or_above') continue;
      for (const key of pattern.rule.sections) expect(sectionKeys.has(key), key).toBe(true);
    }
  });

  it('LEAVES THE THRESHOLD OUT OF EVERY RULE, so the number lives in one place', () => {
    for (const pattern of PATTERNS) {
      expect(pattern.rule.minPercent, pattern.patternKey).toBeUndefined();
    }
  });

  it('has fifty three coaching questions across the four trigger types', () => {
    expect(COACHING_LIBRARY.length).toBe(53);
    const byType = COACHING_LIBRARY.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.triggerType] = (counts[entry.triggerType] ?? 0) + 1;
      return counts;
    }, {});
    expect(byType).toEqual({ combination: 10, answer: 22, zone: 6, section: 15 });
  });

  it('names only real sections, questions and Zones in every coaching trigger', () => {
    const sectionKeys = new Set(SECTIONS.map((section) => section.sectionKey));
    const refs = new Set(QUESTIONS.map((question) => question.questionRef));
    const zoneKeys = new Set(ZONES.map((zone) => zone.zoneKey));
    for (const entry of COACHING_LIBRARY) {
      const trigger = entry.trigger;
      if (trigger.type === 'section') expect(sectionKeys.has(trigger.section), entry.questionKey).toBe(true);
      if (trigger.type === 'sections_at_or_above') {
        for (const key of trigger.sections) expect(sectionKeys.has(key), entry.questionKey).toBe(true);
      }
      if (trigger.type === 'answer') {
        for (const ref of trigger.questions) expect(refs.has(ref), entry.questionKey).toBe(true);
      }
      if (trigger.type === 'primary_zone') expect(zoneKeys.has(trigger.zone), entry.questionKey).toBe(true);
    }
  });

  it('gives every Zone a coaching question, so no primary Zone ever surfaces bare', () => {
    const covered = new Set(
      COACHING_LIBRARY.filter((entry) => entry.trigger.type === 'primary_zone').map((entry) =>
        entry.trigger.type === 'primary_zone' ? entry.trigger.zone : ''
      )
    );
    for (const zone of ZONES) expect(covered.has(zone.zoneKey), zone.zoneKey).toBe(true);
  });
});

describe('punctuation, over the stored content the source guard cannot see', () => {
  it('finds no em dash in any of this feature migrations', () => {
    for (const file of WBS_SQL_PATHS) {
      const sql = readSql(file);
      const line = sql.split('\n').findIndex((text) => text.includes(EM_DASH));
      expect(line, `${file} line ${line + 1}`).toBe(-1);
    }
  });

  it('covers every migration this feature has, found rather than listed', () => {
    expect(WBS_SQL_PATHS.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the catalog row', () => {
  it('uses the same fixed id in code and in the migration', () => {
    const schema = readSql(WBS_SCHEMA_SQL_PATH);
    expect(schema).toContain(WBS_DEFINITION_ID);
    expect(schema).toContain(`'${WBS_KEY}'`);
    expect(schema).toContain(`'${WBS_LABEL}'`);
  });

  it('IS NOT THE BODY SYSTEMS SURVEY AND NOT THE LEGACY WHOLE-BODY CHECK-IN', () => {
    // Different definition id, different tables, different bands. This is
    // the assertion that would fail if somebody ever pointed this
    // instrument at another one to save a migration.
    expect(WBS_DEFINITION_ID).not.toBe('c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4');
    const schema = readSql(WBS_SCHEMA_SQL_PATH);
    expect(schema).not.toMatch(/\balter table body_systems_/);
    expect(schema).not.toMatch(/\bdrop table\b/);
    expect(schema).not.toMatch(/\bupdate body_systems_/);
  });
});
