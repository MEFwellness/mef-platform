/**
 * THE HARD RULE, ENFORCED IN CODE.
 *
 * A public answer is a preliminary impression given by a stranger with no
 * account, no consent flow and no clinical review. It may never be treated
 * as a completed in-app assessment: it may not satisfy a prerequisite, may
 * not feed a scoring engine, and may not be presented by Root as a fact
 * about the member.
 *
 * The database enforces half of this structurally (migration 197:
 * member_public_entry_origin.origin and .preliminary are check-constrained
 * to single values, and public_entry_answers has no foreign key into any
 * assessment or check-in table). This file enforces the other half, which
 * is that no code path exists to carry an answer across.
 *
 * WHY THIS IS A SOURCE SCAN AND NOT A BEHAVIOUR TEST. There is nothing to
 * observe: the guarantee is the ABSENCE of a call. A behaviour test can
 * only assert that the paths somebody thought of do not do it. Reading the
 * source and failing on the existence of the write is what makes the
 * guarantee hold for the path nobody thought of, including one added
 * tomorrow.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), 'utf-8');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every file that belongs to the public entry feature. */
const FEATURE_FILES = [
  ...walk(path.join(ROOT, 'lib', 'public-entry')),
  // Migration 200's attribution layer belongs to the same feature and
  // carries the same guarantee: it records where a click came from and
  // nothing about what anybody answered.
  ...walk(path.join(ROOT, 'lib', 'acquisition')),
  ...walk(path.join(ROOT, 'app', 'api', 'public-entry')),
  ...walk(path.join(ROOT, 'components', 'public-entry')),
  ...walk(path.join(ROOT, 'app', 'energy')),
];

/**
 * Tables that hold real member assessment, check-in or scoring data. A
 * public answer reaching any of these is the failure this whole layer
 * exists to prevent.
 */
const MEMBER_DATA_TABLES = [
  'onboarding_answers',
  'onboarding_submissions',
  'daily_checkins',
  'unified_assessment_answers',
  'unified_assessment_sessions',
  'assessment_sessions',
  'assessment_responses',
  'member_pattern_states',
  'member_goal_selections',
  'member_wellness_events',
  'member_findings',
  'root_scores',
];

