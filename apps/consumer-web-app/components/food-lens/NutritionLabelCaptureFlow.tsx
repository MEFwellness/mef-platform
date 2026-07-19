'use client';

/**
 * Multi-photo Nutrition Facts label capture — Part 1's "support multi-photo
 * capture so a member can scan the Nutrition Facts panel and ingredients
 * separately." Nutrition Facts panel is required; ingredients, allergens,
 * and front-of-package are each optional additional shots. Reuses
 * MealCamera.tsx for the actual capture UI (brightness check etc.) and the
 * exact same scan/upload/record actions as the meal-photo flow — only the
 * scan_type and capture role differ.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Camera, ShieldCheck, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  startFoodLensScanAction,
  buildFoodLensCaptureUploadPathAction,
  recordFoodLensCaptureAction,
} from '@/app/actions/food-lens';
import { analyzeFoodLensLabelScanAction } from '@/app/actions/food-label';
import { MealCamera } from './MealCamera';
import type { FoodLensLabelPhotoRole } from '@mef/shared-types-contracts';

type Phase = 'intro' | 'capture' | 'between' | 'busy' | 'error';

const ROLE_COPY: Record<FoodLensLabelPhotoRole, { title: string; hint: string }> = {
  nutrition_facts: {
    title: 'Photograph the Nutrition Facts panel',
    hint: 'Fill the frame with just the Nutrition Facts box for the clearest reading.',
  },
  ingredients: {
    title: 'Photograph the ingredient list',
    hint: 'This helps Root explain fat source, processing, and additives accurately.',
  },
  allergens: {
    title: 'Photograph the allergen statement',
    hint: 'The "Contains..." line, if this package has one.',
  },
  front_label: {
    title: 'Photograph the front of the package',
    hint: 'Helps identify the product name and brand.',
  },
};

const OPTIONAL_ROLE_ORDER: FoodLensLabelPhotoRole[] = ['ingredients', 'allergens', 'front_label'];

export function NutritionLabelCaptureFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<FoodLensLabelPhotoRole>('nutrition_facts');
  const [optionalIndex, setOptionalIndex] = useState(0);

  async function ensureScan(): Promise<string | null> {
    if (scanId) return scanId;
    const result = await startFoodLensScanAction('nutrition_label');
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
        captureType: 'label_image',
        labelPhotoRole: currentRole,
      });
      if (recorded.error) throw new Error(recorded.error);

      if (currentRole === 'nutrition_facts') {
        setCurrentRole(OPTIONAL_ROLE_ORDER[0]!);
        setOptionalIndex(0);
        setPhase('between');
        return;
      }

      goToNextOptionalOrFinish(currentScanId);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
      setPhase('error');
    }
  }

  async function goToNextOptionalOrFinish(currentScanId: string) {
    const nextIndex = optionalIndex + 1;
    if (nextIndex < OPTIONAL_ROLE_ORDER.length) {
      setOptionalIndex(nextIndex);
      setCurrentRole(OPTIONAL_ROLE_ORDER[nextIndex]!);
      setPhase('between');
      return;
    }
    await finishAndAnalyze(currentScanId);
  }

  async function finishAndAnalyze(currentScanId: string) {
    setPhase('busy');
    const result = await analyzeFoodLensLabelScanAction(currentScanId);
    if (result.status === 'failed') {
      setErrorMessage(result.error ?? 'Could not read this label.');
      setPhase('error');
      return;
    }
    router.push(`/food-lens/label/${currentScanId}` as Route);
  }

  if (phase === 'intro') {
    return (
      <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Scan a Label</p>
        </div>
        <h2 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Capture the Nutrition Facts
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Use this when a product isn&apos;t in our database yet. You&apos;ll photograph the
          Nutrition Facts panel, then you can add the ingredient list, allergen statement, and front
          of package too — each as its own photo. You&apos;ll review and confirm everything before
          it&apos;s saved.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#1B3A2D]/[0.04] p-3">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-xs leading-relaxed text-[#6B7A72]">
            Root never guesses a missing number — anything unclear is marked so you can confirm or
            fill it in yourself.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPhase('capture')}
          className="mt-5 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white"
        >
          Start with the Nutrition Facts panel
        </button>
      </div>
    );
  }

  if (phase === 'between') {
    const copy = ROLE_COPY[currentRole];
    return (
      <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
        <div className="flex items-center gap-2 text-[#1B3A2D]">
          <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          <p className="text-sm font-medium">Saved</p>
        </div>
        <h2 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          {copy.title}?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">{copy.hint}</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={async () => {
              if (scanId) await goToNextOptionalOrFinish(scanId);
            }}
            className="flex-1 rounded-full border border-[#1B3A2D]/15 py-3 text-sm font-medium text-[#1B3A2D]"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => setPhase('capture')}
            className="flex-1 rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white"
          >
            Add photo
          </button>
        </div>
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

  return (
    <div>
      {phase === 'capture' && (
        <p className="mb-3 text-center text-sm font-medium text-[#6B7A72]">
          {ROLE_COPY[currentRole].title}
        </p>
      )}
      <MealCamera onCapture={handleCaptured} busy={phase === 'busy'} />
    </div>
  );
}
