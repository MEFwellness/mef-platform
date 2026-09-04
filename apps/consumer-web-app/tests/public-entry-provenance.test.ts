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

/**
 * The file with its comments removed. Explaining what a fence is for
 * requires naming what it fences against, so these files' prose is full of
 * the very table names an "it must not touch this" assertion looks for.
 * Scanning the code alone is what lets the explanation stay honest and
 * complete without the guard reading it as a violation.
 */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
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
  // The Quick Wellness Check carries the identical guarantee since
  // migration 202, and it is in this file rather than its own because the
  // rule is one rule: an answer given before there was an account never
  // becomes member data. A second file would let the two drift.
  ...walk(path.join(ROOT, 'lib', 'guest-preview')),
  ...walk(path.join(ROOT, 'app', 'api', 'guest-preview')),
  ...walk(path.join(ROOT, 'components', 'guest-preview')),
  ...walk(path.join(ROOT, 'app', 'wellness-check')),
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
  it('no pre-account answer file writes to any member assessment, check-in or scoring table', () => {
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

/**
 * THE SAME HARD RULE, FOR THE QUICK WELLNESS CHECK.
 *
 * /wellness-check asks a signed-out stranger seven questions. Until
 * 2026-09-04, app/GuestPreviewMigrator.tsx copied her answers into a real
 * daily_checkins row on the first page load after she created an account,
 * through the ordinary member check-in action, with nothing recording where
 * they had come from. From that moment they were indistinguishable from a
 * Daily Reset she had sat down and completed, and every honesty threshold
 * that counts check-ins counted a day she had never checked in.
 *
 * The write is gone, the answers are fenced in their own table, and these
 * tests are what stop it coming back, including by a path nobody has
 * thought of yet. Two halves, the same two the public entry has: the
 * absence of the code that could carry an answer across, and the presence
 * of the constraints that make the provenance structural.
 */
describe('the Quick Wellness Check migration path is gone and cannot come back', () => {
  const GONE = [
    'lib/guest-preview/mergeCheckin.ts',
    'app/actions/guest-preview.ts',
    'app/GuestPreviewMigrator.tsx',
  ];

  it('none of the files that performed the silent write still exist', () => {
    for (const relative of GONE) {
      expect(fs.existsSync(path.join(ROOT, relative))).toBe(false);
    }
  });

  it('nothing anywhere in the app still imports or calls the migration', () => {
    const offenders: string[] = [];
    for (const dir of ['app', 'lib', 'components']) {
      for (const file of walk(path.join(ROOT, dir))) {
        const source = codeOf(fs.readFileSync(file, 'utf-8'));
        if (/migrateGuestPreview|buildMigratedCheckinInput|guest-preview\/mergeCheckin/.test(source)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the root layout mounts the claim, and no migrator', () => {
    const layout = codeOf(read('app/layout.tsx'));
    expect(layout).toContain('<GuestPreviewClaim />');
    expect(layout).not.toContain('GuestPreviewMigrator');
  });

  it('the claim route binds an account and copies nothing into member data', () => {
    const claim = codeOf(read('app/api/guest-preview/claim/route.ts'));
    expect(claim).toContain('claimGuestSessionForMember');
    expect(claim).not.toMatch(/submitDailyCheckin|submitOnboarding|daily_checkins/);
  });

  it('a signed-out guest can reach the fenced endpoint at all', () => {
    // Found on production, not in a test: /api/guest-preview was not on the
    // middleware's public list, so every save a guest made was 307
    // redirected to /login before reaching the route. The client swallows a
    // failed write on purpose, so she finished the quiz, read her result,
    // and nothing was stored anywhere. A silent failure in the layer whose
    // entire job is to preserve her answers deserves its own guard.
    const middleware = codeOf(read('middleware.ts'));
    expect(middleware).toContain("'/api/guest-preview'");
    expect(middleware).toContain("'/wellness-check'");
  });

  it('the guest answers are written only to the fenced table', () => {
    const data = codeOf(read('lib/guest-preview/data.ts'));
    const tables = [...data.matchAll(/from\(\s*['"]([a-z_]+)['"]\s*\)/g)].map((m) => m[1]);
    expect([...new Set(tables)].sort()).toEqual([
      'guest_wellness_check_answers',
      'guest_wellness_check_sessions',
    ]);
  });
});

describe('the Quick Wellness Check provenance is stated by the schema', () => {
  const migration = read('../../supabase/migrations/00000000000202_guest_wellness_check_fence.sql');

  it('a session row can only ever declare itself a guest wellness check', () => {
    expect(migration).toMatch(
      /origin text not null default 'guest_wellness_check' check \(origin = 'guest_wellness_check'\)/
    );
  });

  it('a session row can only ever be preliminary', () => {
    expect(migration).toMatch(/preliminary boolean not null default true check \(preliminary = true\)/);
  });

  it('neither table definition references any member data table', () => {
    // The file's prose names those tables constantly, because explaining
    // what this fence is for requires naming what it fences against. Only
    // the definitions themselves are scanned, the same way migration 197's
    // own check does it.
    const definitions =
      migration.slice(
        migration.indexOf('create table guest_wellness_check_sessions'),
        migration.indexOf('comment on table guest_wellness_check_sessions')
      ) +
      migration.slice(
        migration.indexOf('create table guest_wellness_check_answers'),
        migration.indexOf('comment on table guest_wellness_check_answers')
      );
    for (const memberTable of MEMBER_DATA_TABLES) {
      expect(definitions).not.toContain(memberTable);
    }
  });

  it('a guest answer can only ever be a short slug, never free text', () => {
    expect(migration).toMatch(/question_key text not null check \(question_key ~ '\^\[a-z0-9_\]\{1,40\}\$'\)/);
    expect(migration).toMatch(/answer_value text not null check \(answer_value ~ '\^\[a-z0-9_\]\{1,40\}\$'\)/);
  });

  it('the member may read the run that turned out to be hers and may never write one', () => {
    const policies = migration.match(/create policy [\s\S]*?;/g) ?? [];
    const guestPolicies = policies.filter((p) => /guest_wellness_check/.test(p));
    expect(guestPolicies.length).toBeGreaterThan(0);
    for (const policy of guestPolicies) {
      // Every one is scoped to a staff role or to the member's own id. None
      // is open, and none grants a write to anybody.
      expect(policy).toMatch(/has_active_role\(auth\.uid\(\)|claimed_by = auth\.uid\(\)/);
      expect(policy).not.toMatch(/for (insert|update|delete|all)/);
    }
  });

  it('both tables have row level security on', () => {
    expect(migration).toContain('alter table guest_wellness_check_sessions enable row level security');
    expect(migration).toContain('alter table guest_wellness_check_answers enable row level security');
  });
});
