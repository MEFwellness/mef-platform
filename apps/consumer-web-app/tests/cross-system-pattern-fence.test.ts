/**
 * THE FENCE AROUND THE MATCHING ENGINE, and the schema under it.
 *
 * Everything this feature produces is coach only. A member must never see
 * a pattern, a possible association, a coaching consideration or any
 * cross-system language at all, in a screen or in a payload. "No member
 * component prints it" is an intention; this file makes it a fact, four
 * ways, because each catches something the others cannot:
 *
 *   1. THE DATABASE. Migration 245's two tables carry no member policy of
 *      any kind, and no write policy for anybody, so a member session
 *      reads nothing and a coach cannot manufacture a match by hand.
 *   2. THE IMPORT GRAPH. Every member surface is followed through its own
 *      imports and the engine must be unreachable from all of them.
 *   3. THE NAMING. Everything this migration creates carries the
 *      cross_system prefix, and it alters nothing belonging to another
 *      feature. The Body Systems Survey is untouched.
 *   4. IT IS NOT VACUOUS. The coach's own panel is walked too, and it must
 *      be able to reach exactly what a member surface may not.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import {
  EMERGING_DISPLAY_LINE,
  PATTERN_CARD_BLOCKS,
  SAFETY_SUPPRESSION_ACTION,
  SAFETY_SUPPRESSION_BODY,
  SAFETY_SUPPRESSION_HEADING,
  STRONGER_DISPLAY_LINE,
} from '@/lib/cross-system-patterns/copy';
import { MOVEMENT_LINES } from '@/lib/cross-system-patterns/timeline';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const SCHEMA = fs.readFileSync(
  path.join(MIGRATIONS, '00000000000245_cross_system_pattern_matches.sql'),
  'utf8'
);

const TABLES = ['cross_system_pattern_matches', 'cross_system_pattern_match_signals'];

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

/**
 * Every string, template chunk and JSX text node in a file.
 *
 * THE COMPILER, NOT A GREP, the same instrument the em dash guard and the
 * Relationship Library's copy lint use, and for the same reason: what
 * matters is what a file can SHIP, and a comment explaining which block a
 * count belongs to is stripped by the compiler and reaches no payload.
 */
