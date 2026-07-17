/**
 * The provider boundary for Nutrition Facts label scanning — same shape as
 * ../types.ts (the meal-photo FoodLensProvider): the extraction action must
 * never import a vision SDK or vendor directly, and an unconfigured stub
 * throws a typed, catchable error rather than ever fabricating a nutrient
 * value. See product requirement §1: "Never guess missing numbers. If a
 * field cannot be read confidently, mark it as unknown and ask the member
 * to confirm it."
 */

import type { FoodLensLabelPhotoRole } from '@mef/shared-types-contracts';

export type FoodLabelOcrCaptureInput = {
  captureId: string;
  labelPhotoRole: FoodLensLabelPhotoRole;
  /** Short-lived signed URL — raw bytes never pass through this request object. */
  signedUrl: string;
};

export type FoodLabelOcrRequest = {
  scanId: string;
  memberId: string;
  captures: FoodLabelOcrCaptureInput[];
};

export type FoodLabelImageQuality = 'clear' | 'blurry' | 'angled' | 'low_light' | 'unreadable';

/** Every field the label-scan OCR pass can extract, paired 1:1 with food_lens_label_scans' numeric columns. */
export type FoodLabelOcrNumericFields = {
  servingsPerContainer: number | null;
  calories: number | null;
  proteinG: number | null;
  totalCarbohydrateG: number | null;
  fiberG: number | null;
  totalSugarG: number | null;
  addedSugarG: number | null;
  totalFatG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  monounsaturatedFatG: number | null;
  polyunsaturatedFatG: number | null;
  cholesterolMg: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
};

export type FoodLabelOcrResult = {
  provider: string;
  model: string;
  /** An honest read of whether the photo(s) were even legible — surfaced to the member as a retake prompt before anything else, per product requirement §1's "image-quality check" step. */
  imageQuality: FoodLabelImageQuality;
  productName: string | null;
  brand: string | null;
  servingSizeText: string | null;
  numeric: FoodLabelOcrNumericFields;
  vitaminsMinerals: Array<{ name: string; amount: number; unit: string }>;
  ingredientsText: string | null;
  allergensText: string | null;
  /** One 0–1 confidence per extracted field, keyed by the exact field name used in food_lens_label_scans (snake_case, e.g. "protein_g", "product_name"). A field genuinely not attempted is simply absent from this map. */
  fieldConfidence: Record<string, number>;
};

export interface FoodLabelOcrProvider {
  readonly name: string;
  extractLabel(request: FoodLabelOcrRequest): Promise<FoodLabelOcrResult>;
}
