-- Adds is_beverage to food_lens_meal_quality_ratings — purely additive, so
-- existing rows (all written before this column existed) simply get the
-- default rather than breaking. Lets the deterministic Meal Quality engine
-- (lib/food-lens/mealQuality.ts) phrase feedback accurately for a
-- confidently identified drink vs. a confidently identified solid food
-- ("sugary soda" vs. "sugary snack") instead of a single hedged "beverage
-- or snack" sentence, and lets a member correction's recompute reconstruct
-- the same distinction it originally had, since recompute reuses this
-- table's most recently stored quality signals rather than re-running the
-- vision model.

alter table food_lens_meal_quality_ratings
  add column is_beverage boolean not null default false;
