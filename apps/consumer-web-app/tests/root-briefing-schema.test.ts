/**
 * MIGRATION 260: THE BRIEFING'S REVIEW STATE IS COACH ONLY, AND IT IS
 * PHYSICAL. Read from the SQL itself, the same way the Root schema guards
 * read 246 and 258, because a screen that remembers not to draw something
 * is a screen that will eventually forget.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const FILE = '00000000000260_cross_system_root_briefing_reviews.sql';
const SQL = fs.readFileSync(path.join(MIGRATIONS, FILE), 'utf8');
const TABLES = ['cross_system_root_briefing_reviews', 'cross_system_root_briefing_visits'];

function policies(): Array<{ name: string; table: string; body: string }> {
  const out: Array<{ name: string; table: string; body: string }> = [];
  for (const match of SQL.matchAll(/create policy\s+(\w+)\s+on\s+(\w+)([\s\S]*?);/g)) {
    out.push({ name: match[1]!, table: match[2]!, body: match[3]! });
  }
  return out;
}

describe('migration 260', () => {
  it('continues from the head', () => {
    const files = fs.readdirSync(MIGRATIONS).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
    expect(files[files.length - 1]).toBe(FILE);
    expect(files).toContain('00000000000259_daily_checkins_current_hydration_restore.sql');
  });

  it('turns row level security on for both tables', () => {
    for (const table of TABLES) expect(SQL).toContain(`alter table ${table} enable row level security`);
  });

  it('every policy is gated on a staff role, and none mentions a member', () => {
    const all = policies();
    expect(all.length).toBeGreaterThanOrEqual(7);
    for (const policy of all) {
      expect(policy.body, policy.name).toMatch(/has_active_role\(auth\.uid\(\), '(coach|platform_administrator)'\)/);
      expect(policy.body, policy.name).not.toMatch(/member_id/);
    }
  });

  it('a coach reads and writes only her own rows', () => {
    for (const policy of policies().filter((entry) => entry.name.startsWith('coach_'))) {
      expect(policy.body, policy.name).toContain('coach_id = auth.uid()');
    }
  });

  it('reviews are append only for a coach: no update and no delete policy', () => {
    const coachReview = policies().filter(
      (entry) => entry.table === 'cross_system_root_briefing_reviews' && entry.name.startsWith('coach_')
    );
    expect(coachReview.map((entry) => entry.body.trim().split(/\s+/).slice(0, 2).join(' ')).sort()).toEqual([
      'for insert',
      'for select',
    ]);
  });

  it('records the coach, the client, the card, the action, the time and the evidence state', () => {
    for (const column of ['coach_id', 'member_id', 'target_key', 'action', 'evidence_state', 'evidence_fingerprint', 'acted_at']) {
      expect(SQL).toContain(`  ${column} `);
    }
    expect(SQL).toContain("check (action in ('discuss_next_session', 'reviewed', 'not_relevant'))");
  });

  it('touches no existing Root, map, mapping or survey table', () => {
    const statements = SQL.replace(/--.*$/gm, '');
    for (const match of statements.matchAll(/^\s*(?:alter table|drop table|create table|insert into|update|delete from|truncate)\s+(\w+)/gim)) {
      expect(TABLES, `260 touches ${match[1]}`).toContain(match[1]);
    }
  });

  it('carries no em dash in anything stored', () => {
    expect(SQL.replace(/--.*$/gm, '')).not.toContain('—');
  });
});