describe('no public answer can reach member data', () => {
  it('no public entry file writes to any member assessment, check-in or scoring table', () => {
    const offenders: string[] = [];
    for (const file of FEATURE_FILES) {
      const source = fs.readFileSync(file, 'utf-8');
      const relative = path.relative(ROOT, file);
      for (const table of MEMBER_DATA_TABLES) {
        // A write is `.from('table').insert(` / `.upsert(` / `.update(`.
        // Reading is allowed: the pop-up's own closer reads
        // onboarding_submissions to know whether to stop offering itself.
        const writePattern = new RegExp(
          `from\\(\\s*['"]${table}['"]\\s*\\)[\\s\\S]{0,200}?\\.(insert|upsert|update)\\(`
        );
        if (writePattern.test(source)) offenders.push(`${relative} writes ${table}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the one analytics event it does write is behavioural and carries no answer', () => {
    // public_entry_claimed is written through the existing pipeline, which
    // is correct, so the rule above cannot simply ban member_wellness_events
    // outright. What it may carry is checked here instead: two slugs, and
    // nothing else exists on the payload it is given.
    const claim = read('app/api/public-entry/claim/route.ts');
    expect(claim).toContain("eventType: 'public_entry_claimed'");
    const payload = claim.slice(claim.indexOf('payload: {'), claim.indexOf('payload: {') + 200);
    expect(payload).toContain('sourceCode');
    expect(payload).toContain('experienceKey');
    expect(payload).not.toMatch(/patternKey|answers|email|leadEmail/);
  });

  it('the claim route copies nothing into a check-in or an onboarding submission', () => {
    const claim = read('app/api/public-entry/claim/route.ts');
    expect(claim).not.toMatch(/submitDailyCheckin|submitOnboarding|migrateGuestPreview/);
  });
});

describe('the provenance is stated by the schema, not by a convention', () => {
  const migration = read('../../supabase/migrations/00000000000197_public_entry_acquisition.sql');

  it('member_public_entry_origin.origin can only ever be public_acquisition', () => {
    expect(migration).toMatch(/origin text not null default 'public_acquisition' check \(origin = 'public_acquisition'\)/);
  });

  it('member_public_entry_origin.preliminary can only ever be true', () => {
    expect(migration).toMatch(/preliminary boolean not null default true check \(preliminary = true\)/);
  });

  it('public_entry_answers has no foreign key into any member data table', () => {
    const table = migration.slice(
      migration.indexOf('create table public_entry_answers'),
      migration.indexOf('comment on table public_entry_answers')
    );
    for (const memberTable of MEMBER_DATA_TABLES) {
      expect(table).not.toContain(memberTable);
    }
  });

  it('public answers can only ever be short slugs, never free text', () => {
    // A stranger with no consent flow behind them must have nowhere to type
    // a health disclosure. The database refuses anything that is not a slug.
    expect(migration).toMatch(/question_key text not null check \(question_key ~ '\^\[a-z0-9_\]\{1,40\}\$'\)/);
    expect(migration).toMatch(/answer_value text not null check \(answer_value ~ '\^\[a-z0-9_\]\{1,40\}\$'\)/);
  });

  it('no public entry table has a policy an anonymous session could use', () => {
    const policies = migration.match(/create policy [\s\S]*?;/g) ?? [];
    const publicEntryPolicies = policies.filter((p) => /public_entry|member_public_entry_origin/.test(p));
    expect(publicEntryPolicies.length).toBeGreaterThan(0);
    for (const policy of publicEntryPolicies) {
      // Every one is scoped to a role or to the member's own id. None is
      // open, and none grants insert, update or delete to a member.
      expect(policy).toMatch(/has_active_role\(auth\.uid\(\)|member_id = auth\.uid\(\)/);
    }
  });

  it('the member may read her own origin row and may never write one', () => {
    const originPolicies = (migration.match(/create policy [\s\S]*?;/g) ?? []).filter((p) =>
      p.includes('member_public_entry_origin')
    );
    const memberPolicy = originPolicies.find((p) => p.includes('member_id = auth.uid()'));
    expect(memberPolicy).toBeTruthy();
    expect(memberPolicy).toContain('for select');
    // Nothing anywhere grants her an insert, update or delete on it.
    for (const policy of originPolicies) {
      expect(policy).not.toMatch(/for (insert|update|delete|all)/);
    }
  });
});

describe('no public answer is ever pre-filled into the Baseline Assessment', () => {
  it('the onboarding confirm writes only what she taps', () => {
    const form = read('app/onboarding/OnboardingForm.tsx');
    // The control exists, and the value it writes comes from the tap
    // handler, not from a default answer set before the question renders.
    expect(form).toContain('PublicEntryConcernConfirmControl');
    expect(form).toContain('onStillTrue={() =>');
    // No initial-state seeding from the public entry anywhere in the form.
    expect(form).not.toMatch(/useState\([^)]*publicEntryConcern/);
  });

  it('the onboarding page reads the origin and passes only a concern slug', () => {
    const page = read('app/onboarding/page.tsx');
    expect(page).toContain('getMemberOrigin');
    expect(page).toContain('PUBLIC_ENTRY_PRIMARY_CONCERN');
    // It never reads the answers themselves.
    expect(page).not.toContain('public_entry_answers');
    expect(page).not.toContain('loadAnswers');
  });
});

describe("what Root is allowed to say about it", () => {
  it('names it as a first impression and not as a measurement', () => {
    const copy = read('lib/public-entry/copy.ts');
    const body = copy.slice(copy.indexOf('bodyWithPattern'), copy.indexOf('bodyWithoutPattern'));
    expect(body).toContain('first impression');
    expect(body).toContain('not a measurement');
  });

  it('says nothing at all when there is nothing honest to say', () => {
    const copy = read('lib/public-entry/copy.ts');
    const body = copy.slice(copy.indexOf('bodyWithoutPattern'));
    expect(body).toContain('did not finish');
    expect(body).toContain('nothing from it worth telling you back');
  });
});
