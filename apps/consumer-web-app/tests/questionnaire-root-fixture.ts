/**
 * THE SHIPPED FEATURE, WITH NO DATABASE: everything Root needs to read a
 * Body Systems Survey, parsed out of the migrations that deploy it.
 *
 *   the Signal Library: categories, body areas, every canonical name, the
 *     sources and the survey's question to signal dictionary (241, 247, 251);
 *   the Whole-Body Association Map, all five seed migrations, as summaries;
 *   the survey's own content and association triggers (220 to 224).
 *
 * AND A POSTGREST STAND-IN, which is what lets the real ingestion, the real
 * lookup, the real store and the real backfill run end to end. It enforces
 * the one behaviour this build must never forget: an unbounded select stops
 * at a thousand rows, silently, exactly the way production does.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SignalBodyArea,
  SignalCategory,
  SignalLibrary,
  SignalSource,
  SignalSourceMapping,
  StandardizedSignalName,
} from '@/lib/cross-system-signals/types';
import { mappingKey } from '@/lib/cross-system-signals/library';
import type {
  RelationshipComponent,
  RelationshipSummary,
} from '@/lib/cross-system-relationships/types';
import type { AssociationTriggerRow } from '@/lib/body-systems/triggerEvaluation';
import type { MemberContent } from '@/lib/body-systems/contentData';
import { buildResults } from '@/lib/body-systems/scoring';
import type { BodySystemsBranch } from '@/lib/body-systems/types';
import {
  BANDS,
  LIBRARY,
  QUESTIONS,
  RED_FLAGS,
  SAFETY_LEVELS,
  SCALE,
  SECTIONS,
} from './body-systems-fixture';
import { shippedMap, type MapComponent } from './cross-system-map-fixture';
import { head, summary, version } from './cross-system-pattern-fixture';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function sql(file: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
}

/** Split one tuple body into fields. Quote aware, doubled apostrophes understood. */
function splitFields(body: string): Array<string | null> {
  const fields: Array<string | null> = [];
  let current = '';
  let quoted = false;
  let inQuote = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (inQuote) {
      if (char === "'" && body[index + 1] === "'") {
        current += "'";
        index += 1;
      } else if (char === "'") {
        inQuote = false;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'") {
      // Whatever sat before the opening quote was only spacing.
      if (!quoted) current = '';
      inQuote = true;
      quoted = true;
      continue;
    }
    if (char === ',') {
      fields.push(quoted ? current : current.trim() === 'null' ? null : current.trim());
      current = '';
      quoted = false;
      continue;
    }
    current += char;
  }
  fields.push(quoted ? current : current.trim() === 'null' ? null : current.trim());
  return fields;
}

