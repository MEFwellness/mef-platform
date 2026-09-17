/**
 * NO READ MAY COME BACK SHORT WITHOUT SAYING SO, AND NO REQUEST MAY CARRY A
 * LIST THAT CAN OUTGROW IT.
 *
 * THE DEFECTS THIS GUARDS, and each of them shipped:
 *
 *   - PostgREST caps an unbounded select at db-max-rows (1,000 here). It
 *     returns the first thousand rows and reports success. The Association
 *     Map's components and the lexicon lost a third or more of their rows
 *     on production, invisibly, and the member analytics timeline asked for
 *     2,001 rows so it could say "truncated", was handed 1,000, and never
 *     said it.
 *   - An `.in()` list travels in the URL, and 240 ids was already refused
 *     locally as "URI too long".
 *
 * tests/no-truncated-reads-guard.test.ts guarded the Association Map's
 * tables by name. This guards EVERY request in app/, lib/, components/,
 * hooks/, middleware.ts and scripts/, read from the syntax tree by
 * tests/support/dataScaleScan.ts, so a new table does not have to be
 * remembered to be protected.
 *
 * WHEN THIS FAILS, the fix is one of, in this order:
 *
 *   1. Wrap the read in `selectAllRows` (lib/data/pagedSelect.ts), with an
 *      order that ends on a unique column so pages cannot overlap.
 *   2. Send a long list through `selectAllRowsInChunks` or `writeInChunks`.
 *   3. If the site genuinely cannot exceed the cap, say why directly above
 *      the statement, where the next reader will see it:
 *
 *        // scale-exempt: one row per day, and the read is a 7-day window
 *
 *      A reason is required. "small" is not a reason; what bounds it is.
 */

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { scanApp, scanSource, type ScanSite } from './support/dataScaleScan';
import {
  DATA_SCALE_OPTIONS,
  FIXED_SMALL_TABLES,
  RPC_RETURNS_SET,
} from './support/dataScaleRegistry';

const APP_ROOT = path.resolve(__dirname, '..');

const ADVICE: Record<string, string> = {
  'unpaged-read': 'wrap it in selectAllRows, or add a scale-exempt reason',
  'limit-above-cap': 'a limit above 1,000 is silently capped at 1,000: page it with selectAllRows',
  'unbatched-list':
    'send the list through selectAllRowsInChunks / writeInChunks, or add a scale-exempt reason',
  'unbatched-bulk-write':
    'send the rows through writeInChunks, or add a scale-exempt reason saying what bounds them',
  'set-rpc-unbounded':
    'this function returns rows, which are capped like a table read: bound or page it',
  'unknown-rpc': 'add this function to RPC_RETURNS_SET in tests/support/dataScaleRegistry.ts',
  'auth-list-unpaged':
    'auth.admin.listUsers returns 50 users per page by default: pass page and perPage and loop',
  'storage-list-unpaged':
    'storage list returns 100 objects by default: pass limit and offset and loop',
};

function describeSite(site: ScanSite): string {
  return `${site.file}:${site.line}  ${site.target} ${site.op}  [${site.violation}] ${ADVICE[site.violation!]}`;
}

const scan = (source: string, file = 'lib/example/data.ts') =>
  scanSource(file, source, DATA_SCALE_OPTIONS);

describe('every database request in the codebase is bounded, paged or exempted with a reason', () => {
  const sites = scanApp(APP_ROOT, DATA_SCALE_OPTIONS);

  it('finds the requests at all', () => {
    // A scanner that silently stopped matching would pass everything.
    expect(sites.length).toBeGreaterThan(2000);
    expect(sites.filter((site) => site.bound?.startsWith('paged by')).length).toBeGreaterThan(20);
  });

  it('has no unbounded request', () => {
    const offenders = sites.filter((site) => site.violation).map(describeSite);
    expect(offenders, `\n${offenders.join('\n')}\n`).toHaveLength(0);
  });

  it('never exempts a fixed table that the app writes to', () => {
    const written = sites
      .filter((site) => site.kind === 'write' && FIXED_SMALL_TABLES[site.target])
      .map((site) => `${site.file}:${site.line} writes ${site.target}`);
    expect(written, written.join('\n')).toHaveLength(0);
  });

  it('knows every rpc the code calls', () => {
    const called = new Set(sites.filter((site) => site.kind === 'rpc').map((site) => site.target));
    for (const name of called) expect(RPC_RETURNS_SET, name).toHaveProperty(name);
  });
});

