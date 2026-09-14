'use client';

/**
 * The quick check. Three taps, and a fourth she can skip.
 *
 * =====================================================================
 * THERE IS NO SUBMIT BUTTON, AND THAT IS THE WHOLE DESIGN.
 * =====================================================================
 *
 * The brief is ten seconds, three taps, no extra screens. A Save button
 * would make it four taps for the ordinary case and would turn a moment
 * of noticing into a small form. So the check is written the instant the
 * third of the three required answers lands, and the sheet says one warm
 * thing and closes.
 *
 * WHICH IS WHY THE OPTIONAL MEAL ROW IS ON SCREEN FROM THE FIRST TICK,
 * below the three questions and clearly marked optional, rather than
 * arriving afterwards. If it appeared after the third tap it would need
 * a second write to attach itself to a row that already exists, and a
 * second write is a second thing that can fail. Sitting there from the
 * start, it is genuinely one tap, at any point before she finishes.
 *
 * =====================================================================
 * NOTHING HERE GRADES HER.
 * =====================================================================
 *
 * No streak, no score, no target, no "you have not logged since". Several
 * checks in a day are ordinary and a day with none is ordinary, so there
 * is nothing on this sheet for either to be measured against.
 *
 * Drawn in ModalOverlay, the one frame every pop-up in this app is drawn
 * in, portalled to the body so no transformed ancestor can capture it.
 */

import { useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import {
  FPA_CHECK_MEAL_TYPE_LABEL,
  FPA_CLARITY_LABEL,
  FPA_ENERGY_LABEL,
  FPA_HUNGER_LABEL,
  FPA_QUICK_CHECK,
} from '@/lib/fuel-pattern/experiment/copy';
import {
  FPA_CLARITY_ANSWERS,
  FPA_ENERGY_ANSWERS,
  FPA_HUNGER_ANSWERS,
  type FpaClarityAnswer,
  type FpaEnergyAnswer,
  type FpaHungerAnswer,
} from '@/lib/fuel-pattern/experiment/types';
import type { FpaTaggableMeal } from '@/lib/fuel-pattern/experiment/payload';
import { FPA_MEAL_TYPES, type FpaMealType } from '@/lib/fuel-pattern/meals/types';

/** How long the confirmation line holds before the sheet closes itself. */
const CONFIRMATION_MS = 1100;

export type FpaQuickCheckAnswer = {
  energy: FpaEnergyAnswer;
  hunger: FpaHungerAnswer;
  clarity: FpaClarityAnswer;
  mealType: FpaMealType | null;
  mealId: string | null;
};

const ROW_HEADER = 'text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#6B7A72]';

export function QuickCheckSheet({
  taggableMeals,
  onAnswer,
  onClose,
}: {
  /** Meals she is looking at, offered as a one tap tag. May be empty. */
  taggableMeals: FpaTaggableMeal[];
  /** Called once, with the whole check, the moment the third required tap lands. */
  onAnswer: (answer: FpaQuickCheckAnswer) => void;
  onClose: () => void;
}) {
  useBodyScrollLock(true);

  const [energy, setEnergy] = useState<FpaEnergyAnswer | null>(null);
  const [hunger, setHunger] = useState<FpaHungerAnswer | null>(null);
  const [clarity, setClarity] = useState<FpaClarityAnswer | null>(null);
  const [mealType, setMealType] = useState<FpaMealType | null>(null);
  const [mealId, setMealId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  /*
    ANSWERED ONCE, EVER. Two taps landing in the same tick on a slow
    phone would otherwise write two rows for one check, and a ref is the
    only thing that is already true by the time the second handler runs.
  */
  const sent = useRef(false);

  const complete = useCallback(
    (next: {
      energy: FpaEnergyAnswer | null;
      hunger: FpaHungerAnswer | null;
      clarity: FpaClarityAnswer | null;
      mealType: FpaMealType | null;
      mealId: string | null;
    }) => {
      if (sent.current) return;
      if (!next.energy || !next.hunger || !next.clarity) return;
      sent.current = true;
      onAnswer({
        energy: next.energy,
        hunger: next.hunger,
        clarity: next.clarity,
        mealType: next.mealType,
        mealId: next.mealId,
      });
      setConfirmed(true);
      setTimeout(onClose, CONFIRMATION_MS);
    },
    [onAnswer, onClose]
  );

  const current = { energy, hunger, clarity, mealType, mealId };

  return (
    <ModalOverlay testId="fpa-quick-check-sheet" zIndexClassName="z-[70]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="fpa-quick-check-title"
        className="mef-animate-in my-6 w-full max-w-md rounded-[28px] bg-[#FFFDF8] p-6 shadow-[0_24px_60px_-24px_rgba(27,58,45,0.55)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="fpa-quick-check-title"
            className={`${CVS_DISPLAY_FONT} text-[24px] leading-tight text-[#1B3A2D]`}
          >
            {FPA_QUICK_CHECK.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={FPA_QUICK_CHECK.close}
            className="mef-focus-ring mef-press -mr-1 -mt-1 rounded-full p-2 text-[#6B7A72] hover:bg-[#F3F6F4]"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {confirmed ? (
          /* One warm line, and then it is gone. Nothing to read, nothing
             to dismiss, nothing to do next. */
          <p
            role="status"
            data-fpa-quick-check-confirmation
            className="mt-6 mb-2 text-center text-[16px] leading-relaxed text-[#1B3A2D]"
          >
            {FPA_QUICK_CHECK.confirmation}
          </p>
        ) : (
          <>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B7A72]">
              {FPA_QUICK_CHECK.subtitle}
            </p>

            <Row header={FPA_QUICK_CHECK.energyHeader}>
              {FPA_ENERGY_ANSWERS.map((value) => (
                <Choice
                  key={value}
                  label={FPA_ENERGY_LABEL[value]}
                  on={energy === value}
                  onClick={() => {
                    setEnergy(value);
                    complete({ ...current, energy: value });
                  }}
                />
              ))}
            </Row>

            <Row header={FPA_QUICK_CHECK.hungerHeader}>
              {FPA_HUNGER_ANSWERS.map((value) => (
                <Choice
                  key={value}
                  label={FPA_HUNGER_LABEL[value]}
                  on={hunger === value}
                  onClick={() => {
                    setHunger(value);
                    complete({ ...current, hunger: value });
                  }}
                />
              ))}
            </Row>

            <Row header={FPA_QUICK_CHECK.clarityHeader}>
              {FPA_CLARITY_ANSWERS.map((value) => (
                <Choice
                  key={value}
                  label={FPA_CLARITY_LABEL[value]}
                  on={clarity === value}
                  onClick={() => {
                    setClarity(value);
                    complete({ ...current, clarity: value });
                  }}
                />
              ))}
            </Row>

            {/* The optional fourth tap. One row, skippable, and on screen
                from the start so that taking it is genuinely one tap. */}
            <div className="mt-5 border-t border-[#1B3A2D]/8 pt-4">
              <p className={ROW_HEADER}>
                {FPA_QUICK_CHECK.mealHeader}
                <span className="ml-2 font-normal normal-case tracking-normal text-[#9AA79F]">
                  {FPA_QUICK_CHECK.mealOptional}
                </span>
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {FPA_MEAL_TYPES.map((type) => (
                  <Choice
                    key={type}
                    label={FPA_CHECK_MEAL_TYPE_LABEL[type]}
                    on={mealType === type && mealId === null}
                    compact
                    onClick={() => {
                      setMealType(type);
                      setMealId(null);
                    }}
                  />
                ))}
              </div>
              {taggableMeals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {taggableMeals.map((meal) => (
                    <Choice
                      key={meal.id}
                      label={meal.name}
                      on={mealId === meal.id}
                      compact
                      onClick={() => {
                        setMealId(meal.id);
                        setMealType(meal.type as FpaMealType);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  );
}

function Row({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      {/* The one header in this feature that carries digits, and it
          carries them because the question is about two to three hours
          and saying that in words would be coy. */}
      <p className={ROW_HEADER} data-fpa-digits>
        {header}
      </p>
      <div className="mt-2.5 grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function Choice({
  label,
  on,
  onClick,
  compact = false,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`mef-focus-ring mef-press rounded-2xl text-center font-medium transition ${
        compact ? 'rounded-full px-3.5 py-2 text-[13px]' : 'px-2 py-3 text-[14px]'
      } ${
        on
          ? 'bg-[#1B3A2D] text-[#F5F0E4]'
          : 'border border-[#1B3A2D]/12 bg-white text-[#1B3A2D] hover:border-[#C4A050]/50 hover:bg-[#FDF9EF]'
      }`}
    >
      {label}
    </button>
  );
}
