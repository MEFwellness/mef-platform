'use client';

/**
 * The member's own Primal Pattern target for Food Lens: three ordinal
 * emphasis levels she sets herself.
 *
 * NOT the same thing as the Primal Pattern Diet Type questionnaire, which
 * is live in the registry and classifies her dietary pattern as polar,
 * variable or equatorial. That instrument writes its own result rows and
 * does not write primal_pattern_profiles, so it cannot stand in for this
 * control today. Wiring the two together is a feature, not a copy change;
 * until somebody builds it, this screen says what it does and promises
 * nothing (C4, 2026-08-27). The contract downstream is
 * primal_pattern_profiles itself, so whatever eventually sets it, nothing
 * else in Food Lens has to change.
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
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onChange(level)}
            className={`mef-press rounded-xl border py-2 text-xs font-medium capitalize transition ${
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
  const [protein, setProtein] = useState<FoodLensMacroLevel>(
    initial?.protein_emphasis ?? 'moderate'
  );
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
      <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Your Primal Pattern target
      </p>
      {/* C4 (2026-08-27). This used to end "Set it manually for now. A full
          questionnaire is on the way." An undated promise to a paying
          member is not copy, and it had been on the screen long enough to
          be a broken one. It is replaced by what is actually true: this
          control is the target, she owns it, and she can change it. */}
      <p className="mt-2 text-xs leading-relaxed text-[#6B7A72]">
        This is what Food Lens compares your meals against. Set it to how you eat now, and change it
        any time that changes.
      </p>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          Pattern name
        </p>
        <input
          type="text"
          value={patternLabel}
          onChange={(e) => setPatternLabel(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-[#1B3A2D]/15 px-3 py-2 text-base text-[#1B3A2D]"
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
        className="mef-press mt-5 w-full rounded-full bg-[#1B3A2D] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save my pattern'}
      </button>
    </div>
  );
}
