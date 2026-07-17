/**
 * A qualitative protein/carb/fat visual — deliberately three ordinal bars,
 * not a pie chart with percentages, so it never implies false precision
 * (docs/food-lens/01-architecture.md §1.3). Each bar is annotated with its
 * own confidence, since a low-confidence dimension shouldn't read as
 * certain just because it's drawn the same way as a high-confidence one.
 */

import type { FoodLensMacroLevel } from '@mef/shared-types-contracts';

const LEVEL_WIDTH: Record<FoodLensMacroLevel, string> = {
  low: '33%',
  moderate: '66%',
  high: '100%',
};

const LEVEL_LABEL: Record<FoodLensMacroLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

type Dimension = { label: string; level: FoodLensMacroLevel; confidence: number };

function Bar({ dimension }: { dimension: Dimension }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E]">
          {dimension.label}
        </p>
        <p className="text-xs text-[#9AA79F]">
          {LEVEL_LABEL[dimension.level]} · {(dimension.confidence * 100).toFixed(0)}% confidence
        </p>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/[0.08]">
        <div
          className="h-full rounded-full bg-[#1B3A2D]/70"
          style={{ width: LEVEL_WIDTH[dimension.level], opacity: 0.4 + dimension.confidence * 0.6 }}
        />
      </div>
    </div>
  );
}

export function MacroBalanceMeter({
  protein,
  carb,
  fat,
}: {
  protein: { level: FoodLensMacroLevel; confidence: number };
  carb: { level: FoodLensMacroLevel; confidence: number };
  fat: { level: FoodLensMacroLevel; confidence: number };
}) {
  return (
    <div className="space-y-3">
      <Bar dimension={{ label: 'Protein', ...protein }} />
      <Bar dimension={{ label: 'Carbohydrate', ...carb }} />
      <Bar dimension={{ label: 'Fat', ...fat }} />
      <p className="text-[11px] leading-relaxed text-[#9AA79F]">
        These are rough, relative estimates from your photo, not exact measurements — never a
        calorie count or gram weight.
      </p>
    </div>
  );
}
