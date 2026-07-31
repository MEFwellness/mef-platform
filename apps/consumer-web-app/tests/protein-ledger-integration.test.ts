/**
 * Protein Ledger (Phase 1b) — real local Supabase (no mocks), same
 * convention as tests/protein-targets-review.test.ts: server actions can't
 * run directly here (they use next/headers cookies()), so these tests
 * exercise the real tables/RLS the actions read and write instead.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { serviceRoleClient, signInAs, TEST_USERS } from './setup/test-clients';

const createdProductIds: string[] = [];
const createdLogEntryIds: string[] = [];

afterAll(async () => {
  const supabase = serviceRoleClient();
  if (createdLogEntryIds.length > 0) {
    await supabase.from('member_food_log').delete().in('id', createdLogEntryIds);
  }
  if (createdProductIds.length > 0) {
    await supabase.from('product_nutrients').delete().in('product_id', createdProductIds);
    await supabase.from('food_products').delete().in('id', createdProductIds);
  }
});

async function insertTestProduct(proteinG: number): Promise<string> {
  const supabase = serviceRoleClient();
  const productId = randomUUID();
  await supabase.from('food_products').insert({
    id: productId,
    barcode: `test-${productId}`,
    barcode_type: 'unknown',
    name: 'Ledger test product',
    data_source: 'mef_verified',
    data_completeness: 'minimal',
  });
  await supabase.from('product_nutrients').insert({
    product_id: productId,
    basis: 'per_serving',
    protein_g: proteinG,
  });
  createdProductIds.push(productId);
  return productId;
}

describe('confirmation gates the tally', () => {
  it('a product resolved/cached by a lookup does not, by itself, appear in any member’s food log', async () => {
    const productId = await insertTestProduct(30);

    const supabase = serviceRoleClient();
    const { data } = await supabase
      .from('member_food_log')
      .select('id')
      .eq('product_id', productId);
    expect(data ?? []).toEqual([]);
  });

  it('only an explicit log entry (the confirm step) makes it count', async () => {
    const productId = await insertTestProduct(25);
    const memberClient = await signInAs(TEST_USERS.memberOne);

    const { data: before } = await memberClient
      .from('member_food_log')
      .select('id')
      .eq('product_id', productId);
    expect(before ?? []).toEqual([]);

    const { data: inserted, error } = await memberClient
      .from('member_food_log')
      .insert({
        member_id: TEST_USERS.memberOne.id,
        product_id: productId,
        meal_category: 'snack',
        servings: 1,
        consumed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    createdLogEntryIds.push(inserted!.id);

    const { data: after } = await memberClient
      .from('member_food_log')
      .select('id, product_id')
      .eq('product_id', productId);
    expect(after).toHaveLength(1);
  });
});

describe('a member can only ever see their own ledger', () => {
  it('memberTwo cannot read a member_food_log row that belongs to memberOne', async () => {
    const productId = await insertTestProduct(40);
    const memberOneClient = await signInAs(TEST_USERS.memberOne);

    const { data: inserted, error } = await memberOneClient
      .from('member_food_log')
      .insert({
        member_id: TEST_USERS.memberOne.id,
        product_id: productId,
        meal_category: 'snack',
        servings: 1,
        consumed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    createdLogEntryIds.push(inserted!.id);

    const memberTwoClient = await signInAs(TEST_USERS.memberTwo);
    const { data: crossRead } = await memberTwoClient
      .from('member_food_log')
      .select('*')
      .eq('id', inserted!.id);
    expect(crossRead ?? []).toEqual([]);

    // And memberTwo can't delete it either.
    const { error: deleteError, count } = await memberTwoClient
      .from('member_food_log')
      .delete({ count: 'exact' })
      .eq('id', inserted!.id);
    expect(deleteError).toBeNull();
    expect(count).toBe(0);

    const { data: stillThere } = await serviceRoleClient()
      .from('member_food_log')
      .select('id')
      .eq('id', inserted!.id);
    expect(stillThere).toHaveLength(1);
  });
});

describe('deleted scouting test-page routes', () => {
  it('the throwaway barcode test page, its action, and its client component are gone', async () => {
    const { existsSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    expect(existsSync(path.join(root, 'app/coach/protein-scan-test/page.tsx'))).toBe(false);
    expect(existsSync(path.join(root, 'app/actions/proteinScanTest.ts'))).toBe(false);
    expect(
      existsSync(path.join(root, 'components/protein-scan-test/ProteinScanTestClient.tsx'))
    ).toBe(false);
  });
});

describe('white-label regression guard', () => {
  const BANNED_PATTERNS: RegExp[] = [
    /open food facts/i,
    /openfoodfacts/i,
    /\bymove\.app\b/i,
    /\byourmove\b/i,
    /\byour move\b/i,
    /\bmediapipe\b/i,
    /\busda\b/i,
  ];

  /** Strips // line comments and /* block comments *\/ so a vendor name mentioned only in a code comment (allowed) never trips this guard — only real rendered text should. */
  function stripComments(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => {
        const idx = line.indexOf('//');
        return idx === -1 ? line : line.slice(0, idx);
      })
      .join('\n');
  }

  async function findViolations(): Promise<Array<{ file: string; line: number; text: string }>> {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve(__dirname, '..');
    const roots = ['app', 'components'];
    const violations: Array<{ file: string; line: number; text: string }> = [];

    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (name.endsWith('.tsx')) {
          const stripped = stripComments(readFileSync(full, 'utf-8'));
          stripped.split('\n').forEach((line, i) => {
            if (BANNED_PATTERNS.some((re) => re.test(line))) {
              violations.push({ file: path.relative(root, full), line: i + 1, text: line.trim() });
            }
          });
        }
      }
    }

    for (const r of roots) walk(path.join(root, r));
    return violations;
  }

  it('no member/coach-facing .tsx text mentions a third-party vendor by name', async () => {
    const violations = await findViolations();
    expect(violations).toEqual([]);
  });

  it('proof the guard actually catches a regression: a known-bad string fails this same check', () => {
    const stripped = stripComments('<p>Source: Open Food Facts</p>');
    expect(BANNED_PATTERNS.some((re) => re.test(stripped))).toBe(true);
  });
});