/** Every value tuple of every `insert into <table>` statement in a file. */
export function tuplesIn(source: string, table: string): Array<Array<string | null>> {
  const out: Array<Array<string | null>> = [];
  const lines = source
    .split('\n')
    .map((line) => {
      const at = line.indexOf('--');
      if (at >= 0 && (line.slice(0, at).match(/'/g) ?? []).length % 2 === 0) return line.slice(0, at);
      return line;
    })
    .join('\n');
  const pattern = new RegExp(`insert into\\s+${table}\\s*\\([^)]*\\)\\s*values`, 'gi');
  for (const match of lines.matchAll(pattern)) {
    let index = match.index! + match[0].length;
    let depth = 0;
    let inQuote = false;
    let current = '';
    for (; index < lines.length; index += 1) {
      const char = lines[index]!;
      if (inQuote) {
        current += char;
        if (char === "'" && lines[index + 1] === "'") {
          current += "'";
          index += 1;
        } else if (char === "'") {
          inQuote = false;
        }
        continue;
      }
      if (char === "'") {
        inQuote = true;
        current += char;
        continue;
      }
      if (char === '(') {
        depth += 1;
        if (depth === 1) {
          current = '';
          continue;
        }
      }
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          out.push(splitFields(current));
          continue;
        }
      }
      if (depth === 0 && (char === ';' || lines.startsWith('on conflict', index))) break;
      if (depth > 0) current += char;
    }
  }
  return out;
}

const VOCABULARY_FILES = [
  '00000000000241_cross_system_signal_content.sql',
  '00000000000251_cross_system_vocabulary_expansion.sql',
];

function vocabulary(table: string): Array<Array<string | null>> {
  return VOCABULARY_FILES.flatMap((file) => tuplesIn(sql(file), table));
}

const CATEGORIES: SignalCategory[] = vocabulary('cross_system_signal_categories').map((row) => ({
  categoryKey: row[0]!,
  position: Number(row[1]),
  displayName: row[2]!,
}));

const BODY_AREAS: SignalBodyArea[] = vocabulary('cross_system_body_areas').map((row) => ({
  areaKey: row[0]!,
  position: Number(row[1]),
  displayName: row[2]!,
  takesSide: row[3] !== 'false',
}));

export const REAL_NAMES: StandardizedSignalName[] = vocabulary('cross_system_signal_names').map(
  (row) => ({
    signalSlug: row[0]!,
    displayName: row[1]!,
    categoryKey: row[2]!,
    defaultBodyAreaKey: row[3] ?? null,
    defaultSymptomKey: row[4] ?? null,
    searchTerms: row[5] ?? '',
    isCoachAddable: row[6] !== 'false',
  })
);

const SOURCES: SignalSource[] = [
  ...tuplesIn(sql('00000000000241_cross_system_signal_content.sql'), 'cross_system_signal_sources'),
  ...tuplesIn(sql('00000000000247_cross_system_complaint_lexicon_seed.sql'), 'cross_system_signal_sources'),
].map((row) => ({
  sourceKey: row[0]!,
  position: Number(row[1]),
  displayName: row[2]!,
  assessmentDefinitionId: row[3] ?? null,
}));

/** Every Body Systems Survey dictionary row migration 241 ships. */
export const SURVEY_QUESTION_MAPPINGS: SignalSourceMapping[] = tuplesIn(
  sql('00000000000241_cross_system_signal_content.sql'),
  'cross_system_signal_source_map'
)
  .filter((row) => row[0] === 'body_systems_survey')
  .map((row) => ({
    sourceKey: row[0]!,
    externalKind: row[1] as SignalSourceMapping['externalKind'],
    externalKey: row[2]!,
    signalSlug: row[3]!,
    bodyAreaKey: row[4] ?? null,
  }));

export const REAL_LIBRARY: SignalLibrary = {
  categories: new Map(CATEGORIES.map((row) => [row.categoryKey, row])),
  bodyAreas: new Map(BODY_AREAS.map((row) => [row.areaKey, row])),
  symptoms: new Map(),
  names: new Map(REAL_NAMES.map((row) => [row.signalSlug, row])),
  sources: new Map(SOURCES.map((row) => [row.sourceKey, row])),
  mappings: new Map(
    SURVEY_QUESTION_MAPPINGS.map((row) => [
      mappingKey(row.sourceKey, row.externalKind, row.externalKey),
      row,
    ])
  ),
};

function components(
  list: readonly MapComponent[],
  role: RelationshipComponent['role'],
  offset: number,
  patternKey: string
): RelationshipComponent[] {
  return list.map((entry, index) => ({
    id: `${patternKey}-${role}-${index}`,
    position: offset + index,
    role,
    refKind: entry.kind,
    refKey: entry.key,
    refLabel:
      entry.kind === 'signal'
        ? (REAL_LIBRARY.names.get(entry.key)?.displayName ?? entry.key)
        : entry.kind === 'category'
          ? (REAL_LIBRARY.categories.get(entry.key)?.displayName ?? entry.key)
          : (REAL_LIBRARY.bodyAreas.get(entry.key)?.displayName ?? entry.key),
    side: null,
    valueKey: null,
    valueLabel: null,
    minValueNumeric: entry.min,
    sourceKey: null,
    sourceQuestionRef: null,
    sourceQuestionPrompt: null,
    note: null,
  }));
}

/** The shipped Whole-Body Association Map, as the lookup receives it. */
export const REAL_SUMMARIES: RelationshipSummary[] = shippedMap().map((entry, index) =>
  summary({
    head: head({ id: `rel-${entry.patternKey}`, patternKey: entry.patternKey, isActive: true, isSeeded: true }),
    current: version({
      id: `ver-${index}`,
      relationshipId: `rel-${entry.patternKey}`,
      patternName: entry.patternName,
      surfacesOnComplaint: true,
      sourceTypeKey: entry.sourceTypeKey,
      possibleAssociationText: entry.association,
      components: [
        ...components(entry.primaries, 'primary', 0, entry.patternKey),
        ...components(entry.related, 'related', entry.primaries.length, entry.patternKey),
        ...components(
          entry.support,
          'support',
          entry.primaries.length + entry.related.length,
          entry.patternKey
        ),
      ],
      considerations: entry.considerations.map((body, position) => ({
        id: `${entry.patternKey}-c-${position}`,
        position,
        body,
      })),
    }),
  })
);

/** The survey's content bundle, exactly as its own screens load it. */
export const SURVEY_CONTENT: MemberContent = {
  sections: SECTIONS,
  questions: QUESTIONS,
  scale: SCALE,
  bands: BANDS,
  redFlags: RED_FLAGS,
  safetyLevels: SAFETY_LEVELS,
  copy: {},
  minDeltaPercent: 1,
};

/** The association triggers, with no wording, as the Signal Library loads them. */
export const SURVEY_TRIGGERS: AssociationTriggerRow[] = LIBRARY.map((entry) => ({
  entryCode: entry.entryCode,
  position: entry.position,
  branch: entry.branch,
  trigger: entry.trigger,
}));

export const MEMBER_ID = '00000000-0000-4000-8000-00000000abcd';
export const TIMEZONE = 'America/New_York';

/** A sitting row the way member_body_systems_sessions stores it. */
export function sittingRow(input: {
  id: string;
  memberId?: string;
  branch?: BodySystemsBranch;
  answers: Record<string, string>;
  redFlags?: Record<string, boolean>;
  completedAt: string | null;
}): Record<string, unknown> {
  const branch = input.branch ?? 'b';
  const results =
    input.completedAt === null
      ? null
      : buildResults({
          sections: SECTIONS,
          questions: QUESTIONS,
          scale: SCALE,
          bands: BANDS,
          answers: input.answers,
          branch,
        });
  return {
    id: input.id,
    member_id: input.memberId ?? MEMBER_ID,
    assignment_id: null,
    content_version: 1,
    branch,
    answers: input.answers,
    red_flag_answers: input.redFlags ?? {},
    results,
    progress: { stepIndex: 0 },
    started_at: input.completedAt ?? '2026-09-01T12:00:00.000Z',
    completed_at: input.completedAt,
    created_at: input.completedAt ?? '2026-09-01T12:00:00.000Z',
  };
}

/** Every question on a branch answered Never, then the named ones overridden. */
export function answers(
  overrides: Record<string, string>,
  branch: BodySystemsBranch = 'b'
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const question of QUESTIONS) {
    if (question.branch !== 'all' && question.branch !== branch) continue;
    out[question.questionRef] = 'never';
  }
  return { ...out, ...overrides };
}

