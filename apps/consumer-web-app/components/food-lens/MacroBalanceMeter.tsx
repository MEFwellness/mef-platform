/**
 * A qualitative protein/carb/fat visual — deliberately three ordinal bars,
 * not a pie chart with percentages, so it never implies false precision
 * (docs/food-lens/01-architecture.md §1.3). Each bar is annotated with its
 * own confidence, since a low-confidence dimension shouldn't read as
 * certain just because it's drawn the same way as a high-confidence one.
 *
 * 'none' is a distinct level from 'low' — a macro that's essentially absent
 * (a soda's protein/fat) reads as "None detected," not "Low," and gets no
 * filled bar at all, never a sliver implying a small-but-real amount.
 */

import type { FoodLensMealMacroLevel } from '@mef/shared-types-contracts';

const LEVEL_WIDTH: Record<FoodLensMealMacroLevel, string> = {
  none: '0%',
  low: '33%',
  moderate: '66%',
  high: '100%',
};

const LEVEL_LABEL: Record<FoodLensMealMacroLevel, string> = {
  none: 'None detected',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

type Dimension = { label: string; level: FoodLensMealMacroLevel; confidence: number };

function Bar({ dimension }: { dimension: Dimension }) {
  const isNone = dimension.level === 'none';
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
        {/* No filled portion at all when the macro is effectively absent — a
            0%-width bar renders nothing, never a sliver that could read as
            "a small amount." */}
        {!isNone && (
          <div
            className="h-full rounded-full bg-[#1B3A2D]/70"
            style={{ width: LEVEL_WIDTH[dimension.level], opacity: 0.4 + dimension.confidence * 0.6 }}
          />
        )}
      </div>
    </div>
  );
}

export function MacroBalanceMeter({
  protein,
  carb,
  fat,
}: {
  protein: { level: FoodLensMealMacroLevel; confidence: number };
  carb: { level: FoodLensMealMacroLevel; confidence: number };
  fat: { level: FoodLensMealMacroLevel; confidence: number };
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-[#9AA79F]">
        Confidence below is how sure Root is about the amount of each nutrient — not whether the
        food itself was identified correctly (see the items list for that).
      </p>
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
