'use client';

/**
 * Top-level wizard: Intro (what this feature is/isn't, privacy note) ->
 * Capture -> upload -> analyze -> redirect to the results page. Equivalent
 * to AssessmentWizard.tsx, substantially simpler (one photo, one backend
 * analysis call, no per-step landmark pipeline).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Camera, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  startFoodLensScanAction,
  buildFoodLensCaptureUploadPathAction,
  recordFoodLensCaptureAction,
  analyzeFoodLensScanAction,
} from '@/app/actions/food-lens';
import { MealCamera } from './MealCamera';

type Phase = 'intro' | 'capture' | 'busy' | 'error';

export function FoodLensCaptureFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);

  async function ensureScan(): Promise<string | null> {
    if (scanId) return scanId;
    const result = await startFoodLensScanAction('meal_photo');
    if (result.error || !result.scan) {
      setErrorMessage(result.error ?? 'Could not start this scan.');
      setPhase('error');
      return null;
    }
    setScanId(result.scan.id);
    return result.scan.id;
  }

  async function handleCaptured(blob: Blob) {
    setPhase('busy');
    setErrorMessage(null);
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

      const recorded = await recordFoodLensCaptureAction({
        captureId,
        scanId: currentScanId,
        storagePath: target.path,
        captureType: 'photo',
      });
      if (recorded.error) throw new Error(recorded.error);

      const analysis = await analyzeFoodLensScanAction(currentScanId);
      if (analysis.status === 'failed') {
        throw new Error(analysis.error ?? 'Analysis failed.');
      }

      router.push(`/food-lens/${currentScanId}` as Route);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setPhase('error');
    }
  }

  if (phase === 'intro') {
    return (
      <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <div className="flex items-center gap-2 text-[#854D0E]">
          <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Food Lens</p>
        </div>
        <h2 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Point, shoot, get coaching
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Take a photo of your meal and Root will let you know how it stacks up against your own
          eating pattern. This is coaching, not calorie counting — you&apos;ll never see calorie
          totals or gram weights, only how your protein, carbs, and fat roughly compare to your
          target.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#1B3A2D]/[0.04] p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-xs leading-relaxed text-[#6B7A72]">
            Your meal photos are stored privately and only used to identify food for your own
            coaching. You can always correct what Root got wrong.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPhase('capture')}
          className="mt-5 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white"
        >
          Scan a meal
        </button>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-[28px] bg-white p-6 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <p className="text-sm text-[#B45309]">{errorMessage}</p>
        <button
          type="button"
          onClick={() => setPhase('capture')}
          className="mt-4 rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  return <MealCamera onCapture={handleCaptured} busy={phase === 'busy'} />;
}