// ---------------------------------------------------------------------
// The PostgREST stand-in.
// ---------------------------------------------------------------------

type Row = Record<string, unknown>;

/** The cap production applies to an unbounded select. */
export const DB_MAX_ROWS = 1000;

/** Unique keys the real schema enforces, so an upsert behaves the way it does there. */
const UNIQUE: Record<string, string[][]> = {
  cross_system_signals: [['member_id', 'ingest_fingerprint']],
  cross_system_complaint_reports: [['member_id', 'ingest_fingerprint']],
  cross_system_complaint_classifications: [['report_id', 'position']],
  cross_system_root_findings: [
    ['report_id', 'relationship_id'],
    ['member_id', 'source_key', 'source_session_id', 'relationship_id'],
  ],
  cross_system_root_finding_triggers: [['finding_id', 'signal_id']],
  cross_system_root_finding_signals: [['area_id', 'signal_id']],
};

export class FakeDb {
  tables: Record<string, Row[]> = {};
  private counter = 0;
  /** Every table a select was asked of, in order, for assertions about reads. */
  reads: string[] = [];

  nextId(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }

  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = [];
    return this.tables[table]!;
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  /** A deep copy of every table, for comparing two states. */
  snapshot(): Record<string, Row[]> {
    return JSON.parse(JSON.stringify(this.tables)) as Record<string, Row[]>;
  }
}

