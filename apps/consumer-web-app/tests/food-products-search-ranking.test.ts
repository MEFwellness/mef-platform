/**
 * Food search ranking (lib/food-products/search.ts's rankFoodSearchResults)
 * — pure function, no Supabase needed for the assertions. Neither Open
 * Food Facts nor this app's own cache reliably flags "generic vs.
 * branded," so this ranks by closeness of the product name to what was
 * actually typed (exact match, then starts-with, then contains, then
 * everything else), tie-broken by shorter name — the best available
 * proxy without that signal, per the task's own fallback instruction.
 */
import { describe, it, expect } from 'vitest';
import { rankFoodSearchResults } from '../lib/food-products/search';

type Named = { name: string | null };

describe('rankFoodSearchResults', () => {
  it('puts an exact (case-insensitive) name match first, ahead of longer branded names', () => {
    const results: Named[] = [
      { name: 'Tyson Chargrilled Chicken Breast Tenders, Frozen' },
      { name: 'Chicken Breast' },
      { name: "Sainsbury's Chicken Breast Fillets" },
    ];
    const ranked = rankFoodSearchResults('chicken breast', results);
    expect(ranked[0]?.name).toBe('Chicken Breast');
  });

  it('ranks a starts-with match above a merely-contains match', () => {
    const results: Named[] = [
      { name: 'Frozen Breaded Chicken Breast Strips' }, // contains, not starts-with
      { name: 'Chicken Breast Fillets' }, // starts-with
    ];
    const ranked = rankFoodSearchResults('chicken breast', results);
    expect(ranked[0]?.name).toBe('Chicken Breast Fillets');
  });

  it('breaks ties within the same match tier by shorter name', () => {
    const results: Named[] = [
      { name: 'Chicken Breast Fillets, Boneless and Skinless, Family Pack' },
      { name: 'Chicken Breast Fillets' },
    ];
    const ranked = rankFoodSearchResults('chicken breast', results);
    expect(ranked[0]?.name).toBe('Chicken Breast Fillets');
  });

  it('leaves results in their original order when the query is empty', () => {
    const results: Named[] = [{ name: 'B' }, { name: 'A' }];
    expect(rankFoodSearchResults('', results)).toEqual(results);
  });

  it('never crashes or drops results for a null product name', () => {
    const results: Named[] = [{ name: null }, { name: 'Chicken Breast' }];
    const ranked = rankFoodSearchResults('chicken breast', results);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.name).toBe('Chicken Breast');
  });
});
