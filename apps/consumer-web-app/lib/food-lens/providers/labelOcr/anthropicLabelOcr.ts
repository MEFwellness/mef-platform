/**
 * The real FoodLabelOcrProvider implementation — Claude vision via forced
 * tool-use, same fetch/retry/timeout discipline as
 * ../anthropicVision.ts (the meal-photo provider). Extracts Nutrition
 * Facts / ingredients / allergens fields with a per-field confidence,
 * never inventing a value the model didn't actually read off the label —
 * a missing/unparseable field is left null with confidence 0, never
 * defaulted to a plausible-looking number.
 *
 * Server-only: reads its API key from process.env, must never be imported
 * from a client component.
 */

import type {
  FoodLabelImageQuality,
  FoodLabelOcrCaptureInput,
  FoodLabelOcrNumericFields,
  FoodLabelOcrProvider,
  FoodLabelOcrRequest,
  FoodLabelOcrResult,
} from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

const RECORD_LABEL_EXTRACTION_TOOL = 'record_label_extraction';
const IMAGE_QUALITY_VALUES = ['clear', 'blurry', 'angled', 'low_light', 'unreadable'] as const;

const NUMERIC_FIELDS = [
  'servings_per_container',
  'calories',
  'protein_g',
  'total_carbohydrate_g',
  'fiber_g',
  'total_sugar_g',
  'added_sugar_g',
  'total_fat_g',
  'saturated_fat_g',
  'trans_fat_g',
  'monounsaturated_fat_g',
  'polyunsaturated_fat_g',
  'cholesterol_mg',
  'sodium_mg',
  'potassium_mg',
] as const;

const TEXT_FIELDS = ['product_name', 'brand', 'serving_size_text', 'ingredients_text', 'allergens_text'] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

class NonRetryableApiError extends Error {
  readonly nonRetryable = true;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  nutrition_facts: 'the Nutrition Facts panel',
  ingredients: 'the ingredient list',
  allergens: 'the allergen statement',
  front_label: 'the front of the product package (name/brand)',
};

const SYSTEM_PROMPT = `You read Nutrition Facts labels, ingredient lists, and allergen statements from photos for a
wellness-coaching app. Your ONLY job is careful, honest transcription — never coaching advice, never a
health judgment, never a guess dressed up as a reading.

You will receive one or more photos, each labeled with which part of the package it shows. Extract
every field you can actually read. For each photo, first judge its own legibility (clear / blurry /
angled / low_light / unreadable) — report the WORST quality level across all photos as the overall
image_quality, since a member needs to know if any of what they photographed wasn't actually legible.

Critical rule, no exceptions: if a field is not visible, not present on this label, or you are not
genuinely confident in the digits you're reading, set its value to null and its confidence to 0 (or
close to 0). NEVER fill in a "typical" or "plausible" number for a field you didn't actually read — a
wrong invented number is far worse than an honest null here. Confidence should be high (0.8+) only when
the text/digits were clearly legible; use lower confidence for anything even slightly ambiguous
(small print, partial glare, a digit that could be a 3 or an 8, etc.).

Extract: product name, brand, serving size (as written, e.g. "2/3 cup (55g)"), servings per container,
calories, protein (g), total carbohydrate (g), dietary fiber (g), total sugars (g), added sugars (g),
total fat (g), saturated fat (g), trans fat (g), monounsaturated fat (g) and polyunsaturated fat (g)
when the label breaks them out (many US labels don't — leave null if absent, don't derive it),
cholesterol (mg), sodium (mg), potassium (mg), any other vitamins/minerals listed with their amount and
unit exactly as printed, the full ingredient list as printed (one text block, preserve order), and the
allergen statement as printed (e.g. "Contains: milk, wheat, soy").

You must call the ${RECORD_LABEL_EXTRACTION_TOOL} tool exactly once with your result.`;