type Filter = (row: Row) => boolean;

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row[] = [];
  private patch: Row = {};
  private returning = false;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitCount: number | null = null;
  private single: 'maybe' | 'one' | null = null;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_columns?: string) {
    if (this.mode === 'select') this.db.reads.push(this.table);
    else this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.upsertOptions = options;
    return this;
  }
  update(patch: Row) {
    this.mode = 'update';
    this.patch = patch;
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === 'is' && value === null) this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  or(_clause: string) {
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  maybeSingle() {
    this.single = 'maybe';
    return this;
  }
  singleRow() {
    this.single = 'one';
    return this;
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((filter) => filter(row)));
  }

  private conflictsWith(candidate: Row, existing: Row): boolean {
    const keys = UNIQUE[this.table] ?? [];
    return keys.some((columns) =>
      columns.every(
        (column) => candidate[column] !== null && candidate[column] !== undefined && candidate[column] === existing[column]
      )
    );
  }

  private run(): { data: unknown; error: unknown } {
    const now = '2026-09-17T12:00:00.000Z';
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const table = this.db.rows(this.table);
      const written: Row[] = [];
      for (const raw of this.payload) {
        const row: Row = { id: this.db.nextId(), created_at: now, ...raw };
        const clash = table.find((existing) => this.conflictsWith(row, existing));
        if (clash) {
          if (this.mode === 'upsert' && this.upsertOptions.ignoreDuplicates) continue;
          return { data: null, error: { code: '23505', message: `duplicate key on ${this.table}` } };
        }
        table.push(row);
        written.push(row);
      }
      return this.shape(written);
    }
    if (this.mode === 'update') {
      const hit = this.matching();
      for (const row of hit) Object.assign(row, this.patch);
      return this.shape(hit);
    }
    if (this.mode === 'delete') {
      const hit = new Set(this.matching());
      const table = this.db.rows(this.table);
      this.db.tables[this.table] = table.filter((row) => !hit.has(row));
      return { data: null, error: null };
    }

    let rows = [...this.matching()];
    if (this.orders.length > 0) {
      rows.sort((a, b) => {
        for (const order of this.orders) {
          const left = a[order.column] as string | number | null | undefined;
          const right = b[order.column] as string | number | null | undefined;
          if (left === right) continue;
          if (left === null || left === undefined) return 1;
          if (right === null || right === undefined) return -1;
          const direction = left < right ? -1 : 1;
          return order.ascending ? direction : -direction;
        }
        return 0;
      });
    }
    if (this.rangeFrom !== null && this.rangeTo !== null) {
      const width = Math.min(this.rangeTo - this.rangeFrom + 1, DB_MAX_ROWS);
      rows = rows.slice(this.rangeFrom, this.rangeFrom + width);
    } else {
      rows = rows.slice(0, Math.min(this.limitCount ?? DB_MAX_ROWS, DB_MAX_ROWS));
    }
    return this.shape(rows);
  }

  private shape(rows: Row[]): { data: unknown; error: unknown } {
    const copies = rows.map((row) => JSON.parse(JSON.stringify(row)) as Row);
    if (this.single) {
      if (copies.length > 1) return { data: null, error: { message: 'more than one row' } };
      return { data: copies[0] ?? null, error: null };
    }
    if (this.mode !== 'select' && !this.returning) return { data: null, error: null };
    return { data: copies, error: null };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}
