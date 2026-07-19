/**
 * Validation rules for an OCR-extracted Nutrition Facts reading — pure,
 * deterministic, no I/O. Product requirement §1's "validation rules" step:
 * catches internally-inconsistent readings (e.g. sub-fat components adding
 * up to more than total fat) that indicate a misread digit, so the member
 * can double-check that specific field before confirming rather than
 * silently saving a self-contradictory record. Never blocks saving —
 * always advisory, since the member has final say per "member confirmation
 * before saving."
 */

export type LabelValidationInput = {
  totalFatG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  monounsaturatedFatG: number | null;
  polyunsaturatedFatG: number | null;
  totalCarbohydrateG: number | null;
  fiberG: number | null;
  totalSugarG: number | null;
  addedSugarG: number | null;
  calories: number | null;
};

export type LabelValidationWarning = {
  field: string;
  message: string;
};

const TOLERANCE_G = 1.5; // labels round to the nearest gram, so allow a little slack before flagging

function sumOf(...values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

export function validateLabelExtraction(input: LabelValidationInput): LabelValidationWarning[] {
  const warnings: LabelValidationWarning[] = [];

  const fatComponents = sumOf(
    input.saturatedFatG,
    input.transFatG,
    input.monounsaturatedFatG,
    input.polyunsaturatedFatG
  );
  if (
    input.totalFatG !== null &&
    fatComponents !== null &&
    fatComponents > input.totalFatG + TOLERANCE_G
  ) {
    warnings.push({
      field: 'total_fat_g',
      message:
        'Saturated, trans, mono-, and polyunsaturated fat add up to more than the total fat listed — double-check these values.',
    });
  }

  if (
    input.totalSugarG !== null &&
    input.addedSugarG !== null &&
    input.addedSugarG > input.totalSugarG + TOLERANCE_G
  ) {
    warnings.push({
      field: 'added_sugar_g',
      message: 'Added sugar is listed as more than total sugar — double-check these values.',
    });
  }

  if (
    input.totalCarbohydrateG !== null &&
    input.fiberG !== null &&
    input.totalSugarG !== null &&
    input.fiberG + input.totalSugarG > input.totalCarbohydrateG + TOLERANCE_G
  ) {
    warnings.push({
      field: 'total_carbohydrate_g',
      message:
        'Fiber and total sugar add up to more than total carbohydrate — double-check these values.',
    });
  }

  if (
    input.calories !== null &&
    input.calories > 0 &&
    input.totalFatG === null &&
    input.totalCarbohydrateG === null
  ) {
    warnings.push({
      field: 'calories',
      message:
        'Calories were read but fat and carbohydrate were not — this label may need a clearer photo.',
    });
  }

  return warnings;
}