function buildUserPromptText(captures: FoodLabelOcrCaptureInput[]): string {
  const roles = captures
    .map((c, i) => `Photo ${i + 1}: ${ROLE_DESCRIPTIONS[c.labelPhotoRole] ?? c.labelPhotoRole}`)
    .join('\n');
  return `Read the attached label photo(s) and extract every field you can. Photo roles:\n${roles}`;
}

function toolSchema() {
  const numericFieldSchema = { type: 'number', nullable: true };
  const numericFieldsProps: Record<string, unknown> = {};
  for (const field of NUMERIC_FIELDS) numericFieldsProps[field] = numericFieldSchema;

  const confidenceProps: Record<string, unknown> = {};
  for (const field of [...NUMERIC_FIELDS, ...TEXT_FIELDS]) {
    confidenceProps[field] = { type: 'number', minimum: 0, maximum: 1 };
  }

  return {
    name: RECORD_LABEL_EXTRACTION_TOOL,
    description: 'Records an honest, confidence-scored transcription of a Nutrition Facts label, ingredient list, and allergen statement.',
    input_schema: {
      type: 'object',
      properties: {
        image_quality: { type: 'string', enum: IMAGE_QUALITY_VALUES },
        product_name: { type: 'string', nullable: true },
        brand: { type: 'string', nullable: true },
        serving_size_text: { type: 'string', nullable: true },
        numeric: {
          type: 'object',
          properties: numericFieldsProps,
        },
        vitamins_minerals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: 'number' },
              unit: { type: 'string' },
            },
            required: ['name', 'amount', 'unit'],
          },
        },
        ingredients_text: { type: 'string', nullable: true },
        allergens_text: { type: 'string', nullable: true },
        field_confidence: {
          type: 'object',
          properties: confidenceProps,
        },
      },
      required: ['image_quality', 'numeric', 'field_confidence'],
    },
  };
}

type ToolResultShape = {
  image_quality?: string;
  product_name?: string | null;
  brand?: string | null;
  serving_size_text?: string | null;
  numeric?: Record<string, number | null | undefined>;
  vitamins_minerals?: Array<{ name: string; amount: number; unit: string }>;
  ingredients_text?: string | null;
  allergens_text?: string | null;
  field_confidence?: Record<string, number | undefined>;
};

