'use client';

/**
 * Restaurant Intelligence entry wizard (Food Lens Part 8, "first useful
 * version") — lets a member choose exactly the four input modes the
 * product requirement calls for: type a restaurant + menu item name,
 * paste menu text, photograph a menu, or photograph their actual
 * restaurant meal. The two photo modes reuse Food Lens's existing
 * meal-photo scan machinery unchanged (MealCamera + the same start/
 * upload/record/analyze action calls FoodLensCaptureFlow.tsx uses) —
 * this component never duplicates that pipeline.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { Camera, FileText, Search, ShieldCheck, UtensilsCrossed } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { RestaurantEntrySource } from '@mef/shared-types-contracts';
import {
  startFoodLensScanAction,
  buildFoodLensCaptureUploadPathAction,
  recordFoodLensCaptureAction,
  analyzeFoodLensScanAction,
} from '@/app/actions/food-lens';
import {
  createRestaurantMealEntryAction,
  analyzeRestaurantMealEntryAction,
} from '@/app/actions/restaurant';
import { MealCamera } from '@/components/food-lens/MealCamera';

type Mode = 'choose' | 'name_entry' | 'menu_text' | 'menu_photo' | 'meal_photo' | 'error';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

const MODE_OPTIONS: Array<{
  mode: Mode;
  source: RestaurantEntrySource;
  icon: typeof Search;
  title: string;
  description: string;
}> = [
  {
    mode: 'name_entry',
    source: 'manual_entry',
    icon: Search,
    title: 'Type a restaurant and item',
    description: 'Enter the restaurant name and a menu item — the quickest way to get Root’s take.',
  },
  {
    mode: 'menu_text',
    source: 'menu_text',
    icon: FileText,
    title: 'Paste menu text',
    description: 'Copy and paste a menu (or part of one) — Root can look for lighter-prep alternatives in it too.',
  },
  {
    mode: 'menu_photo',
    source: 'menu_photo',
    icon: Camera,
    title: 'Photograph a menu',
    description: 'Snap a photo of the menu or the item you’re considering.',
  },
  {
    mode: 'meal_photo',
    source: 'meal_photo',
    icon: UtensilsCrossed,
    title: 'Photograph your meal',
    description: 'Already have your plate in front of you? Photograph it instead.',
  },
];

export function RestaurantEntryFlow() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('choose');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [menuItemName, setMenuItemName] = useState('');
  const [rawMenuText, setRawMenuText] = useState('');

  async function finishEntry(
    source: RestaurantEntrySource,
    opts: { scanId?: string | null; rawMenuText?: string | null } = {}
  ) {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      if (!restaurantName.trim()) {
        setErrorMessage('Please enter a restaurant name.');
        setMode('name_entry');
        setSubmitting(false);
        return;
      }

      const created = await createRestaurantMealEntryAction({
        restaurantName: restaurantName.trim(),
        menuItemName: menuItemName.trim() || null,
        source,
        rawMenuText: opts.rawMenuText ?? null,
        scanId: opts.scanId ?? null,
      });
      if (created.error || !created.entry) {
        throw new Error(created.error ?? 'Could not save this entry.');
      }

      const analyzed = await analyzeRestaurantMealEntryAction(created.entry.id);
      if (analyzed.error || !analyzed.entry) {
        throw new Error(analyzed.error ?? 'Could not analyze this entry.');
      }

      router.push(`/food-lens/restaurant/${created.entry.id}` as Route);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setMode('error');
      setSubmitting(false);
    }
  }

  async function handlePhotoCaptured(source: RestaurantEntrySource, blob: Blob) {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const scanResult = await startFoodLensScanAction('meal_photo');
      if (scanResult.error || !scanResult.scan) {
        throw new Error(scanResult.error ?? 'Could not start this scan.');
      }
      const scanId = scanResult.scan.id;

      const captureId = crypto.randomUUID();
      const target = await buildFoodLensCaptureUploadPathAction(scanId, captureId, 'jpg');
      if (!target) throw new Error('Could not prepare upload.');

      const browserClient = createClient();
      const { error: uploadError } = await browserClient.storage
        .from(target.bucket)
        .upload(target.path, blob, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;

      const recorded = await recordFoodLensCaptureAction({
        captureId,
        scanId,
        storagePath: target.path,
        captureType: 'photo',
      });
      if (recorded.error) throw new Error(recorded.error);

      // Runs Food Lens's own vision pipeline so its identified items can
      // feed in as this entry's visual-estimate signal — see
      // lib/restaurant/menuItemHeuristics.ts.
      const analysis = await analyzeFoodLensScanAction(scanId);
      if (analysis.status === 'failed') {
        throw new Error(analysis.error ?? 'Photo analysis failed.');
      }

      await finishEntry(source, { scanId });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setMode('error');
      setSubmitting(false);
    }
  }

  if (mode === 'choose') {
    return (
      <div className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <UtensilsCrossed className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Restaurant Intelligence</p>
        </div>
        <h2 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl text-[#1B3A2D]">
          Eating out? Root can help.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#6B7A72]">
          Restaurants rarely publish full nutrition data, so this is coaching based on the best
          information available — never a guess dressed up as a fact. You&apos;ll always see
          exactly where the analysis came from.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#1B3A2D]/[0.04] p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-xs leading-relaxed text-[#6B7A72]">
            Choose whatever information you actually have — just a name, pasted menu text, or a
            photo. More detail means a more specific (though still estimated) analysis.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {MODE_OPTIONS.map(({ mode: optionMode, icon: Icon, title, description }) => (
            <button
              key={optionMode}
              type="button"
              onClick={() => setMode(optionMode)}
              className="flex w-full items-start gap-3 rounded-2xl border border-[#1B3A2D]/10 p-4 text-left"
            >
              <span className="mt-0.5 rounded-full bg-[#1B3A2D]/[0.06] p-2 text-[#1B3A2D]">
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-[#1B3A2D]">{title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[#6B7A72]">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'name_entry' || mode === 'menu_text') {
    return (
      <div className={`${CARD} p-6`}>
        <button
          type="button"
          onClick={() => setMode('choose')}
          className="text-xs font-medium text-[#6B7A72]"
        >
          &larr; Choose a different way
        </button>
        <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-xl text-[#1B3A2D]">
          {mode === 'menu_text' ? 'Paste menu text' : 'Restaurant and item'}
        </h2>

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Restaurant name
        </label>
        <input
          type="text"
          value={restaurantName}
          onChange={(e) => setRestaurantName(e.target.value)}
          placeholder="e.g. Sunrise Grill"
          className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-sm text-[#1B3A2D]"
        />

        <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Menu item {mode === 'menu_text' ? '(optional)' : ''}
        </label>
        <input
          type="text"
          value={menuItemName}
          onChange={(e) => setMenuItemName(e.target.value)}
          placeholder="e.g. Grilled Salmon Bowl"
          className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-sm text-[#1B3A2D]"
        />

        {mode === 'menu_text' && (
          <>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
              Menu text
            </label>
            <textarea
              value={rawMenuText}
              onChange={(e) => setRawMenuText(e.target.value)}
              rows={6}
              placeholder="Paste as much of the menu as you have — the item and anything else on the menu."
              className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-sm text-[#1B3A2D]"
            />
          </>
        )}

        {errorMessage && <p className="mt-3 text-sm text-[#B45309]">{errorMessage}</p>}

        <button
          type="button"
          disabled={submitting}
          onClick={() =>
            mode === 'menu_text'
              ? finishEntry('menu_text', { rawMenuText })
              : finishEntry('manual_entry')
          }
          className="mt-5 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Getting Root’s take…' : "Get Root's take"}
        </button>
      </div>
    );
  }

  if (mode === 'menu_photo' || mode === 'meal_photo') {
    return (
      <div className="space-y-4">
        <div className={`${CARD} p-6`}>
          <button
            type="button"
            onClick={() => setMode('choose')}
            className="text-xs font-medium text-[#6B7A72]"
          >
            &larr; Choose a different way
          </button>
          <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-xl text-[#1B3A2D]">
            {mode === 'menu_photo' ? 'Photograph the menu' : 'Photograph your meal'}
          </h2>
          <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Restaurant name
          </label>
          <input
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="e.g. Sunrise Grill"
            className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-sm text-[#1B3A2D]"
          />
          <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
            Menu item (optional)
          </label>
          <input
            type="text"
            value={menuItemName}
            onChange={(e) => setMenuItemName(e.target.value)}
            placeholder="e.g. Grilled Salmon Bowl"
            className="mt-1 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2.5 text-sm text-[#1B3A2D]"
          />
        </div>

        {errorMessage && (
          <div className={`${CARD} p-6 text-center`}>
            <p className="text-sm text-[#B45309]">{errorMessage}</p>
          </div>
        )}

        <MealCamera
          onCapture={(blob) => handlePhotoCaptured(mode === 'menu_photo' ? 'menu_photo' : 'meal_photo', blob)}
          busy={submitting}
        />
        {submitting && (
          <p className="text-center text-xs text-[#6B7A72]">Getting Root&apos;s take on this one…</p>
        )}
      </div>
    );
  }

  return (
    <div className={`${CARD} p-6 text-center`}>
      <p className="text-sm text-[#B45309]">{errorMessage}</p>
      <button
        type="button"
        onClick={() => setMode('choose')}
        className="mt-4 rounded-full bg-[#1B3A2D] px-6 py-2.5 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
