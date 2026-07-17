/**
 * The Meal Quality indicator — a simple three-level, explainable signal
 * shown near the top of every completed scan's results, before Macro
 * Balance. The rating and explanation both come from the deterministic
 * lib/food-lens/mealQuality.ts, never generated fresh here or by an LLM —
 * this component only renders what it's given. Color is never the only
 * signal: the written label and explanation are always shown alongside it.
 */

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { FoodLensMealQualityRatingValue } from '@mef/shared-types-contracts';

const RATING_CONFIG: Record<
  FoodLensMealQualityRatingValue,
  { label: string; Icon: typeof CheckCircle2; bgClass: string; textClass: string; iconClass: string }
> = {
  green: {
    label: 'Strong choice',
    Icon: CheckCircle2,
    bgClass: 'bg-[#1B3A2D]/[0.06]',
    textClass: 'text-[#1B3A2D]',
    iconClass: 'text-[#1B3A2D]',
  },
  yellow: {
    label: 'Use with awareness',
    Icon: AlertTriangle,
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    iconClass: 'text-amber-700',
  },
  red: {
    label: 'Limited nutritional value',
    Icon: XCircle,
    // A refined, muted brick red — distinct from the warm amber used for
    // yellow above, but deliberately not a harsh/neon red.
    bgClass: 'bg-[#9F3A38]/[0.10]',
    textClass: 'text-[#9F3A38]',
    iconClass: 'text-[#9F3A38]',
  },
};

export function MealQualityIndicator({
  rating,
  explanation,
}: {
  rating: FoodLensMealQualityRatingValue;
  explanation: string;
}) {
  const config = RATING_CONFIG[rating];
  const Icon = config.Icon;

  return (
    <div className={`rounded-[28px] p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] ${config.bgClass}`}>
      <div className="flex items-start gap-2">
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${config.iconClass}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <p className={`text-sm font-semibold uppercase tracking-wide ${config.textClass}`}>
          {config.label}
        </p>
      </div>
      <p className={`mt-2 text-[15px] leading-relaxed ${config.textClass}`}>{explanation}</p>
    </div>
  );
}
