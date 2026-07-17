# 5. Primal Pattern Diet Integration

## 5.1 Scope boundary — read this first

A repo-wide search turned up **no existing Primal Pattern Diet questionnaire, scoring logic, or
macro-emphasis concept anywhere in this codebase.** The closest thing is the "Four Doctors"
wellness-area taxonomy (`lib/intelligence/strengthEngine.ts` / `patternEngine.ts`), which has a
generic `doctor_diet` bucket but no macro/protein/carb/fat concept and no personalized diet
classification — it's a strength/gap score, not a diet plan.

The task description refers to "your proprietary logic" for turning questionnaire answers into a
macro emphasis. This blueprint **does not attempt to design that scoring algorithm** — that's
MEF's IP and a separate body of work. What follows is the narrow **contract** Food Lens needs from
whatever that system turns out to be, so the two can be built independently and joined at a single,
well-defined seam.

## 5.2 The contract

Food Lens needs exactly one thing from the Primal Pattern engine, per member: a row shaped like
`primal_pattern_profiles` (doc 3 §3.6) —

```ts
type MacroLevel = 'low' | 'moderate' | 'high';

interface PrimalPatternProfile {
  id: string;
  memberId: string;
  patternLabel: string;        // human-readable name, owned entirely by the proprietary engine
  proteinEmphasis: MacroLevel;
  carbEmphasis: MacroLevel;
  fatEmphasis: MacroLevel;
  isActive: boolean;
  createdAt: string;
}
```

That's the entire surface area. Whatever questionnaire, scoring weights, or classification rules
produce this triplet are completely opaque to Food Lens — it only ever reads the *result* via
`getActivePrimalPatternProfileAction` (doc 4 §4.4). This means:

- The proprietary scoring logic can change its internal algorithm at any time without touching
  Food Lens, as long as it keeps writing rows in this shape.
- If the real engine eventually wants a richer target (e.g. a numeric range instead of three
  ordinal levels, or a fourth dimension like fiber emphasis), that's a contract change both sides
  need to coordinate on — but it's a small, explicit seam, not a scattered dependency.
- Until that engine exists, Food Lens can ship with a **placeholder**: a simple settings-style
  form where a member (or, during internal testing, a coach) manually sets their three emphasis
  levels into this same table. This unblocks Food Lens development and testing without waiting on
  the questionnaire — see doc 6 phase 1.

## 5.3 Why three ordinal levels, not percentages

The member-facing requirement is explicit: never present macro estimates as exact facts. That
constraint should shape the *target* representation too, not just the meal estimate — if the
Primal Pattern target were "35% protein / 40% carb / 25% fat" and the meal estimate were
qualitative levels, the comparison would be forced to either fabricate false precision on the meal
side or throw away real precision on the target side. Keeping both sides of the comparison in the
same `low/moderate/high` vocabulary means:

- The comparison logic (§5.4) is a simple, auditable lookup table, not an approximation of a
  numeric distance.
- The member-facing language stays consistent — "your pattern favors higher protein" reads the
  same whether it's describing the target or the meal.
- If the proprietary engine internally computes real percentage ranges (entirely possible — it may
  have much richer internal logic), it should **bucket its own output** into these three levels
  before writing to `primal_pattern_profiles`, the same way Food Lens's vision provider buckets a
  meal's macro composition rather than claiming exact grams. The bucketing thresholds are that
  engine's decision, not Food Lens's.

## 5.4 The comparison engine

Deterministic, no AI call — proposed as `lib/food-lens/comparison.ts`, directly modeled on
`lib/body-assessment/comparison.ts`'s "compare estimate against a baseline/target → structured
signal → confidence-aware narrative" shape.

```ts
type SignalDirection = 'match' | 'heavy' | 'light';

interface ComparisonSignal {
  dimension: 'protein' | 'carb' | 'fat';
  mealLevel: MacroLevel;
  targetLevel: MacroLevel;
  direction: SignalDirection;   // 'heavy' = meal level ranks above target, 'light' = below
}

function compareMealToPattern(
  meal: MacroEstimate,
  target: PrimalPatternProfile,
): { signals: ComparisonSignal[]; narrative: string; confidence: number }
```

- `direction` per dimension is a simple three-way comparison on the `low < moderate < high`
  ordering — no numeric distance needed.
- `narrative` is selected from a **reviewed message template library** keyed by the *pattern* of
  signals (e.g. all three `match` → "This looks well balanced for your pattern"; `carb: heavy` +
  others `match` → "This meal appears carbohydrate-heavy for your pattern. Consider reducing
  refined carbohydrates or balancing with more protein and fat.") — not generated per-call. This
  is what makes the five example coaching lines in the product brief ("Good match...", "Consider
  increasing lean protein...") realistic to ship consistently: they're a maintained copy library,
  not LLM output. MEF's content/coaching team should own and review this template library the same
  way they'd review any other in-app copy.
- `confidence` is `min()` across every confidence value that fed the calculation — the meal's
  per-dimension confidences and (if the proprietary engine ever reports one) the target's own
  confidence. A single low-confidence input caps the whole comparison's confidence; the UI should
  never show a confident-sounding verdict built on a shaky detection.

## 5.5 What happens before a member has a Primal Pattern profile

Per doc 4 §4.4: Food Lens still works without one. Detected items and the macro-level estimate are
useful on their own ("this meal appears carbohydrate-heavy," full stop, no personalization). The
results screen prompts the member to complete the questionnaire for the personalized comparison,
and `food_lens_pattern_comparisons` simply isn't written for that scan. No error state, no
degraded UI — just a smaller, still-useful result.
