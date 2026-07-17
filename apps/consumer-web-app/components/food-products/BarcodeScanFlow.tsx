'use client';

/**
 * Top-level barcode wizard: Intro -> Scanner -> lookup -> analyze -> results
 * page. Equivalent to components/food-lens/FoodLensCaptureFlow.tsx for the
 * meal-photo path. A "not found" result gets its own recovery screen
 * (product requirement §15) instead of silently failing.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Barcode, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { startFoodLensScanAction } from '@/app/actions/food-lens';
import {
  buildFoodLensCaptureUploadPathAction,
  recordFoodLensCaptureAction,
} from '@/app/actions/food-lens';
import { lookupBarcodeAction, analyzeProductScanAction } from '@/app/actions/food-products';
import { BarcodeScanner } from './BarcodeScanner';
import { MealCamera } from '@/components/food-lens/MealCamera';

type Phase = 'intro' | 'scanning' | 'looking_up' | 'not_found' | 'photo_capture' | 'error';

export function BarcodeScanFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);

  async function ensureScan(): Promise<string | null> {
    if (scanId) return scanId;
    const result = await startFoodLensScanAction('barcode');
    if (result.error || !result.scan) {
      setErrorMessage(result.error ?? 'Could not start this scan.');
      setPhase('error');
      return null;
    }
    setScanId(result.scan.id);
    return result.scan.id;
  }

  async function handleDecoded(barcode: string) {
    setPhase('looking_up');
    setErrorMessage(null);
    try {
      const currentScanId = await ensureScan();
      if (!currentScanId) return;

      const lookup = await lookupBarcodeAction(currentScanId, barcode);
      if (lookup.status === 'invalid') {
        setErrorMessage(lookup.error ?? 'That barcode could not be read.');
        setPhase('error');
        return;
      }
      if (lookup.status === 'error') {
        setErrorMessage(lookup.error ?? 'Something went wrong looking this up.');
        setPhase('error');
        return;
      }
      if (lookup.status === 'not_found') {
        setPhase('not_found');
        return;
      }

      const analysis = await analyzeProductScanAction(currentScanId);
      if (analysis.status === 'failed') {
        setErrorMessage(analysis.error ?? 'Could not analyze this product.');
        setPhase('error');
        return;
      }

      router.push(`/food-lens/barcode/${currentScanId}` as Route);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
      setPhase('error');
    }
  }

  async function handleProductPhoto(blob: Blob) {
    try {
      const currentScanId = await ensureScan();
      if (!currentScanId) return;

      const captureId = crypto.randomUUID();
      const target = await buildFoodLensCaptureUploadPathAction(currentScanId, captureId, 'jpg');
      if (!target) throw new Error('Could not prepare upload.');

      const browserClient = createClient();
      const { error: uploadError } = await browserClient.storage
        .from(target.bucket)
        .upload(target.path, blob, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;

      await recordFoodLensCaptureAction({
        captureId,
        scanId: currentScanId,
        storagePath: target.path,
        captureType: 'label_image',
      });

      router.push('/food-lens' as Route);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not save this photo.');
      setPhase('error');
    }
  }

  if (phase === 'intro') {
    return (
      <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Barcode className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Barcode scan</p>
        </div>
        <h2 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Scan a packaged food
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Point your camera at a product&apos;s barcode and Root will look up its nutrition facts
          and ingredients, then walk through what actually matters for you — never just one nutrient
          in isolation.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#1B3A2D]/[0.04] p-3">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-[#6B7A72]">
            Only the decoded barcode number leaves your device — no camera image is uploaded for
            this scan type.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPhase('scanning')}
          className="mt-5 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white"
        >
          Scan a barcode
        </button>
      </div>
    );
  }

  if (phase === 'not_found') {
    return (
      <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-sm font-medium text-[#1B3A2D]">
          We couldn&apos;t find that product yet.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          This barcode isn&apos;t in our database yet. You can try scanning again, enter a different
          barcode, or take a photo of the product for a future review — we never guess at a
          product&apos;s nutrition facts from the barcode number alone.
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setPhase('scanning')}
            className="rounded-full bg-[#1B3A2D] py-2.5 text-sm font-semibold text-white"
          >
            Scan again
          </button>
          <button
            type="button"
            onClick={() => setPhase('photo_capture')}
            className="rounded-full border border-[#1B3A2D]/15 py-2.5 text-sm font-medium text-[#1B3A2D]"
          >
            Photograph the product instead
          </button>
          <button
            type="button"
            onClick={() => router.push('/food-lens' as Route)}
            className="py-2 text-sm font-medium text-[#6B7A72]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'photo_capture') {
    return <MealCamera onCapture={handleProductPhoto} busy={false} />;
  }

  if (phase === 'error') {
    return (
      <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-sm text-[#B45309]">{errorMessage}</p>
        <button
          type="button"
          onClick={() => setPhase('scanning')}
          className="mt-4 rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <BarcodeScanner
      onDecode={handleDecoded}
      onCancel={() => router.push('/food-lens' as Route)}
      busy={phase === 'looking_up'}
    />
  );
}
