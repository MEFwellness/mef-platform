'use client';

/**
 * The three protein-ledger entry lanes — barcode scan, search by name, and
 * quick add — all funneling into the same rule: nothing enters the tally
 * until the member explicitly confirms a gram number. Reuses the exact
 * scanning/search/lookup building blocks the rest of Food Lens already
 * ships (BarcodeScanner, startFoodLensScanAction, lookupBarcodeAction,
 * searchFoodsAction) rather than a parallel implementation — see
 * app/actions/protein-ledger.ts's header for why the heavier rules-engine/
 * Root-coaching analysis those flows also offer is deliberately skipped
 * here.
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Barcode, Search, PenLine, Loader2, X } from 'lucide-react';
import { BarcodeScanner } from '@/components/food-products/BarcodeScanner';
import { startFoodLensScanAction } from '@/app/actions/food-lens';
import { lookupBarcodeAction } from '@/app/actions/food-products';
import { searchFoodsAction, type FoodSearchResponse } from '@/app/actions/food-search';
import type { FoodSearchResult } from '@/lib/food-products/search';
import {
  logProteinLedgerEntryAction,
  quickAddProteinLedgerEntryAction,
  resolveLedgerProductAction,
  type LedgerProductPreview,
} from '@/app/actions/protein-ledger';
import { roundGrams, shouldApplySearchResponse } from '@/lib/protein/ledger';

const CARD = 'rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

type Phase =
  | 'closed'
  | 'scanning'
  | 'looking_up'
  | 'not_found'
  | 'confirm'
  | 'searching'
  | 'quick_add'
  | 'error';

export function ProteinEntryLanes() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('closed');
  const [product, setProduct] = useState<LedgerProductPreview | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPhase('closed');
    setProduct(null);
    setScanId(null);
    setErrorMessage(null);
  }

  async function handleDecoded(barcode: string) {
    setPhase('looking_up');
    const scanResult = await startFoodLensScanAction('barcode');
    if (scanResult.error || !scanResult.scan) {
      setErrorMessage(scanResult.error ?? 'Could not start this scan.');
      setPhase('error');
      return;
    }
    const lookup = await lookupBarcodeAction(scanResult.scan.id, barcode);
    if (lookup.status === 'not_found') {
      setPhase('not_found');
      return;
    }
    if (lookup.status !== 'found' || !lookup.product) {
      setErrorMessage(lookup.error ?? 'Something went wrong looking this up.');
      setPhase('error');
      return;
    }
    setScanId(scanResult.scan.id);
    setProduct({
      productId: lookup.product.id,
      name: lookup.product.name,
      brand: lookup.product.brand,
      servingSizeText: lookup.product.serving_size_text,
      proteinGPerServing: lookup.nutrients?.protein_g ?? null,
    });
    setPhase('confirm');
  }

  async function handlePickSearchResult(result: FoodSearchResult) {
    setPhase('looking_up');
    const response = result.productId
      ? await resolveLedgerProductAction({ productId: result.productId })
      : result.barcode
        ? await resolveLedgerProductAction({ barcode: result.barcode })
        : { error: 'This result has no product identifier.' };
    if (response.error || !response.product) {
      setErrorMessage(response.error ?? 'Could not find this product.');
      setPhase('error');
      return;
    }
    setScanId(null); // search never creates a scan — a stale scan id from an earlier scan attempt must never leak into a search-sourced entry
    setProduct(response.product);
    setPhase('confirm');
  }

  function handleLogged() {
    startTransition(() => {
      router.refresh();
    });
    reset();
  }

  if (phase === 'closed') {
    return (
      <div className="grid grid-cols-3 gap-3">
        <LaneButton icon={Barcode} label="Scan" onClick={() => setPhase('scanning')} />
        <LaneButton icon={Search} label="Search" onClick={() => setPhase('searching')} />
        <LaneButton icon={PenLine} label="Quick add" onClick={() => setPhase('quick_add')} />
      </div>
    );
  }

  if (phase === 'scanning' || phase === 'looking_up') {
    return <BarcodeScanner onDecode={handleDecoded} onCancel={reset} busy={phase === 'looking_up'} />;
  }

  if (phase === 'not_found') {
    return (
      <div className={`${CARD} text-center`}>
        <p className="text-sm font-medium text-[#1B3A2D]">We couldn&apos;t find that product.</p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          This barcode isn&apos;t in our database yet. Try search or quick add instead.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setPhase('scanning')}
            className="rounded-full bg-[#1B3A2D] py-2.5 text-sm font-semibold text-white"
          >
            Scan again
          </button>
          <button type="button" onClick={reset} className="py-2 text-sm font-medium text-[#6B7A72]">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={`${CARD} text-center`}>
        <p className="text-sm text-[#B45309]">{errorMessage}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Close
        </button>
      </div>
    );
  }

  if (phase === 'confirm' && product) {
    return (
      <ConfirmServingsCard
        product={product}
        scanId={scanId}
        onCancel={reset}
        onLogged={handleLogged}
        disabled={isPending}
      />
    );
  }

  if (phase === 'searching') {
    return <SearchLane onPick={handlePickSearchResult} onCancel={reset} />;
  }

  if (phase === 'quick_add') {
    return <QuickAddLane onCancel={reset} onLogged={handleLogged} disabled={isPending} />;
  }

  return null;
}

function LaneButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Barcode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-[28px] bg-white p-4 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]"
    >
      <Icon className="h-5 w-5 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
      <span className="text-xs font-medium text-[#1B3A2D]">{label}</span>
    </button>
  );
}

function ConfirmServingsCard({
  product,
  scanId,
  onCancel,
  onLogged,
  disabled,
}: {
  product: LedgerProductPreview;
  scanId: string | null;
  onCancel: () => void;
  onLogged: () => void;
  disabled: boolean;
}) {
  const [servings, setServings] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grams =
    product.proteinGPerServing !== null ? roundGrams(product.proteinGPerServing * servings) : null;

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const result = await logProteinLedgerEntryAction(
      scanId
        ? { productId: product.productId, servings, scanId }
        : { productId: product.productId, servings }
    );
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onLogged();
  }

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#1B3A2D]">
            {product.name ?? 'Unnamed product'}
          </p>
          {product.brand && <p className="text-xs text-[#6B7A72]">{product.brand}</p>}
          {product.servingSizeText && (
            <p className="mt-1 text-xs text-[#9AA79F]">Serving: {product.servingSizeText}</p>
          )}
        </div>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="shrink-0 text-[#9AA79F]">
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      {product.proteinGPerServing === null ? (
        <p className="mt-4 text-sm text-[#B45309]">
          This product has no protein value on file, so it can&apos;t be added to your protein
          ledger.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <label className="flex-1">
              <span className="text-xs text-[#6B7A72]">Servings</span>
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={servings}
                onChange={(e) => setServings(Math.max(0.25, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
              />
            </label>
            <p className="text-lg font-semibold text-[#1B3A2D]">{grams}g protein</p>
          </div>

          {error && <p className="mt-2 text-xs text-[#B45309]">{error}</p>}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || disabled}
            className="mt-4 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Confirm and add to today'}
          </button>
        </>
      )}
    </div>
  );
}

function SearchLane({
  onPick,
  onCancel,
}: {
  onPick: (result: FoodSearchResult) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const latestRequestIdRef = useRef(0);
  // The truly live query text, readable from inside an old async closure —
  // `query` itself would only ever read back the value captured when that
  // particular effect instance was created, which defeats the "matches the
  // CURRENT text in the box" check below.
  const liveQueryRef = useRef(query);
  liveQueryRef.current = query;

  // Debounced, but the debounce alone doesn't guarantee in-order arrival —
  // a request from an earlier keystroke can still resolve after a later
  // one if the network/server timing works out that way. Every response is
  // checked against shouldApplySearchResponse before it's allowed to touch
  // `results`, so a stale one can never overwrite a current one, and the
  // "nothing found" empty state never renders while a request for what's
  // currently in the box is still in flight (isSearching only clears once
  // an accepted response lands).
  useEffect(() => {
    setIsSearching(true);
    const searchedQuery = query;
    const handle = setTimeout(() => {
      const requestId = ++latestRequestIdRef.current;
      (async () => {
        const response = await searchFoodsAction(searchedQuery);
        if (
          !shouldApplySearchResponse(
            { requestId, query: searchedQuery },
            { latestRequestId: latestRequestIdRef.current, query: liveQueryRef.current }
          )
        ) {
          return;
        }
        setResults(response);
        setIsSearching(false);
      })();
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function Section({ title, items }: { title: string; items: FoodSearchResult[] }) {
    if (items.length === 0) return null;
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{title}</p>
        <ul className="divide-y divide-[#1B3A2D]/5">
          {items.map((item, i) => (
            <li key={`${item.productId ?? item.barcode}-${i}`}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1B3A2D]">
                    {item.name ?? 'Unnamed product'}
                  </p>
                  {item.brand && <p className="truncate text-xs text-[#6B7A72]">{item.brand}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Search</p>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-[#9AA79F]">
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="relative mt-3">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA79F]"
          strokeWidth={1.75}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods"
          autoFocus
          className="w-full rounded-full border border-[#1B3A2D]/15 bg-white py-3 pl-11 pr-4 text-base text-[#1B3A2D] placeholder:text-[#9AA79F]"
        />
        {isSearching && (
          <Loader2
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#9AA79F]"
            strokeWidth={1.75}
          />
        )}
      </div>
      {results ? (
        <div className="mt-4 space-y-4">
          <Section title="Recent" items={results.recent} />
          <Section title="Frequent" items={results.frequent} />
          <Section title="Previously scanned" items={results.cached} />
          <Section title="More results" items={results.external} />
          {query.trim().length > 0 &&
            results.cached.length === 0 &&
            results.external.length === 0 &&
            results.recent.length === 0 &&
            results.frequent.length === 0 &&
            // Never render "nothing found" while a request for what's
            // currently in the box is still in flight — a response for an
            // outdated, shorter query could otherwise land after a real
            // result set and read as "your real search found nothing."
            (isSearching ? (
              <p className="text-sm text-[#6B7A72]">Searching…</p>
            ) : (
              <p className="text-sm text-[#6B7A72]">
                Nothing found for &quot;{query}&quot;. Try scanning a barcode or quick add instead.
              </p>
            ))}
        </div>
      ) : (
        isSearching && <p className="mt-4 text-sm text-[#6B7A72]">Searching…</p>
      )}
    </div>
  );
}

function QuickAddLane({
  onCancel,
  onLogged,
  disabled,
}: {
  onCancel: () => void;
  onLogged: () => void;
  disabled: boolean;
}) {
  const [grams, setGrams] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    const parsed = Number(grams);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter the grams of protein.');
      return;
    }
    setSaving(true);
    setError(null);
    const trimmedName = name.trim();
    const result = await quickAddProteinLedgerEntryAction(
      trimmedName ? { grams: parsed, name: trimmedName } : { grams: parsed }
    );
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onLogged();
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">Quick add</p>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-[#9AA79F]">
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
        Enter the grams of protein directly. A name is optional.
      </p>
      <label className="mt-4 block">
        <span className="text-xs text-[#6B7A72]">Grams of protein</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.5"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          placeholder="e.g. 25"
          className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-base text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
        />
      </label>
      <label className="mt-3 block">
        <span className="text-xs text-[#6B7A72]">Name (optional)</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Protein shake"
          className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-base text-[#1B3A2D] outline-none focus:border-[#1B3A2D]/40"
        />
      </label>
      {error && <p className="mt-2 text-xs text-[#B45309]">{error}</p>}
      <button
        type="button"
        onClick={handleAdd}
        disabled={saving || disabled}
        className="mt-4 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add to today'}
      </button>
    </div>
  );
}
