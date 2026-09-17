/**
 * THE QUESTION TO SIGNAL MAPPING, AND MIGRATION 258 THAT MADE IT EDITABLE.
 *
 *   every Body Systems Survey question maps to a canonical signal that
 *     really exists, and none of them to a questionnaire-only name;
 *   the mapping is versioned and append only, in the database;
 *   an edit can only point a question at something real;
 *   the whole thing is behind the coach fence;
 *   a survey finding is an ordinary finding, with exactly one cause.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildSurveyMappingView,
  resolveMappingEdit,
  type SurveyMappingHead,
  type SurveyMappingRevision,
} from '@/lib/cross-system-signals/surveyMapping';
import { QUESTIONS, SECTIONS } from './body-systems-fixture';
import { REAL_LIBRARY, REAL_NAMES, SURVEY_QUESTION_MAPPINGS } from './questionnaire-root-fixture';

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/00000000000258_cross_system_questionnaire_root.sql'),
  'utf8'
);
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const questionMappings = SURVEY_QUESTION_MAPPINGS.filter((row) => row.externalKind === 'question');

describe('every survey question maps to a real canonical signal', () => {
  it('maps all 111 questions, one row each', () => {
    expect(QUESTIONS).toHaveLength(111);
    expect(questionMappings).toHaveLength(111);
    expect(new Set(questionMappings.map((row) => row.externalKey))).toEqual(
      new Set(QUESTIONS.map((question) => question.questionRef))
    );
  });

  it('every mapped slug is a standardized name the Signal Library already holds', () => {
    const names = new Set(REAL_NAMES.map((name) => name.signalSlug));
    const missing = questionMappings.filter((row) => !names.has(row.signalSlug));
    expect(missing).toEqual([]);
  });

  it('never maps a question onto a section rollup, which is a system level signal', () => {
    expect(questionMappings.filter((row) => row.signalSlug.startsWith('bss-system-'))).toEqual([]);
  });

  it('this build adds no signal name, so there is no questionnaire-only vocabulary', () => {
    expect(MIGRATION).not.toMatch(/insert into\s+cross_system_signal_names/i);
    expect(MIGRATION).not.toMatch(/insert into\s+cross_system_signal_source_map\s*\(/i);
  });

  it('the questions the brief names land on the signals a sentence lands on', () => {
    const slugOf = (ref: string) => questionMappings.find((row) => row.externalKey === ref)!.signalSlug;
    expect(slugOf('N4')).toBe('headaches');
    expect(slugOf('D1')).toBe('bloating-after-eating');
    expect(slugOf('M2')).toBe('joint-aching');
    expect(slugOf('K2')).toBe('frequent-urination');
    // Two questions asking the same thing share one signal.
    expect(slugOf('T2')).toBe(slugOf('H9'));
  });
});

describe('migration 258: the mapping is versioned and append only', () => {
  it('seeds revision 1 for exactly the survey questions, from the dictionary as it stands', () => {
    const seed = MIGRATION.slice(MIGRATION.indexOf('insert into cross_system_signal_source_map_revisions'));
    expect(seed).toMatch(/from cross_system_signal_source_map map/);
    expect(seed).toMatch(/map\.source_key = 'body_systems_survey'/);
    expect(seed).toMatch(/map\.external_kind = 'question'/);
    expect(seed).toMatch(/on conflict \(source_key, external_kind, external_key, revision_number\) do nothing/);
    expect(seed).not.toContain('—');
  });

  it('a revision can never be updated or deleted by a coach', () => {
    const policies = [...MIGRATION.matchAll(/create policy\s+(\w+)\s+on\s+cross_system_signal_source_map_revisions\s+for\s+(\w+)/g)];
    const coach = policies.filter((policy) => policy[1]!.startsWith('coach_'));
    expect(coach.map((policy) => policy[2]).sort()).toEqual(['insert', 'select']);
  });

  it('a coach may only append a revision signed by herself, for a survey question', () => {
    const insert = MIGRATION.slice(MIGRATION.indexOf('create policy coach_insert_cross_system_signal_source_map_revisions'));
    const body = insert.slice(0, insert.indexOf(');') + 2);
    expect(body).toContain('changed_by = auth.uid()');
    expect(body).toContain("source_key = 'body_systems_survey'");
    expect(body).toContain("external_kind = 'question'");
  });

  it('a coach may move the head of a survey question mapping, and no other source', () => {
    const update = MIGRATION.slice(MIGRATION.indexOf('create policy coach_update_body_systems_cross_system_source_map'));
    const body = update.slice(0, update.indexOf(');\n') + 2);
    expect(body).toContain('for update');
    expect(body).toContain("source_key = 'body_systems_survey'");
    expect(body).toContain('updated_by = auth.uid()');
    expect(MIGRATION).not.toMatch(/on cross_system_signal_source_map\s+for (insert|delete)/);
  });

  it('holds no member policy of any kind, and nothing compares auth.uid() to a member', () => {
    for (const policy of MIGRATION.matchAll(/create policy\s+(\w+)\s+on\s+(\w+)([\s\S]*?);/g)) {
      expect(policy[3], policy[1]).toMatch(/has_active_role\(auth\.uid\(\), '(coach|platform_administrator)'\)/);
      expect(policy[3], policy[1]).not.toMatch(/member_id/);
    }
  });

  it('every new table turns row level security on and carries the cross_system prefix', () => {
    const tables = [...MIGRATION.matchAll(/create table\s+(\w+)/g)].map((match) => match[1]!);
    expect(tables).toEqual(['cross_system_root_finding_triggers', 'cross_system_signal_source_map_revisions']);
    for (const table of tables) {
      expect(MIGRATION).toContain(`alter table ${table} enable row level security`);
    }
  });

  it('touches no survey table, score or red flag', () => {
    expect(MIGRATION).not.toMatch(/(alter|update|insert into|delete from|drop)\s+(table\s+)?(member_body_systems_sessions|body_systems_)/i);
  });

  it('every added column is nullable or carries a default, so no existing row becomes invalid', () => {
    for (const column of MIGRATION.matchAll(/add column\s+(\w+)\s+([^;]+);/g)) {
      const definition = column[2]!;
      if (/not null/.test(definition)) expect(definition, column[1]).toMatch(/default/);
    }
  });

  it('no column can hold a conclusion, a score or a confidence', () => {
    const columns = [...MIGRATION.matchAll(/add column\s+(\w+)/g), ...MIGRATION.matchAll(/^\s+(\w+)\s+(?:uuid|text|integer|boolean|timestamptz)/gm)].map((match) => match[1]!);
    for (const name of columns) {
      expect(name).not.toMatch(/cause|diagnos|score|confidence|severity|percent|condition/);
    }
  });

  it('a finding has exactly one cause: a complaint or a sitting', () => {
    expect(MIGRATION).toContain('alter column report_id drop not null');
    expect(MIGRATION).toMatch(/report_id is not null and source_key is null and source_session_id is null/);
    expect(MIGRATION).toMatch(/report_id is null and source_key is not null and source_session_id is not null/);
    expect(MIGRATION).toMatch(/unique index cross_system_root_findings_sitting_idx\s+on cross_system_root_findings \(member_id, source_key, source_session_id, relationship_id\)/);
    expect(MIGRATION).not.toMatch(/unique index cross_system_root_findings_sitting_idx[^;]*where/);
  });
});

const HEAD: SurveyMappingHead = {
  questionRef: 'N4',
  signalSlug: 'headaches',
  bodyAreaKey: 'head',
  isActive: true,
  revisionNumber: 3,
  updatedAt: null,
};

describe('an edit can only point a question at something real', () => {
  const context = { questions: QUESTIONS, names: REAL_LIBRARY.names, bodyAreas: REAL_LIBRARY.bodyAreas, head: HEAD };

  it('accepts a real signal and area, and the next revision comes from the stored head', () => {
    const resolved = resolveMappingEdit(
      { questionRef: 'N4', signalSlug: 'headaches-when-not-eaten', bodyAreaKey: 'head', isActive: true, note: '  sharper wording ' },
      context
    );
    expect(resolved).toEqual({
      ok: true,
      edit: { questionRef: 'N4', signalSlug: 'headaches-when-not-eaten', bodyAreaKey: 'head', isActive: true, note: 'sharper wording' },
      nextRevision: 4,
    });
  });

  it.each([
    [{ questionRef: 'ZZ9', signalSlug: 'headaches', isActive: true }, 'not one the Body Systems Survey asks'],
    [{ questionRef: 'N4', signalSlug: 'made-up-signal', isActive: true }, 'already exists in the Signal Library'],
    [{ questionRef: 'N4', signalSlug: 'headaches', bodyAreaKey: 'elbowish', isActive: true }, 'body area from the list'],
    [{ questionRef: 'N4', signalSlug: 'headaches', bodyAreaKey: 'head', isActive: true }, 'Nothing has changed'],
    [{ questionRef: 'N4', signalSlug: 'headaches', bodyAreaKey: 'head', isActive: false, note: 'x'.repeat(201) }, 'under 200 characters'],
  ])('refuses %j', (raw, message) => {
    const resolved = resolveMappingEdit(raw, context);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error).toContain(message);
  });

  it('switching a mapping off is a real change', () => {
    const resolved = resolveMappingEdit({ questionRef: 'N4', signalSlug: 'headaches', bodyAreaKey: 'head', isActive: false }, context);
    expect(resolved.ok).toBe(true);
  });

  it('a question with no head to revise is refused rather than created', () => {
    const resolved = resolveMappingEdit({ questionRef: 'N4', signalSlug: 'headaches', isActive: true }, { ...context, head: null });
    expect(resolved.ok).toBe(false);
  });
});

describe('the coach review view', () => {
  const heads: SurveyMappingHead[] = questionMappings.map((row) => ({
    questionRef: row.externalKey,
    signalSlug: row.signalSlug,
    bodyAreaKey: row.bodyAreaKey,
    isActive: true,
    revisionNumber: row.externalKey === 'N4' ? 2 : 1,
    updatedAt: null,
  }));
  const revisions: SurveyMappingRevision[] = [
    ...questionMappings.map((row) => ({
      questionRef: row.externalKey,
      revisionNumber: 1,
      signalSlug: row.signalSlug,
      bodyAreaKey: row.bodyAreaKey,
      isActive: true,
      changeNote: 'The mapping as first authored in the Signal Library content.',
      changedBy: null,
      changedAt: '2026-09-17T12:00:00.000Z',
    })),
    { questionRef: 'N4', revisionNumber: 2, signalSlug: 'headaches', bodyAreaKey: null, isActive: false, changeNote: 'trial', changedBy: 'coach', changedAt: '2026-09-18T12:00:00.000Z' },
  ];
  const view = buildSurveyMappingView({ sections: SECTIONS, questions: QUESTIONS, heads, revisions, names: REAL_LIBRARY.names, bodyAreas: REAL_LIBRARY.bodyAreas });

  it('groups all 111 questions under the eleven sections', () => {
    expect(view.sections).toHaveLength(11);
    expect(view.mappedCount).toBe(111);
    expect(view.sections.flatMap((section) => section.rows)).toHaveLength(111);
  });

  it('reads a version trail newest first, with what moved computed rather than stored', () => {
    const n4 = view.sections.flatMap((section) => section.rows).find((row) => row.questionRef === 'N4')!;
    expect(n4.revisions.map((revision) => revision.revisionNumber)).toEqual([2, 1]);
    expect(n4.revisions[0]!.changes).toEqual(['Body area: Head to the signal default', 'Switched off']);
    expect(n4.revisions[1]!.changes).toEqual(['First version of this mapping']);
  });

  it('prints no em dash and no percent sign anywhere', () => {
    const text = JSON.stringify(view);
    expect(text).not.toContain('—');
    expect(text).not.toContain('%');
  });
});

describe('behind the coach fence', () => {
  it('every exported function in the mapping action establishes a coach or an administrator first', () => {
    const source = read('app/actions/crossSystemSignalMappings.ts');
    expect(source.startsWith("'use server';")).toBe(true);
    const exported = [...source.matchAll(/export async function (\w+)\([\s\S]*?\{\n([\s\S]*?)\n\}/g)];
    expect(exported.map((match) => match[1])).toEqual(['getSurveySignalMappingAction', 'saveSurveySignalMappingAction']);
    for (const match of exported) {
      const firstLines = match[2]!.split('\n').slice(0, 3).join('\n');
      expect(firstLines, match[1]).toContain('await coachOrAdmin()');
    }
    expect(source).toMatch(/hasActiveRole\(supabase, user\.id, 'coach'\)/);
    expect(source).not.toMatch(/serviceRole/i);
  });

  it('the page redirects anyone who is not staff', () => {
    const page = read('app/coach/signal-mappings/page.tsx');
    expect(page).toMatch(/if \(!isCoach && !isAdmin\) redirect\('\/dashboard'\)/);
  });

  it('the panel is imported by the coach page and nothing else', async () => {
    const { execSync } = await import('node:child_process');
    const importers = execSync("grep -rl 'coach-signal-mappings' app components lib || true", { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    expect(importers).toEqual(['app/coach/signal-mappings/page.tsx']);
  });

  it('the coach dashboard links to it', () => {
    expect(read('app/coach/page.tsx')).toContain('href: SURVEY_SIGNAL_MAPPING_HREF');
  });
});
