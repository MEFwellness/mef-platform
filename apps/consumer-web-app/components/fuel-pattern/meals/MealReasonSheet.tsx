'use client';

/**
 * The sheet that opens after she taps I do not eat this.
 *
 * =====================================================================
 * THE MEAL IS ALREADY GONE BEFORE THIS OPENS.
 * =====================================================================
 *
 * The card swapped the moment she tapped, and the rejection was recorded
 * with no reason at all. So this sheet is genuinely optional: closing it,
 * tapping outside it or pressing Skip all leave a complete, correct
 * record behind. It asks for more; it never asks for permission.
 *
 * =====================================================================
 * THE ALLERGY STEP EXISTS BECAUSE ONE BUTTON COULD NOT BE HONEST.
 * =====================================================================
 *
 * "Allergy" on a meal that carries dairy and nuts does not say which one
 * she means. Excluding both takes food away she never asked us to take
 * away, and excluding neither ignores her. So the sheet shows this meal's
 * own allergens, all of them already on, and she turns off the ones that
 * are fine. One tap gets the safe answer, and a second gets the precise
 * one. If she closes it there, the meal stays rejected and nothing
 * standing is recorded, because a guess is worse than a gap.
 *
 * Nothing on this sheet is medical. It records what to stop showing her.
 * There is no warning copy, no advice and no interpretation anywhere on
 * it, and that is deliberate rather than an omission.
 *
 * Drawn in ModalOverlay, which is the one frame every pop-up in this app
 * is drawn in, portalled to the body so no transformed ancestor can
 * capture it.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { FPA_REASON_LABEL, FPA_REASON_SHEET } from '@/lib/fuel-pattern/meals/copy';
import {
  FPA_REJECTION_REASONS,
  type FpaRejectionReason,
} from '@/lib/fuel-pattern/meals/preferences';
import type { FpaAllergen, FpaMeal } from '@/lib/fuel-pattern/meals/types';

const ALLERGEN_LABEL: Record<FpaAllergen, string> = {
  nuts: 'Nuts',
  dairy: 'Dairy',
  eggs: 'Eggs',
  fish: 'Fish',
  shellfish: 'Shellfish',
  gluten: 'Gluten',
  soy: 'Soy',
};

export type MealReasonAnswer = {
  reason: FpaRejectionReason;
  note: string | null;
  allergens: FpaAllergen[];
};

export function MealReasonSheet({
  meal,
  onAnswer,
  onClose,
}: {
  meal: FpaMeal;
  onAnswer: (answer: MealReasonAnswer) => void;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const [step, setStep] = useState<'reason' | 'allergy' | 'other'>('reason');
  const [allergens, setAllergens] = useState<FpaAllergen[]>(meal.allergens);
  const [note, setNote] = useState('');

  function choose(reason: FpaRejectionReason) {
    if (reason === 'allergy' && meal.allergens.length > 0) {
      setStep('allergy');
      return;
    }
    if (reason === 'other') {
      setStep('other');
      return;
    }
    onAnswer({ reason, note: null, allergens: [] });
  }

  return (
    <ModalOverlay testId="fpa-meal-reason-sheet" zIndexClassName="z-[70]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fpa-reason-title"
        className="mef-animate-in my-6 w-full max-w-md rounded-[28px] bg-[#FFFDF8] p-6 shadow-[0_24px_60px_-24px_rgba(27,58,45,0.55)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="fpa-reason-title"
            className={`${CVS_DISPLAY_FONT} text-[24px] leading-tight text-[#1B3A2D]`}
          >
            {step === 'allergy' ? FPA_REASON_SHEET.allergyTitle : FPA_REASON_SHEET.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={FPA_REASON_SHEET.close}
            className="mef-focus-ring mef-press -mr-1 -mt-1 rounded-full p-2 text-[#6B7A72] hover:bg-[#F3F6F4]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B7A72]">
          {step === 'allergy' ? FPA_REASON_SHEET.allergySubtitle : FPA_REASON_SHEET.subtitle}
        </p>

        {step === 'reason' && (
          <ul className="mt-5 space-y-2">
            {FPA_REJECTION_REASONS.map((reason) => (
              <li key={reason}>
                <button
                  type="button"
                  onClick={() => choose(reason)}
                  className="mef-focus-ring mef-press w-full rounded-2xl border border-[#1B3A2D]/10 bg-white px-4 py-3.5 text-left text-[15px] text-[#1B3A2D] transition hover:border-[#C4A050]/50 hover:bg-[#FDF9EF]"
                >
                  {FPA_REASON_LABEL[reason]}
                </button>
              </li>
            ))}
          </ul>
        )}

        {step === 'allergy' && (
          <>
            <ul className="mt-5 flex flex-wrap gap-2">
              {meal.allergens.map((allergen) => {
                const on = allergens.includes(allergen);
                return (
                  <li key={allergen}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setAllergens((current) =>
                          current.includes(allergen)
                            ? current.filter((value) => value !== allergen)
                            : [...current, allergen]
                        )
                      }
                      className={`mef-focus-ring mef-press rounded-full px-4 py-2 text-sm font-medium transition ${
                        on
                          ? 'bg-[#1B3A2D] text-[#F5F0E4]'
                          : 'border border-[#1B3A2D]/15 bg-white text-[#6B7A72]'
                      }`}
                    >
                      {ALLERGEN_LABEL[allergen]}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => onAnswer({ reason: 'allergy', note: null, allergens })}
              className="mef-focus-ring mef-press mt-5 w-full rounded-2xl bg-[#1B3A2D] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#163025]"
            >
              {FPA_REASON_SHEET.allergyConfirm}
            </button>
          </>
        )}

        {step === 'other' && (
          <>
            <label className="mt-5 block">
              <span className="sr-only">{FPA_REASON_SHEET.otherPlaceholder}</span>
              <input
                type="text"
                value={note}
                maxLength={200}
                onChange={(event) => setNote(event.target.value)}
                placeholder={FPA_REASON_SHEET.otherPlaceholder}
                className="mef-focus-ring w-full rounded-2xl border border-[#1B3A2D]/12 bg-white px-4 py-3.5 text-[15px] text-[#1B3A2D] placeholder:text-[#9AA79F]"
              />
            </label>
            <p className="mt-2 text-[12.5px] text-[#6B7A72]">{FPA_REASON_SHEET.otherHelp}</p>
            <button
              type="button"
              onClick={() =>
                onAnswer({ reason: 'other', note: note.trim() || null, allergens: [] })
              }
              className="mef-focus-ring mef-press mt-4 w-full rounded-2xl bg-[#1B3A2D] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#163025]"
            >
              {FPA_REASON_SHEET.save}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mef-focus-ring mef-press mt-3 w-full rounded-2xl px-6 py-3 text-center text-sm font-medium text-[#6B7A72] hover:bg-[#F3F6F4]"
        >
          {FPA_REASON_SHEET.skip}
        </button>
      </div>
    </ModalOverlay>
  );
}
