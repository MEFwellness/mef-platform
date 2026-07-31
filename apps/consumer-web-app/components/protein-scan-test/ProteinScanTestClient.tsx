'use client';

/**
 * THROWAWAY — Protein Phase 1b scouting only. Delete along with
 * app/coach/protein-scan-test/ and app/actions/proteinScanTest.ts when the
 * real protein ledger is built.
 */

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { BarcodeScanner } from '@/components/food-products/BarcodeScanner';
import {
  testYourMoveBarcodeLookupAction,
  type ProteinScanTestResult,
} from '@/app/actions/proteinScanTest';

export function ProteinScanTestClient() {
  const [result, setResult] = useState<ProteinScanTestResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDecode(barcode: string) {
    setBusy(true);
    const res = await testYourMoveBarcodeLookupAction(barcode);
    setResult(res);
    setBusy(false);
  }

  if (result) {
    return (
      <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-xs font-mono text-[#6B7A72]">Barcode: {result.barcode ?? '—'}</p>

        {result.status === 'found' && result.product && (
          <div className="mt-3">
            <p className="font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
              {result.product.name}
            </p>
            {result.product.brand && (
              <p className="mt-1 text-sm text-[#6B7A72]">{result.product.brand}</p>
            )}
            <div className="mt-4 rounded-2xl bg-[#1B3A2D]/[0.06] p-4">
              <p className="text-3xl font-semibold text-[#1B3A2D]">
                {result.product.proteinGramsPerServing ?? '—'}g protein
              </p>
              <p className="mt-1 text-sm text-[#6B7A72]">
                per serving{result.product.servingDescription ? ` (${result.product.servingDescription})` : ''}
              </p>
              {result.product.caloriesPerServing !== null && (
                <p className="mt-1 text-xs text-[#6B7A72]">
                  {result.product.caloriesPerServing} calories per serving
                </p>
              )}
            </div>
            <p className="mt-3 text-xs text-[#9AA79F]">Source: {result.product.source}</p>
          </div>
        )}

        {result.status === 'not_found' && (
          <p className="mt-3 text-sm text-[#B45309]">
            Your Move has no product on file for this barcode.
          </p>
        )}

        {(result.status === 'invalid' || result.status === 'error') && (
          <p className="mt-3 text-sm text-[#B45309]">{result.error}</p>
        )}

        <button
          type="button"
          onClick={() => setResult(null)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Scan another
        </button>
      </div>
    );
  }

  return <BarcodeScanner onDecode={handleDecode} onCancel={() => setResult(null)} busy={busy} />;
}