function isImageQuality(value: string): value is FoodLabelImageQuality {
  return (IMAGE_QUALITY_VALUES as readonly string[]).includes(value);
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class AnthropicFoodLabelOcrProvider implements FoodLabelOcrProvider {
  readonly name = 'anthropic_label_ocr';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  async extractLabel(request: FoodLabelOcrRequest): Promise<FoodLabelOcrResult> {
    const photoContent = request.captures
      .filter((c) => c.signedUrl)
      .map((c) => ({
        type: 'image' as const,
        source: { type: 'url' as const, url: c.signedUrl },
      }));

    if (photoContent.length === 0) {
      throw new Error('AnthropicFoodLabelOcrProvider: no capture with a usable signed URL was provided.');
    }

    const userContent = [
      { type: 'text' as const, text: buildUserPromptText(request.captures) },
      ...photoContent,
    ];

    const body = {
      model: this.model,
      max_tokens: 1536,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      tools: [toolSchema()],
      tool_choice: { type: 'tool', name: RECORD_LABEL_EXTRACTION_TOOL },
    };

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          const bodyText = await response.text().catch(() => '');
          const message = `Anthropic label OCR API returned ${response.status}: ${bodyText.slice(0, 300)}`;
          if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
            lastError = new Error(message);
            await sleep(RETRY_BASE_DELAY_MS * attempt);
            continue;
          }
          throw new NonRetryableApiError(message);
        }

        const json = (await response.json()) as {
          content?: Array<{ type: string; input?: unknown }>;
          stop_reason?: string;
        };

        const toolUseBlock = (json.content ?? []).find(
          (block): block is { type: string; input: ToolResultShape } =>
            block.type === 'tool_use' && block.input !== undefined
        );

        if (!toolUseBlock) {
          throw new Error(
            `Anthropic label OCR provider returned no ${RECORD_LABEL_EXTRACTION_TOOL} tool call ` +
              `(stop_reason: ${json.stop_reason ?? 'unknown'}) — never fabricating a result.`
          );
        }

        return this.parseToolResult(toolUseBlock.input);
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof NonRetryableApiError) throw err;

        lastError = err;
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (attempt < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        if (isAbort) {
          throw new Error(`Anthropic label OCR provider timed out after ${this.timeoutMs}ms`);
        }
        throw err instanceof Error ? err : new Error('Anthropic label OCR provider failed');
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Anthropic label OCR provider failed');
  }

  private parseToolResult(input: ToolResultShape): FoodLabelOcrResult {
    const imageQuality =
      input.image_quality && isImageQuality(input.image_quality) ? input.image_quality : 'unreadable';
    if (input.image_quality && !isImageQuality(input.image_quality)) {
      console.error(
        `Anthropic label OCR provider returned an invalid image_quality ("${input.image_quality}") — ` +
          'defaulting to "unreadable" rather than assuming the photo was usable.'
      );
    }

    const numeric: FoodLabelOcrNumericFields = {
      servingsPerContainer: toNullableNumber(input.numeric?.servings_per_container),
      calories: toNullableNumber(input.numeric?.calories),
      proteinG: toNullableNumber(input.numeric?.protein_g),
      totalCarbohydrateG: toNullableNumber(input.numeric?.total_carbohydrate_g),
      fiberG: toNullableNumber(input.numeric?.fiber_g),
      totalSugarG: toNullableNumber(input.numeric?.total_sugar_g),
      addedSugarG: toNullableNumber(input.numeric?.added_sugar_g),
      totalFatG: toNullableNumber(input.numeric?.total_fat_g),
      saturatedFatG: toNullableNumber(input.numeric?.saturated_fat_g),
      transFatG: toNullableNumber(input.numeric?.trans_fat_g),
      monounsaturatedFatG: toNullableNumber(input.numeric?.monounsaturated_fat_g),
      polyunsaturatedFatG: toNullableNumber(input.numeric?.polyunsaturated_fat_g),
      cholesterolMg: toNullableNumber(input.numeric?.cholesterol_mg),
      sodiumMg: toNullableNumber(input.numeric?.sodium_mg),
      potassiumMg: toNullableNumber(input.numeric?.potassium_mg),
    };

    const fieldConfidence: Record<string, number> = {};
    for (const field of [...NUMERIC_FIELDS, ...TEXT_FIELDS]) {
      const raw = input.field_confidence?.[field];
      if (raw !== undefined) fieldConfidence[field] = clampConfidence(raw);
    }

    const vitaminsMinerals = Array.isArray(input.vitamins_minerals)
      ? input.vitamins_minerals
          .filter((v) => v && typeof v.name === 'string' && typeof v.amount === 'number')
          .map((v) => ({ name: v.name.trim(), amount: v.amount, unit: typeof v.unit === 'string' ? v.unit : '' }))
      : [];

    return {
      provider: this.name,
      model: this.model,
      imageQuality,
      productName: toNullableString(input.product_name),
      brand: toNullableString(input.brand),
      servingSizeText: toNullableString(input.serving_size_text),
      numeric,
      vitaminsMinerals,
      ingredientsText: toNullableString(input.ingredients_text),
      allergensText: toNullableString(input.allergens_text),
      fieldConfidence,
    };
  }
}

/** Reuses the same ANTHROPIC_API_KEY/ANTHROPIC_MODEL as every other AI feature in this app — no separate env vars invented. */
export function buildAnthropicFoodLabelOcrProviderFromEnv(): AnthropicFoodLabelOcrProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;
  return new AnthropicFoodLabelOcrProvider(apiKey, model);
}
