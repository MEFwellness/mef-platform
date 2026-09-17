/**
 * THE CHECK-IN VIEW KEEPS ITS HYDRATION FLAG, IN EVERY RECREATION.
 *
 * daily_checkins_current is recreated whenever daily_checkins gains a
 * column, because a `select *` view freezes its column list when it is
 * built. Migration 163 made it carry hydration_tracked, and migration 257
 * recreated it from the older form and dropped that column on production
 * without any test noticing: the real-database test that checks it only
 * runs meaningfully against a migrated local database.
 *
 * This reads the SQL instead, so it runs everywhere: whichever migration
 * last defines the view must still carry the flag, and must read it from
 * the one database function that decides it.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function definitions(): Array<{ file: string; body: string }> {
  const out: Array<{ file: string; body: string }> = [];
  for (const file of fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    for (const match of sql.matchAll(/create (?:or replace )?view\s+daily_checkins_current[\s\S]*?;/g)) {
      out.push({ file, body: match[0] });
    }
  }
  return out;
}

describe('daily_checkins_current', () => {
  it('is defined by several migrations, so this reads real history', () => {
    expect(definitions().length).toBeGreaterThanOrEqual(6);
  });

  it('its latest definition carries hydration_tracked from member_hydration_tracked', () => {
    const latest = definitions().at(-1)!;
    expect(latest.body, latest.file).toMatch(
      /public\.member_hydration_tracked\(d\.user_id\) as hydration_tracked/
    );
    expect(latest.body, latest.file).toContain('security_invoker = true');
    expect(latest.body, latest.file).toMatch(/order by d\.user_id, d\.local_date, d\.checkin_version desc/);
  });

  it('is not vacuous: migration 257 really did define it without the flag', () => {
    const broken = definitions().find((entry) => entry.file.startsWith('00000000000257_'));
    expect(broken).toBeDefined();
    expect(broken!.body).not.toContain('hydration_tracked');
  });
});
