/**
 * ONE COLUMN, ONE WRITER, ONE DIRECTION.
 *
 * member_subscriptions.trial_arc_suppressed_at (migration 203) is the only
 * stored input the trial arc has, and the rule about it is narrow enough to
 * be checked by reading the source:
 *
 *   1. It can only turn the arc OFF. Nothing may read it to grant access,
 *      extend a trial, move a window or turn the arc on.
 *   2. Only an admin code path may write it. No member-facing screen, no
 *      server action a member can reach, and no render.
 *
 * WHY A SOURCE SCAN AND NOT A BEHAVIOUR TEST, the same reason
 * tests/public-entry-provenance.test.ts gives: the guarantee is the ABSENCE
 * of a call. A behaviour test can only assert that the paths somebody
 * thought of do not write it. Reading the source and failing on the
 * existence of a second writer is what makes the guarantee hold for the
 * path nobody thought of, including one added tomorrow.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');

const COLUMN = 'trial_arc_suppressed_at';
const RPC = 'admin_set_trial_arc_suppression';

/** The one file allowed to write the column, through the one database function. */
const WRITER = 'app/actions/trialArc.ts';

/**
 * The files allowed to NAME the column at all, each read-only:
 *
 *   lib/membership/relationship.ts  selects it, so a caller gets it in the
 *                                   same round trip as the rest of the facts.
 *   app/actions/memberAccess.ts     carries it on the administrator's list
 *                                   row, straight from admin_list_member_access.
 *   app/admin/access/*              shows the administrator what it currently says.
 *
 * The writer is on the list too, because naming the column is how it clears it.
 */
const MAY_NAME_THE_COLUMN = new Set([
  WRITER,
  'lib/membership/relationship.ts',
  'app/actions/memberAccess.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SOURCES = ['app', 'lib', 'components'].flatMap((dir) => walk(path.join(ROOT, dir)));

/** The file with its comments removed, so a header explaining the rule is never read as a breach of it. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function relative(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function codeFiles(): { file: string; code: string }[] {
  return SOURCES.map((file) => ({ file: relative(file), code: codeOf(fs.readFileSync(file, 'utf8')) }));
}

describe('only one code path writes the suppression column', () => {
  it('names the database function in exactly one file, and that file is the admin action', () => {
    const namers = codeFiles()
      .filter(({ code }) => code.includes(RPC))
      .map(({ file }) => file);
    expect(namers).toEqual([WRITER]);
  });

  it('lets no other file so much as name the column', () => {
    const namers = codeFiles()
      .filter(({ code }) => code.includes(COLUMN))
      .map(({ file }) => file)
      .filter((file) => !MAY_NAME_THE_COLUMN.has(file));
    expect(
      namers,
      `these files name ${COLUMN} without being on the reviewed read-only list: route the read through lib/membership/relationship.ts, and the write through ${WRITER}`
    ).toEqual([]);
  });

  it('writes it through no PostgREST insert, update or upsert anywhere', () => {
    const offenders: string[] = [];
    for (const { file, code } of codeFiles()) {
      // The column named anywhere inside an insert/update/upsert call is the
      // failure, wherever the file sits. The one legitimate write goes
      // through the database function, never through a table write.
      const pattern = /\.(insert|update|upsert)\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(code)) !== null) {
        const window = code.slice(match.index, match.index + 600);
        if (window.includes(COLUMN)) offenders.push(`${file} (${match[1]})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is imported only by the administrator screens', () => {
    const importers = codeFiles()
      .filter(({ file, code }) => file !== WRITER && /actions\/trialArc'/.test(code))
      .map(({ file }) => file);
    const memberFacing = importers.filter((file) => !file.startsWith('app/admin/'));
    expect(
      memberFacing,
      'the suppression writer may only be reached from an admin screen'
    ).toEqual([]);
    expect(importers.length).toBeGreaterThan(0);
  });
});

describe('the writer is an admin path, and stays one', () => {
  const writer = fs.readFileSync(path.join(ROOT, WRITER), 'utf8');

  it("is a server action that asks for the platform administrator role", () => {
    expect(writer).toContain("'use server'");
    expect(writer).toContain("hasActiveRole");
    expect(writer).toContain("'platform_administrator'");
  });

  it('takes a plain boolean and nothing that could carry a date in from a browser', () => {
    // The database stamps the clock, so no caller can backdate a suppression
    // or write a timestamp of its own choosing.
    expect(writer).toContain('p_suppressed: suppressed');
    expect(writer).not.toContain('toISOString');
  });
});

describe('the arc reads the column only to say no', () => {
  const eligibility = codeOf(
    fs.readFileSync(path.join(ROOT, 'lib', 'trial-arc', 'eligibility.ts'), 'utf8')
  );

  it('has exactly one branch on the stamp, and it returns a refusal', () => {
    const branches = eligibility.match(/trialArcSuppressedAt/g) ?? [];
    expect(branches).toHaveLength(1);
    expect(eligibility).toContain(
      "if (facts.trialArcSuppressedAt !== null) return decision('suppressed', relationship);"
    );
  });

  it('never writes anything at all', () => {
    for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(eligibility, `${forbidden} has no business in an eligibility derivation`).not.toContain(
        forbidden
      );
    }
  });

  it('is shipped switched off', () => {
    const config = fs.readFileSync(path.join(ROOT, 'lib', 'trial-arc', 'config.ts'), 'utf8');
    expect(config).toMatch(/export const TRIAL_ARC_LAUNCH: string \| null = null;/);
  });
});

describe('the derivation module writes nothing either', () => {
  const relationship = codeOf(
    fs.readFileSync(path.join(ROOT, 'lib', 'membership', 'relationship.ts'), 'utf8')
  );

  it('reads and derives, and does nothing else', () => {
    for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(']) {
      expect(relationship).not.toContain(forbidden);
    }
  });
});

describe('migration 203 states the rule where the column lives', () => {
  const migration = fs.readFileSync(
    path.join(REPO, 'supabase', 'migrations', '00000000000203_trial_arc_suppression.sql'),
    'utf8'
  );

  it('carries the one-direction rule as a comment on the column itself', () => {
    expect(migration).toContain(`comment on column member_subscriptions.${COLUMN}`);
    expect(migration).toContain('ONE DIRECTION ONLY');
  });

  it('guards its one write function with the same admin check the access panel uses', () => {
    expect(migration).toContain(`create or replace function public.${RPC}`);
    expect(migration).toContain('perform public.member_access_assert_admin();');
  });

  it('adds the column as nullable with no default, so no account starts suppressed', () => {
    expect(migration).toMatch(
      new RegExp(`add column ${COLUMN} timestamptz;`)
    );
    expect(migration).not.toMatch(new RegExp(`${COLUMN} timestamptz[^;]*default`));
  });
});