describe('the scanner itself (non vacuous)', () => {
  it('flags a plain full read, including across lines', () => {
    const [site] = scan(`
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at');
    `);
    expect(site!.violation).toBe('unpaged-read');
  });

  it('accepts the bounded forms', () => {
    const sites = scan(`
      await supabase.from('profiles').select('id', { count: 'exact', head: true });
      await supabase.from('profiles').select('*').eq('member_id', m).maybeSingle();
      await supabase.from('profiles').select('*').eq('member_id', m).limit(50);
      await supabase.from('profiles').select('*').range(0, 499);
      await supabase.from('profiles').select('*').eq('id', id);
      await supabase.from('driver_domains').select('*');
      await selectAllRows(() => supabase.from('profiles').select('*').order('id'));
      await selectAllRowsInChunks(ids, (chunk) => supabase.from('profiles').select('*').in('id', chunk).order('id'));
      await writeInChunks(ids, (chunk) => supabase.from('profiles').update({ a: 1 }).in('id', chunk));
      await supabase.from('profiles').select('*').in('status', ['a', 'b']).limit(10);
      await supabase.from('profiles').update({ a: 1 }).in('status', LIVE_STATUSES);
    `);
    expect(sites).toHaveLength(11);
    expect(sites.filter((site) => site.violation)).toEqual([]);
  });

  it('treats a limit above the cap as no bound at all', () => {
    const [site] = scan(`
      const ROW_CAP = 2000;
      await supabase.from('product_analytics_events').select('*').eq('member_id', m).limit(ROW_CAP + 1);
    `);
    expect(site!.violation).toBe('limit-above-cap');
  });

  it('sees a limit added to a builder kept in a variable', () => {
    const sites = scan(`
      let query = supabase.from('profiles').select('*');
      if (x) query = query.eq('role', 'coach');
      query = query.limit(20);
      const { data } = await query;
    `);
    expect(sites[0]!.violation).toBeNull();
  });

  it('flags a variable id list, in a read and in a write', () => {
    const sites = scan(`
      await supabase.from('profiles').select('id').in('id', memberIds).limit(5);
      await supabase.from('profiles').delete().in('id', memberIds);
    `);
    expect(sites.map((site) => site.violation)).toEqual(['unbatched-list', 'unbatched-list']);
  });

  it('does not let a whole list hide inside a paging helper', () => {
    const [site] = scan(
      `await selectAllRows(() => supabase.from('profiles').select('id').in('id', memberIds).order('id'));`
    );
    expect(site!.violation).toBe('unbatched-list');
  });

  it('flags an id list written into a filter string', () => {
    const sites = scan(`
      await supabase.from('coach_program_assignments').update({ status: 'replaced' }).not('id', 'in', \`(\${ids.join(',')})\`);
      await supabase.from('coach_program_assignments').select('id').not('status', 'in', '(active,upcoming)').limit(5);
      const clauses = [\`signal_slug.in.(\${slugs.join(',')})\`];
      await supabase.from('cross_system_signals').select('member_id').or(clauses.join(',')).limit(10);
    `);
    expect(sites.map((site) => site.violation)).toEqual(['unbatched-list', null, 'unbatched-list']);
  });

  it('flags a bulk insert of a variable declared as an array, whatever it is called', () => {
    const [site] = scan(`
      const contributions: Array<{ match_id: string }> = [];
      await supabase.from('cross_system_pattern_match_signals').insert(contributions);
    `);
    expect(site!.violation).toBe('unbatched-bulk-write');
  });

  it('flags a bulk insert of mapped rows', () => {
    const [site] = scan(
      `await supabase.from('program_blueprint_slots').insert(slots.map((s) => ({ ...s })));`
    );
    expect(site!.violation).toBe('unbatched-bulk-write');
  });

  it('flags set-returning rpcs, unknown rpcs, listUsers and storage list', () => {
    const sites = scan(`
      await supabase.rpc('admin_list_member_access');
      await supabase.rpc('a_function_nobody_listed');
      await supabase.rpc('grant_coach_role', { p: 1 });
      await admin.auth.admin.listUsers();
      await admin.auth.admin.listUsers({ page, perPage: 1000 });
      await supabase.storage.from('bucket').list('folder');
      await supabase.storage.from('bucket').list('folder', { limit: 100, offset });
    `);
    expect(sites.map((site) => site.violation)).toEqual([
      'set-rpc-unbounded',
      'unknown-rpc',
      null,
      'auth-list-unpaged',
      null,
      'storage-list-unpaged',
      null,
    ]);
  });

  it('treats one fixed page of auth users as unpaged', () => {
    const sites = scan(`
      await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      await service.auth.admin.listUsers({ perPage: 200 });
    `);
    expect(sites.map((site) => site.violation)).toEqual(['auth-list-unpaged', 'auth-list-unpaged']);
  });

  it('honours an exemption with a reason, and only on its own statement', () => {
    const sites = scan(`
      const [a, b] = await Promise.all([
        // scale-exempt: one row per day, and this is a seven day window
        supabase.from('daily_checkins_current').select('*').eq('user_id', u).gte('local_date', since),
        supabase.from('daily_checkins_current').select('*').eq('user_id', u),
      ]);
    `);
    expect(sites.map((site) => site.violation)).toEqual([null, 'unpaged-read']);
    expect(sites[0]!.exemption).toContain('seven day window');
  });

  it('refuses an exemption with no real reason', () => {
    const [site] = scan(`
      // scale-exempt: small
      await supabase.from('profiles').select('*');
    `);
    expect(site!.violation).toBe('unpaged-read');
  });

  it('does not mistake Array.from for a query', () => {
    expect(
      scan(`const xs = Array.from(new Set(ids)); const ys = Array.from('abc').map((c) => c);`)
    ).toEqual([]);
  });

  it('reads plain JavaScript scripts too', () => {
    const [site] = scan(
      `const { data } = await svc.from('cross_system_relationship_components').select('*');`,
      'scripts/x.mjs'
    );
    expect(site!.violation).toBe('unpaged-read');
  });
});
