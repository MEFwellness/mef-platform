'use client';

/**
 * Food search & product memory (Part 4). Prioritizes the member's own
 * recent/frequent history over the shared cache, and the shared cache over
 * an external lookup — each section is labeled with its source so a
 * previously-scanned product never reads as equivalent to an unverified
 * external hit. Selecting any result opens it through the same unified
 * scan/analysis pipeline as scanning it directly.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Search, Heart, Loader2 } from 'lucide-react';
import {
  searchFoodsAction,
  openFoodSearchResultAction,
  toggleFavoriteProductAction,
  type FoodSearchResponse,
} from '@/app/actions/food-search';
import type { FoodSearchResult } from '@/lib/food-products/search';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const SOURCE_LABEL: Record<FoodSearchResult['source'], string> = {
  recent: 'Recently logged',
  frequent: 'Frequently logged',
  cached: 'Previously scanned',
  external: 'From Open Food Facts',
};

export function FoodSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResponse | null>(null);
  const [favorited, setFavorited] = useState<Set<string>>(new Set());
  const [isSearching, startSearching] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      startSearching(async () => {
        const response = await searchFoodsAction(query);
        setResults(response);
        setFavorited(new Set(response.favoritedProductIds));
      });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function handleOpen(result: FoodSearchResult) {
    setError(null);
    setOpeningId(result.productId ?? result.barcode ?? result.name ?? 'unknown');
    const response = result.productId
      ? await openFoodSearchResultAction({ productId: result.productId })
      : result.barcode
        ? await openFoodSearchResultAction({ barcode: result.barcode })
        : { error: 'This result has no product identifier.' };
    setOpeningId(null);
    if (response.error || !response.scanId) {
      setError(response.error ?? 'Could not open this product.');
      return;
    }
    router.push(`/food-lens/barcode/${response.scanId}` as Route);
  }

  async function handleToggleFavorite(productId: string) {
    setFavorited((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
    await toggleFavoriteProductAction(productId);
  }

  function Section({ title, items }: { title: string; items: FoodSearchResult[] }) {
    if (items.length === 0) return null;
    return (
      <div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          {title}
        </p>
        <ul className={`${CARD} divide-y divide-[#1B3A2D]/5 px-2`}>
          {items.map((item, i) => (
            <li
              key={`${item.productId ?? item.barcode}-${i}`}
              className="flex items-center gap-3 px-3 py-3"
            >
              <button
                type="button"
                onClick={() => handleOpen(item)}
                disabled={openingId !== null}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-[#1B3A2D]/[0.06]" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1B3A2D]">
                    {item.name ?? 'Unnamed product'}
                  </p>
                  <p className="truncate text-xs text-[#6B7A72]">
                    {item.brand ? `${item.brand} · ` : ''}
                    {SOURCE_LABEL[item.source]}
                  </p>
                </div>
              </button>
              {item.productId && (
                <button
                  type="button"
                  onClick={() => handleToggleFavorite(item.productId!)}
                  aria-label="Toggle favorite"
                  className="shrink-0 p-1.5"
                >
                  <Heart
                    className={`h-4 w-4 ${favorited.has(item.productId) ? 'fill-[#1B3A2D] text-[#1B3A2D]' : 'text-[#9AA79F]'}`}
                    strokeWidth={1.75}
                  />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA79F]"
          strokeWidth={1.75}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods you've logged or scanned"
          className="w-full rounded-full border border-[#1B3A2D]/15 bg-white py-3 pl-11 pr-4 text-sm text-[#1B3A2D] placeholder:text-[#9AA79F]"
        />
        {isSearching && (
          <Loader2
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#9AA79F]"
            strokeWidth={1.75}
          />
        )}
      </div>

      {error && <p className="text-sm text-[#B45309]">{error}</p>}

      {results && (
        <>
          <Section title="Recent" items={results.recent} />
          <Section title="Frequent" items={results.frequent} />
          <Section title="Previously scanned" items={results.cached} />
          <Section title="From Open Food Facts" items={results.external} />
          {query.trim().length > 0 &&
            results.cached.length === 0 &&
            results.external.length === 0 && (
              <p className={`${CARD} p-6 text-sm text-[#6B7A72]`}>
                Nothing found for &quot;{query}&quot;. Try scanning a barcode or label, or add it
                manually.
              </p>
            )}
        </>
      )}
    </div>
  );
}
