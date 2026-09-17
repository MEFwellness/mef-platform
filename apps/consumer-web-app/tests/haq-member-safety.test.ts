/**
 * The HAQ's numbers never travel toward a member.
 *
 * TWO KINDS OF GUARD, and only the second is temporary.
 *
 * PERMANENT. The modules holding hidden values and cutoffs
 * (scoringRules.ts, and scoring.ts and sql.ts which read it) must never be
 * reachable from a client component, from a member-safe HAQ module, or from
 * any member route. A client component's imports are shipped to the
 * browser, so a reachable file is a payload the member can read.
 *
 * PROMPT 2. The member experience now exists (app/health-appraisal,
 * components/haq, app/api/haq), so the Prompt 1 block that asserted nothing
 * imported lib/haq is replaced by one proving the member files really reach
 * lib/haq, and reach only the member-safe modules listed here.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findAssessmentDefinition, listAssessmentRegistryEntries } from '../lib/assessment-registry/registry';

const ROOT = path.resolve(__dirname, '..');

const NUMBERS_MODULES = ['lib/haq/scoringRules.ts', 'lib/haq/scoring.ts', 'lib/haq/sql.ts'];
const MEMBER_SAFE_MODULES = [
  'lib/haq/memberData.ts',
  'lib/haq/questionBank.ts',
  'lib/haq/types.ts',
  // Prompt 2: the member experience.
  'lib/haq/access.ts',
  'lib/haq/bodyMap.ts',
  'lib/haq/constants.ts',
  'lib/haq/copy.ts',
  'lib/haq/data.ts',
  'lib/haq/pageProps.ts',
  'lib/haq/service.ts',
  'lib/haq/view.ts',
  'lib/haq/walk.ts',
];

/** Every import and re-export specifier in a file, matched per statement. */
function importedPaths(file: string): string[] {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const out: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) out.push(match[1]!);
  const dynamic = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamic.exec(source)) !== null) out.push(match[1]!);
  return out;
}

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = specifier.slice(2);
  else if (specifier.startsWith('.')) base = path.normalize(path.join(path.dirname(fromFile), specifier));
  else return null;
  base = base.replace(/\.(ts|tsx)$/, '');
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

const reachCache = new Map<string, Set<string>>();
function reachableFrom(entry: string): Set<string> {
  const cached = reachCache.get(entry);
  if (cached) return cached;
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of importedPaths(file)) {
      const resolved = resolveImport(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  reachCache.set(entry, seen);
  return seen;
}

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (relative: string) => {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(child);
    }
  };
  walk(dir);
  return out;
}

const APP_FILES = ['app', 'components', 'hooks'].flatMap(sourceFilesUnder);

function isClientComponent(file: string): boolean {
  const head = fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 400);
  return /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use client['"]/.test(head);
}

describe('the HAQ numbers modules are unreachable from anything a member loads (permanent)', () => {
  it('the numbers modules exist, so this guard is not vacuous', () => {
    for (const file of [...NUMBERS_MODULES, ...MEMBER_SAFE_MODULES]) {
      expect(fs.existsSync(path.join(ROOT, file)), file).toBe(true);
    }
    expect(APP_FILES.filter(isClientComponent).length).toBeGreaterThan(50);
  });

  it.each(MEMBER_SAFE_MODULES)('%s cannot reach a numbers module', (file) => {
    const reachable = reachableFrom(file);
    expect(NUMBERS_MODULES.filter((m) => reachable.has(m))).toEqual([]);
  });

  it('no client component reaches a numbers module', () => {
    const leaks = APP_FILES.filter(isClientComponent).filter((file) => {
      const reachable = reachableFrom(file);
      return NUMBERS_MODULES.some((m) => reachable.has(m));
    });
    expect(leaks).toEqual([]);
  });

  it('no member route reaches a numbers module', () => {
    const memberRoutes = APP_FILES.filter(
      (file) => file.startsWith('app/') && !file.startsWith('app/coach/') && !file.startsWith('app/admin/')
    );
    const leaks = memberRoutes.filter((file) => {
      const reachable = reachableFrom(file);
      return NUMBERS_MODULES.some((m) => reachable.has(m));
    });
    expect(leaks).toEqual([]);
  });

  it('the guard itself sees a numbers module when one is imported', () => {
    expect(reachableFrom('lib/haq/scoring.ts').has('lib/haq/scoringRules.ts')).toBe(true);
  });

  it('the member-safe modules hold no hidden value or cutoff', () => {
    for (const file of MEMBER_SAFE_MODULES) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source, file).not.toMatch(/greenMax|yellowMax|green_max|yellow_max|hidden_value|raw_total/);
    }
  });
});

describe('Prompt 2: the member experience reaches the HAQ, and only through member-safe modules', () => {
  it('still has no assessment registry entry, because no plan opens it', () => {
    expect(findAssessmentDefinition('haq')).toBeNull();
    const keys = listAssessmentRegistryEntries().map((entry) => entry.key);
    expect(keys).not.toContain('haq');
    expect(keys).toContain('short-haq');
  });

  it('has its one route, and the route and its screens really do reach lib/haq (so the guards above are not vacuous)', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/health-appraisal/page.tsx'))).toBe(true);
    for (const entry of ['app/health-appraisal/page.tsx', 'components/haq/HaqExperience.tsx', 'app/api/haq/answer/route.ts']) {
      const reachable = [...reachableFrom(entry)];
      expect(reachable.some((file) => file.startsWith('lib/haq/')), entry).toBe(true);
    }
  });

  it('every lib/haq module a member file reaches is one of the member-safe modules', () => {
    const memberFiles = APP_FILES.filter(
      (file) => !file.startsWith('app/coach/') && !file.startsWith('app/admin/') && !file.endsWith('haqCoach.ts')
    );
    const reached = new Set<string>();
    for (const file of memberFiles) {
      for (const reachedFile of reachableFrom(file)) if (reachedFile.startsWith('lib/haq/')) reached.add(reachedFile);
    }
    expect([...reached].filter((reachedFile) => !MEMBER_SAFE_MODULES.includes(reachedFile))).toEqual([]);
  });
});