function renderedStrings(relative: string): string[] {
  const sourceFile = ts.createSourceFile(
    relative,
    read(relative),
    ts.ScriptTarget.Latest,
    true,
    relative.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      if (node.text.trim().length > 0) out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

// ---------------------------------------------------------------------
// 1. The database
// ---------------------------------------------------------------------

describe('the ledger is coach only, in the database rather than by convention', () => {
  it.each(TABLES)('%s exists and has row level security on', (table) => {
    expect(SCHEMA).toContain(`create table ${table} (`);
    expect(SCHEMA).toContain(`alter table ${table} enable row level security;`);
  });

  it('every policy is gated on an active staff role, so a member session passes none', () => {
    const policies = [...SCHEMA.matchAll(/create policy\s+(\w+)\s+on\s+(\w+)([\s\S]*?);/g)];
    expect(policies.length).toBeGreaterThanOrEqual(4);
    for (const [, name, table, body] of policies) {
      expect(table, `${name} is on ${table}`).toMatch(/^cross_system_/);
      const clause = body!.replace(/\s+/g, ' ');
      expect(
        /has_active_role\(auth\.uid\(\), '(coach|platform_administrator)'\)/.test(clause),
        `${name} on ${table} is not gated on a staff role`
      ).toBe(true);
      // The one thing that would make a coach only table not coach only.
      expect(clause, `${name} compares auth.uid() to a member id`).not.toMatch(/auth\.uid\(\)\s*=\s*member_id/);
    }
  });

  it('there is no member policy of any kind', () => {
    expect(SCHEMA).not.toMatch(/create policy member_\w+ on cross_system/);
  });

  it.each(TABLES)('%s carries no write policy for anybody, coach included', (table) => {
    for (const verb of ['insert', 'update', 'delete', 'all']) {
      const pattern = new RegExp(`create policy \\w+ on ${table}\\s+for ${verb}`);
      expect(SCHEMA, `${table} has a ${verb} policy`).not.toMatch(pattern);
    }
  });

  it('a match cannot exist without the version it read', () => {
    const table = SCHEMA.slice(
      SCHEMA.indexOf('create table cross_system_pattern_matches ('),
      SCHEMA.indexOf('create index cross_system_pattern_matches_member_idx')
    );
    expect(table).toContain('version_id uuid not null references cross_system_relationship_versions(id)');
    expect(table).toContain('version_number integer not null');
    expect(table).toContain('unique (member_id, relationship_id)');
  });

  it('a contribution cannot exist without the signal row it points at', () => {
    const table = SCHEMA.slice(SCHEMA.indexOf('create table cross_system_pattern_match_signals ('));
    expect(table).toContain('signal_id uuid not null references cross_system_signals(id) on delete cascade');
    expect(table).toContain("role text not null check (role in ('primary', 'related', 'support'))");
  });

  it('the strength a card printed is stored, and it is one of exactly two', () => {
    expect(SCHEMA).toContain("strength text not null check (strength in ('emerging', 'stronger'))");
  });

  it('holds no column that could carry a diagnosis, a score or a confidence', () => {
    const columns = [...SCHEMA.matchAll(/\n {2}(\w+) (?:text|uuid|integer|numeric|boolean|timestamptz)/g)].map(
      ([, name]) => name!
    );
    expect(columns.length).toBeGreaterThan(15);
    for (const forbidden of [
      'diagnosis',
      'condition',
      'cause',
      'disease',
      'severity',
      'confidence',
      'score',
      'total',
      'percent',
      'risk',
    ]) {
      expect(
        columns.some((column) => column.split('_').includes(forbidden)),
        `a column is named after ${forbidden}`
      ).toBe(false);
    }
  });

  it('says out loud that it is not a diagnostic engine', () => {
    expect(SCHEMA.toLowerCase()).toContain('this is not a diagnostic engine');
  });
});

// ---------------------------------------------------------------------
// 3. The naming, and the assessment it does not touch
// ---------------------------------------------------------------------

describe('nothing in this migration can be confused with another feature', () => {
  it('every table, index and policy created here carries the cross_system prefix', () => {
    for (const [, name] of SCHEMA.matchAll(/create table (\w+)/g)) {
      expect(name, `table ${name}`).toMatch(/^cross_system_/);
    }
    for (const [, name] of SCHEMA.matchAll(/create (?:unique )?index (\w+)/g)) {
      expect(name, `index ${name}`).toMatch(/^cross_system_/);
    }
    for (const [, name] of SCHEMA.matchAll(/create policy (\w+)/g)) {
      expect(name, `policy ${name}`).toMatch(/cross_system/);
    }
  });

  it('creates, alters or drops nothing belonging to another feature', () => {
    for (const [, verb, target] of SCHEMA.matchAll(/\n(alter|drop) table (?:if exists )?(\w+)/g)) {
      expect(target, `${verb} ${target}`).toMatch(/^cross_system_/);
    }
  });

  it('touches no questionnaire table at all, so the existing scores stand', () => {
    for (const table of [
      'member_body_systems_sessions',
      'body_systems_scale_options',
      'body_systems_bands',
      'body_systems_red_flags',
      'whole_body_signal_sessions',
    ]) {
      expect(SCHEMA, `the migration mentions ${table}`).not.toContain(table);
    }
  });

  it('the engine changes nothing about the Body Systems Survey red flag layer', () => {
    // It reads it. It never writes to it and never redefines a flag.
    const safety = read('lib/cross-system-patterns/safety.ts');
    expect(safety).toContain('firedRedFlags');
    for (const forbidden of ['insert', 'update', 'delete', 'upsert']) {
      expect(safety.toLowerCase(), forbidden).not.toContain(`.${forbidden}(`);
    }
  });
});

// ---------------------------------------------------------------------
// 2 and 4. The import graph
// ---------------------------------------------------------------------

describe('no member surface can reach the matching engine', () => {
  /** Every member facing entry point that could plausibly sit near this data. */
  const MEMBER_SURFACES = [
    'app/dashboard/page.tsx',
    'app/body-systems/page.tsx',
    'app/assessments/wbsa/results/[sessionId]/page.tsx',
    'app/actions/bodySystems.ts',
    'app/actions/wholeBodySignal.ts',
    'app/actions/breathingCheckIn.ts',
    'app/actions/checkin.ts',
    'app/actions/body-assessment.ts',
    'components/body-systems/BodySystemsExperience.tsx',
    'app/api/body-systems/progress/route.ts',
  ];

  /**
   * THE RENDERING HALF. These build the card, say the sentences and serve
   * the coach's read, and a member surface must not be able to reach one.
   */
  const RENDERING_HALF = [
    'lib/cross-system-patterns/copy.ts',
    'lib/cross-system-patterns/view.ts',
    'lib/cross-system-patterns/timeline.ts',
    'app/actions/crossSystemPatterns.ts',
    'app/coach/clients/[id]/WholeBodyPatternsPanel.tsx',
  ];

  /**
   * THE EVALUATION HALF, which a member surface CAN reach, on purpose.
   *
   * Ingesting her finished sitting is the first of the three
   * re-evaluation triggers, so her own submit runs through the matcher and
   * the ledger. Saying otherwise would be a test that describes a fence
   * this build does not have. What makes that safe is the case below it:
   * not one of these modules holds a word about a pattern.
   */
  const EVALUATION_HALF = [
    'lib/cross-system-patterns/evaluate.ts',
    'lib/cross-system-patterns/serviceRole.ts',
    'lib/cross-system-patterns/match.ts',
    'lib/cross-system-patterns/data.ts',
    'lib/cross-system-patterns/constants.ts',
    'lib/cross-system-patterns/types.ts',
  ];

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

  it('is following real files, so a typo in any list fails rather than passes silently', () => {
    for (const file of [...MEMBER_SURFACES, ...RENDERING_HALF, ...EVALUATION_HALF]) {
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
    }
  });

  it('cannot reach the copy, the card, the timeline, the coach read or the panel', () => {
    for (const surface of MEMBER_SURFACES) {
      const reachable = reachableFrom(surface);
      for (const file of RENDERING_HALF) {
        expect(reachable.has(file), `${surface} can reach ${file}`).toBe(false);
      }
    }
  });

  it('reaches nothing of this feature except the evaluation half', () => {
    for (const surface of MEMBER_SURFACES) {
      for (const file of reachableFrom(surface)) {
        if (!file.startsWith('lib/cross-system-patterns/')) continue;
        expect(EVALUATION_HALF, `${surface} reaches ${file}`).toContain(file);
      }
    }
  });

  /**
   * THE CLAIM THAT MATTERS, and the reason the copy was split out of the
   * constants at all: a member's own submit runs through the matcher, so
   * the matcher must hold no sentence. Every string this feature can put
   * in front of a coach is searched for, character for character, in every
   * file a member surface can reach.
   */
  it('NOT ONE WORD A COACH READS is reachable from a member surface', () => {
    const reachable = new Set<string>();
    for (const surface of MEMBER_SURFACES) {
      for (const file of reachableFrom(surface)) {
        if (file.startsWith('lib/cross-system-patterns/')) reachable.add(file);
      }
    }
    expect(reachable.size).toBeGreaterThan(0);

    const COACH_FACING = [
      EMERGING_DISPLAY_LINE,
      STRONGER_DISPLAY_LINE,
      SAFETY_SUPPRESSION_HEADING,
      SAFETY_SUPPRESSION_BODY,
      SAFETY_SUPPRESSION_ACTION,
      ...PATTERN_CARD_BLOCKS.map((block) => block.title),
      ...Object.values(MOVEMENT_LINES),
      'Possible Association',
      'Coaching Considerations',
      'Root identified',
      'cross-system pattern',
      'whole-body pattern',
      'supporting signals',
      'observed together',
      'may be relevant',
      'worth exploring',
    ];

    for (const file of reachable) {
      const strings = renderedStrings(file).map((value) => value.toLowerCase());
      for (const phrase of COACH_FACING) {
        const needle = phrase.toLowerCase();
        const hit = strings.find((value) => value.includes(needle));
        expect(hit, `${file} ships coach facing wording: "${phrase}"`).toBeUndefined();
      }
    }
  });

  it('is not vacuous: those strings really are shipped by the rendering half', () => {
    const rendering = RENDERING_HALF.flatMap(renderedStrings).join('\n');
    for (const phrase of [
      EMERGING_DISPLAY_LINE,
      STRONGER_DISPLAY_LINE,
      SAFETY_SUPPRESSION_HEADING,
      'Possible Association',
      'Coaching Considerations',
      'Root identified',
    ]) {
      expect(rendering, phrase).toContain(phrase);
    }
  });

  it('the coach panel CAN reach it, so this guard is not vacuous either', () => {
    const reachable = reachableFrom('app/coach/clients/[id]/WholeBodyPatternsPanel.tsx');
    expect(reachable.has('lib/cross-system-patterns/view.ts')).toBe(true);
    expect(reachable.has('lib/cross-system-patterns/timeline.ts')).toBe(true);
    expect(reachable.has('lib/cross-system-patterns/copy.ts')).toBe(true);
  });

  it('nothing outside a coach or admin route imports the engine', () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const relative = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(relative);
        else if (/\.tsx?$/.test(entry.name) && read(relative).includes('cross-system-patterns')) {
          hits.push(relative);
        }
      }
    };
    walk('app');
    walk('components');
    expect(hits.length).toBeGreaterThan(0);

    const ALLOWED = [
      // The engine's own coach read, guarded above.
      'app/actions/crossSystemPatterns.ts',
      // The two re-evaluation triggers that live in action files by this
      // codebase's convention, each of which establishes a coach first.
      'app/actions/crossSystemSignals.ts',
      'app/actions/crossSystemRelationships.ts',
    ];
    for (const hit of hits) {
      const isCoachSurface = hit.startsWith('app/coach/') || hit.startsWith('app/admin/');
      expect(
        isCoachSurface || ALLOWED.includes(hit),
        `${hit} reaches the matching engine from outside a coach surface`
      ).toBe(true);
    }
  });

  it('the member facing half of the Signal Library still only touches ingestion', () => {
    // lib/cross-system-signals/service.ts is reached from a member's own
    // submit. It may re-evaluate; it may not build a card.
    const service = read('lib/cross-system-signals/service.ts');
    expect(service).toContain('evaluateMember');
    for (const forbidden of ['buildWholeBodyPatternsView', 'buildPatternCard', 'matchMemberSignals']) {
      expect(service, forbidden).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------
// The section is on the coach's page and nowhere else
// ---------------------------------------------------------------------

describe('the section is indexed on the coach page and reachable from it', () => {
  const PAGE = read('app/coach/clients/[id]/detail/page.tsx');
  const SECTIONS = read('lib/coach-detail/sections.ts');

  it('renders the section and the card at the ids the table of contents names', () => {
    expect(PAGE).toContain('detail-section-whole-body-patterns');
    expect(PAGE).toContain('detail-card-whole-body-patterns');
    expect(SECTIONS).toContain('WHOLE_BODY_PATTERNS_SECTION_ID');
    expect(SECTIONS).toContain('WHOLE_BODY_PATTERNS_CARD_ID');
  });

  it('sits directly after Signals, which is the store it reads', () => {
    const signals = PAGE.indexOf('detail-section-cross-system-signals');
    const patterns = PAGE.indexOf('detail-section-whole-body-patterns');
    const health = PAGE.indexOf('detail-section-health-context');
    expect(signals).toBeLessThan(patterns);
    expect(patterns).toBeLessThan(health);
  });

  it('the questionnaire cards above it are untouched', () => {
    // The Body Systems Survey card is still rendered, in the section it
    // was in, by the same component.
    expect(PAGE).toContain('<BodySystemsPanel state={bodySystemsPanel} />');
    expect(PAGE).toContain('detail-card-body-systems');
  });
});
