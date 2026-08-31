/**
 * A qualitative protein/carb/fat visual — deliberately three ordinal bars,
 * not a pie chart with percentages, so it never implies false precision
 * (docs/food-lens/01-architecture.md §1.3). Each bar is annotated with its
 * own confidence, since a low-confidence dimension shouldn't read as
 * certain just because it's drawn the same way as a high-confidence one.
 *
 * Phase 2 added estimated grams beside this card and changed NOTHING here:
 * a level answers "how is this plate balanced", grams answer "how much food
 * is there", and they are different questions. The copy below used to deny
 * that a photo ever produces a number at all, which stopped being true, so
 * it now names what this card is instead of denying what the card beside it
 * does.
 *
 * 'none' is a distinct level from 'low' — a macro that's essentially absent
 * (a soda's protein/fat) reads as "None detected," not "Low," and gets no
 * filled bar at all, never a sliver implying a small-but-real amount.
 *
 * Color system (deliberately never red/green — those are reserved for the
 * overall Meal Quality rating, since a high macro amount is not itself
 * good or bad, e.g. sweet potato is carb-'high' and still a green meal):
 * - none: neutral gray track, no fill.
 * - low: muted blue-gray.
 * - moderate: warm amber.
 * - high: a deeper amber/rust — same warm family as moderate, one shade
 *   more intense, so "more of this macro" reads as a visual progression
 *   rather than three unrelated colors.
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

/** Fill color per level — amount only, never a quality judgment. */
const LEVEL_FILL_CLASS: Record<Exclude<FoodLensMealMacroLevel, 'none'>, string> = {
  low: 'bg-[#64748B]',
  moderate: 'bg-[#D97706]',
  high: 'bg-[#B45309]',
};

type Dimension = { label: string; level: FoodLensMealMacroLevel; confidence: number };

function Bar({ dimension }: { dimension: Dimension }) {
  const level = dimension.level;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">
          {dimension.label}
        </p>
        {/* Trust cleanup, 2026-08-17: the "· 62% confidence" that used to
            follow the level is gone, with every other confidence claim on
            a member screen. The per-macro score still arrives and still
            sets the fill's weight below; it is no longer stated as a
            number, because a member has no way to know that this number
            and the one the Root Score used to print are different
            quantities under the same word. */}
        <p className="text-right text-xs text-[#6B7A72]">{LEVEL_LABEL[dimension.level]}</p>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#E7E9E7]">
        {/* No filled portion at all when the macro is effectively absent — a
            0%-width bar renders nothing, never a sliver that could read as
            "a small amount." */}
        {level !== 'none' && (
          <div
            className={`h-full rounded-full ${LEVEL_FILL_CLASS[level]}`}
            style={{ width: LEVEL_WIDTH[level], opacity: 0.55 + dimension.confidence * 0.45 }}
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
      <p className="text-[11px] leading-relaxed text-[#6B7A72]">
        Confidence below is how sure Root is about the amount of each nutrient, not whether the
        food itself was identified correctly (see the items list for that).
      </p>
      <Bar dimension={{ label: 'Protein', ...protein }} />
      <Bar dimension={{ label: 'Carbohydrate', ...carb }} />
      <Bar dimension={{ label: 'Fat', ...fat }} />
      <p className="text-[11px] leading-relaxed text-[#6B7A72]">
        This is the balance between the three, not an amount. The estimated grams are shown
        separately. A high amount here isn&apos;t automatically good or bad. See Root&apos;s take
        for that.
      </p>
    </div>
  );
}
