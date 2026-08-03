'use client';

import { CVS_DISPLAY_FONT, CVS_GOLD, CVS_FOREST } from './theme';
import { CVS_SCALE_LABELS } from '@/lib/core-values-snapshot/copy';
import { Card } from '@/components/layout';
import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';
import { useBleedTap } from '@/lib/motion/useBleedTap';
import { triggerHaptic } from '@/lib/haptics';

export type CvsOption = { value: string; label: string };

type SingleSelectProps = {
  prompt: string;
  options: CvsOption[];
  value: string | undefined;
  onChange: (value: string) => void;
};

/** Q1-Q4, Q11 — one focused question, options already shuffled by the caller (seeded per session, stable across re-renders and resumes). */
export function SingleSelectQuestion({ prompt, options, value, onChange }: SingleSelectProps) {
  return (
    <Card className="mef-animate-in">
      <h2 className={`${CVS_DISPLAY_FONT} text-2xl leading-snug text-[#1B3A2D]`}>{prompt}</h2>
      <div className="mt-6 space-y-3" role="radiogroup" aria-label={prompt}>
        {options.map((option) => (
          <QuestionOptionButton
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
            unselectedHoverClassName="hover:border-[#C4A050]/50 hover:bg-[#FAF7F0]"
          />
        ))}
      </div>
    </Card>
  );
}

type ScaleRowProps = {
  prompt: string;
  value: number | undefined;
  onChange: (value: number) => void;
};

function ScaleRow({ prompt, value, onChange }: ScaleRowProps) {
  return (
    <div className="py-4 first:pt-0">
      <p className="text-[15px] font-medium text-[#1B3A2D]">{prompt}</p>
      <div className="mt-3 flex items-center gap-2" role="radiogroup" aria-label={prompt}>
        {[1, 2, 3, 4, 5].map((n) => (
          <ScalePill key={n} n={n} selected={value === n} onSelect={() => onChange(n)} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-[#6B7A72]">
        <span>{CVS_SCALE_LABELS[1]}</span>
        <span>{CVS_SCALE_LABELS[3]}</span>
        <span>{CVS_SCALE_LABELS[5]}</span>
      </div>
    </div>
  );
}

/**
 * Micro-Interactions (Prompt 6): retrofits the app's one selection
 * language (ripple bleed from the tap point + a haptic tick) onto this
 * 1-5 pill scale via `useBleedTap`, extracted to its own component since
 * the hook can't be called inside a `.map()` callback. The gold fill on
 * selection is unchanged.
 */
function ScalePill({
  n,
  selected,
  onSelect,
}: {
  n: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { onPointerDown, bleedStyle } = useBleedTap();

  function handleClick() {
    triggerHaptic();
    onSelect();
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onPointerDown={onPointerDown}
      onClick={handleClick}
      style={bleedStyle}
      className={`mef-press mef-focus-ring relative isolate flex h-11 flex-1 items-center justify-center overflow-hidden rounded-xl border text-sm font-semibold transition ${
        selected
          ? 'border-transparent text-white shadow-[0_4px_12px_-4px_rgba(196,160,80,0.55)]'
          : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D] hover:border-[#C4A050]/50'
      } ${selected ? 'mef-bleed-active' : ''}`}
    >
      <span aria-hidden="true" className="mef-bleed-fill" style={{ backgroundColor: CVS_GOLD }} />
      <span className="relative z-10">{n}</span>
    </button>
  );
}

type ScaleBatteryProps = {
  intro: string;
  rows: { questionKey: string; prompt: string }[];
  values: Record<string, number | undefined>;
  onChange: (questionKey: string, value: number) => void;
};

/** Screen 2 — all six sliders on one screen, order rotated per member (seeded, stable within a session). */
export function ScaleBattery({ intro, rows, values, onChange }: ScaleBatteryProps) {
  return (
    <Card className="mef-animate-in">
      <p className="text-sm leading-relaxed text-[#6B7A72]">{intro}</p>
      <div className="mt-2 divide-y divide-[#1B3A2D]/8">
        {rows.map((row) => (
          <ScaleRow
            key={row.questionKey}
            prompt={row.prompt}
            value={values[row.questionKey]}
            onChange={(v) => onChange(row.questionKey, v)}
          />
        ))}
      </div>
    </Card>
  );
}

type Q12ChoiceProps = {
  prompt: string;
  options: CvsOption[];
  value: string | undefined;
  onChange: (value: string) => void;
};

/** Q12 — two big forced-choice tiles, left/right order randomized per session. */
export function Q12Choice({ prompt, options, value, onChange }: Q12ChoiceProps) {
  return (
    <Card className="mef-animate-in">
      <h2 className={`${CVS_DISPLAY_FONT} text-2xl leading-snug text-[#1B3A2D]`}>{prompt}</h2>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <Q12Tile
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onSelect={() => onChange(option.value)}
          />
        ))}
      </div>
    </Card>
  );
}

/**
 * Micro-Interactions (Prompt 6): retrofits the app's one selection
 * language (ripple bleed from the tap point + a haptic tick) onto Q12's
 * big forced-choice tiles via `useBleedTap`, extracted to its own
 * component since the hook can't be called inside a `.map()` callback.
 * The forest-green fill on selection is unchanged.
 */
function Q12Tile({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { onPointerDown, bleedStyle } = useBleedTap();

  function handleClick() {
    triggerHaptic();
    onSelect();
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onPointerDown={onPointerDown}
      onClick={handleClick}
      style={bleedStyle}
      className={`mef-press mef-focus-ring relative isolate flex min-h-[104px] flex-col items-center justify-center overflow-hidden rounded-2xl border px-5 py-6 text-center transition ${
        selected
          ? 'border-transparent text-white shadow-[0_8px_24px_-6px_rgba(27,58,45,0.45)]'
          : 'border-[#1B3A2D]/10 bg-white text-[#1B3A2D] hover:border-[#C4A050]/60'
      } ${selected ? 'mef-bleed-active' : ''}`}
    >
      <span aria-hidden="true" className="mef-bleed-fill" style={{ backgroundColor: CVS_FOREST }} />
      <span className={`relative z-10 ${CVS_DISPLAY_FONT} text-xl leading-tight`}>{label}</span>
    </button>
  );
}
