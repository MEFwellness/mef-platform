'use client';

/**
 * Phase 1 manual-entry placeholder for the Primal Pattern target (docs/
 * food-lens/06-roadmap.md phase 1, docs/food-lens/05-primal-pattern-
 * integration.md §5.2) — no Primal Pattern questionnaire scoring engine
 * exists in this codebase yet, so a member sets their own three ordinal
 * emphasis levels directly. Swapping in the real questionnaire later means
 * replacing this form, not changing anything downstream in Food Lens (the
 * contract is primal_pattern_profiles itself).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FoodLensMacroLevel, PrimalPatternProfile } from '@mef/shared-types-contracts';
import { setManualPrimalPatternProfileAction } from '@/app/actions/food-lens';

const LEVELS: FoodLensMacroLevel[] = ['low', 'moderate', 'high'];

function LevelPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FoodLensMacroLevel;
  onChange: (level: FoodLensMacroLevel) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">{label}</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={`rounded-xl border py-2 text-xs font-medium capitalize transition ${
              value === level
                ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                : 'border-[#1B3A2D]/15 text-[#1B3A2D] hover:bg-[#1B3A2D]/[0.04]'
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PrimalPatternForm({ initial }: { initial: PrimalPatternProfile | null }) {
  const router = useRouter();
  const [patternLabel, setPatternLabel] = useState(initial?.pattern_label ?? 'My Eating Pattern');
  const [protein, setProtein] = useState<FoodLensMacroLevel>(initial?.protein_emphasis ?? 'moderate');
  const [carb, setCarb] = useState<FoodLensMacroLevel>(initial?.carb_emphasis ?? 'moderate');
  const [fat, setFat] = useState<FoodLensMacroLevel>(initial?.fat_emphasis ?? 'moderate');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await setManualPrimalPatternProfileAction({
      patternLabel: patternLabel.trim() || 'My Eating Pattern',
      proteinEmphasis: protein,
      carbEmphasis: carb,
      fatEmphasis: fat,
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <p className="text-sm font-semibold uppercase tracking-wider text-[#854D0E]">
        Your Primal Pattern target
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
        This is what Food Lens compares your meals against. Set it manually for now — a full
        questionnaire is on the way.
      </p>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">Pattern name</p>
        <input
          type="text"
          value={patternLabel}
          onChange={(e) => setPatternLabel(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-sm text-[#1B3A2D]"
        />
      </div>

      <div className="mt-4 space-y-4">
        <LevelPicker label="Protein emphasis" value={protein} onChange={setProtein} />
        <LevelPicker label="Carbohydrate emphasis" value={carb} onChange={setCarb} />
        <LevelPicker label="Fat emphasis" value={fat} onChange={setFat} />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-5 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save my pattern'}
      </button>
    </div>
  );
}
