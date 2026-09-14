'use client';

/**
 * ONE QUESTION, ONE SCREEN.
 *
 * A DELIBERATE EXCEPTION to the app wide two-to-three questions a screen
 * standard the 2026-09-11 questionnaire pass set. That standard exists
 * because a screen holding one short question wastes a member's scroll,
 * and it is the right rule for the instruments it was written for. This
 * one asks twenty four questions about how food lands, several of them
 * with five long answers, and stacking two of those on one screen turns a
 * considered answer into a scan. Everything else about the answering
 * language is the shared one: the same option rows, the same gold
 * selection state, the same tick, the same press feedback.
 *
 * THE CARD IS THE SCREEN. Generous padding, a display headline in
 * Cormorant Garamond over the answers in DM Sans, and warm tinted
 * surfaces from the brand palette rather than a white form. The card
 * carries `.mef-screen-enter` keyed on the question, so each question
 * arrives with a short fade and a small rise rather than replacing the
 * last one in place, and `prefers-reduced-motion: reduce` turns that into
 * a plain fade (app/globals.css).
 */

import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';
import { useBleedTap } from '@/lib/motion/useBleedTap';
import { triggerHaptic } from '@/lib/haptics';
import { Check } from 'lucide-react';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { PLATE_SHAPES, PlateIllustration, PlateLegend } from './PlateIllustration';

export type FpaAnswerOption = { value: string; label: string; detail?: string };

export function parseFpaOptions(raw: unknown): FpaAnswerOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (o): o is { value: string; label: string; detail?: string } =>
        typeof o === 'object' && o !== null && 'value' in o && 'label' in o
    )
    .map((o) => (o.detail ? { value: o.value, label: o.label, detail: o.detail } : { value: o.value, label: o.label }));
}

type Props = {
  prompt: string;
  description?: string | null;
  options: FpaAnswerOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  /** True for the plate question, which is answered by picking a picture. */
  asPlates?: boolean;
  promptId: string;
};

export function FuelPatternQuestionScreen({
  prompt,
  description,
  options,
  value,
  onChange,
  asPlates = false,
  promptId,
}: Props) {
  return (
    <div className="mef-screen-enter rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-6 shadow-[0_18px_44px_-28px_rgba(27,58,45,0.45)] sm:p-8">
      <h2 id={promptId} className={`${CVS_DISPLAY_FONT} text-[26px] leading-[1.25] text-[#1B3A2D] sm:text-[30px]`}>
        {prompt}
      </h2>
      {description && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-[#6B7A72]">{description}</p>
      )}

      {asPlates ? (
        <PlateChoices options={options} value={value} onChange={onChange} promptId={promptId} />
      ) : (
        <div className="mt-6 space-y-2.5" role="radiogroup" aria-labelledby={promptId}>
          {options.map((option) => (
            <QuestionOptionButton
              key={option.value}
              label={option.label}
              selected={value === option.value}
              onSelect={() => onChange(option.value)}
              tone="gold-on-light"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The plate question. Three drawn plates and one plain row for "It really
 * depends.", which is an answer about the question rather than a fourth
 * plate and is drawn as what it is.
 */
function PlateChoices({
  options,
  value,
  onChange,
  promptId,
}: {
  options: FpaAnswerOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  promptId: string;
}) {
  const plates = options.filter((o) => PLATE_SHAPES[o.value]);
  const rest = options.filter((o) => !PLATE_SHAPES[o.value]);

  return (
    <div className="mt-6" role="radiogroup" aria-labelledby={promptId}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {plates.map((option) => (
          <PlateCard
            key={option.value}
            option={option}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
          />
        ))}
      </div>
      <div className="mt-3 space-y-2.5">
        {rest.map((option) => (
          <QuestionOptionButton
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
            tone="gold-on-light"
          />
        ))}
      </div>
    </div>
  );
}

function PlateCard({
  option,
  selected,
  onSelect,
}: {
  option: FpaAnswerOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const { onPointerDown, bleedStyle } = useBleedTap();
  const shape = PLATE_SHAPES[option.value]!;

  function handleClick() {
    triggerHaptic();
    onSelect();
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={option.detail ? `${option.label}. ${option.detail}` : option.label}
      onPointerDown={onPointerDown}
      onClick={handleClick}
      style={bleedStyle}
      className={`mef-press mef-focus-ring relative isolate flex w-full flex-col items-center overflow-hidden rounded-[22px] border px-4 py-5 text-center transition ${
        selected
          ? 'border-[#B08F3E] shadow-[0_10px_26px_-14px_rgba(176,143,62,0.8)]'
          : 'border-[#1B3A2D]/12 bg-[#F1F6F2] hover:border-[#C4A050]/45 hover:bg-[#E9F1EB]'
      } ${selected ? 'mef-bleed-active' : ''}`}
    >
      {/* The same ripple every other option row in this app uses, bleeding
          from the real tap point, at the questionnaire pass's gold. */}
      <span aria-hidden="true" className="mef-bleed-fill" style={{ backgroundColor: '#C4A050' }} />
      <span className="relative z-10 flex w-full flex-col items-center">
        <PlateIllustration shape={shape} />
        <span
          className={`mt-3 text-[15px] leading-snug ${selected ? 'font-semibold text-[#173025]' : 'font-medium text-[#1B3A2D]'}`}
        >
          {option.label}
        </span>
        {option.detail && (
          <span className={`mt-1 text-[12px] leading-snug ${selected ? 'text-[#2B4436]' : 'text-[#6B7A72]'}`}>
            {option.detail}
          </span>
        )}
        <PlateLegend shape={shape} />
        {selected && (
          <Check className="mef-q-check-in mt-3 h-5 w-5 text-[#173025]" strokeWidth={2.25} aria-hidden="true" />
        )}
      </span>
    </button>
  );
}
