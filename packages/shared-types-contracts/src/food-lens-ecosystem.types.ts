/**
 * MEF Food Lens Ecosystem — shared types for the tables added in
 * supabase/migrations/00000000000060_food_lens_ecosystem.sql: saved meals/
 * favorites (Part 4 search & product memory), pantry items (Part 9),
 * restaurant meal entries (Part 8), and weekly nutrition reports (Part 11).
 * Same convention as food-lens.types.ts / food-products.types.ts:
 * hand-authored, row/type contracts only — logic lives in
 * apps/consumer-web-app/lib/.
 */

import type { FoodLensFoodCategory } from './food-lens.types';

// ---------------------------------------------------------------------------
// Saved meals & favorites (Part 4)
// ---------------------------------------------------------------------------

export interface SavedMeal {
  id: string;
  member_id: string;
  name: string;
  source_scan_id: string | null;
  created_at: string;
}

export interface SavedMealItem {
  id: string;
  saved_meal_id: string;
  product_id: string | null;
  label: string;
  category: FoodLensFoodCategory | null;
  servings: number;
  created_at: string;
}

export type FoodFavoriteType = 'product' | 'saved_meal';

export interface MemberFoodFavorite {
  id: string;
  member_id: string;
  favorite_type: FoodFavoriteType;
  product_id: string | null;
  saved_meal_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pantry intelligence (Part 9) — deliberately simple, not warehouse-level
// inventory management (product requirement §9).
// ---------------------------------------------------------------------------

export type PantryItemStatus = 'active' | 'used' | 'removed';

export interface PantryItem {
  id: string;
  member_id: string;
  product_id: string | null;
  name: string;
  quantity_text: string | null;
  category: string | null;
  expiration_date: string | null;
  is_favorite: boolean;
  status: PantryItemStatus;
  added_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Restaurant intelligence (Part 8, first useful version)
// ---------------------------------------------------------------------------

export type RestaurantEntrySource =
  'search' | 'manual_entry' | 'menu_photo' | 'menu_text' | 'meal_photo';

/** How confidently `analysis` on a RestaurantMealEntry can be trusted as a nutrition fact — must always be rendered alongside the analysis (product requirement §8). */
export type RestaurantEstimateBasis =
  'published_nutrition' | 'visual_estimate' | 'ingredient_estimate' | 'member_entered';

export interface RestaurantMealAnalysis {
  supportsYou: string[];
  mindfulOf: string[];
  modifications: string[];
  pairings: string[];
  betterFitAlternatives: string[];
  portionGuidance: string | null;
}

export interface RestaurantMealEntry {
  id: string;
  member_id: string;
  restaurant_name: string;
  menu_item_name: string | null;
  source: RestaurantEntrySource;
  scan_id: string | null;
  raw_menu_text: string | null;
  estimate_basis: RestaurantEstimateBasis;
  analysis: RestaurantMealAnalysis | Record<string, never>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Weekly nutrition reports (Part 11)
// ---------------------------------------------------------------------------

export type WeeklyNutritionReportStatus = 'generated' | 'insufficient_data';

export interface WeeklyNutritionReportBody {
  daysLogged: number;
  mealsLogged: number;
  yourWeekInFood: string;
  whatSupportedYou: string[];
  patternsWorthNoticing: string[];
  winToBuildOn: string | null;
  rootedFocusForNextWeek: string | null;
}

export interface WeeklyNutritionReport {
  id: string;
  member_id: string;
  week_start: string;
  week_end: string;
  status: WeeklyNutritionReportStatus;
  report: WeeklyNutritionReportBody | Record<string, never>;
  created_at: string;
}
