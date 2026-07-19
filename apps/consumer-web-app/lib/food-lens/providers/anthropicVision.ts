/**
 * The real FoodLensProvider implementation — Claude vision via forced
 * tool-use, per docs/food-lens/02-ai-vision-models.md §2.1. Talks to the
 * Anthropic Messages API directly over fetch, same retry/timeout
 * discipline as lib/ai/providers/anthropic.ts, extended to send image
 * content blocks (a signed URL each, never raw bytes) and to force a
 * structured tool-call response rather than parsing freeform prose — a
 * malformed response must never silently produce a bogus macro estimate.
 *
 * Server-only: reads its API key from process.env, never accepts one as a
 * constructor default, must never be imported from a client component.
 */

import type {
  FoodLensCaptureInput,
  FoodLensProvider,
  FoodLensAnalysisRequest,
  FoodLensAnalysisResult,
} from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

const RECORD_MEAL_ANALYSIS_TOOL = 'record_meal_analysis';
// 'none' is a real, distinct level from 'low' — a meal reading can be
// genuinely absent (a soda has no meaningful protein or fat), and forcing
// that into 'low' is exactly what produced a misleading result before.
const MACRO_LEVELS = ['none', 'low', 'moderate', 'high'] as const;
const FOOD_CATEGORIES = ['protein', 'carb', 'fat', 'vegetable', 'mixed', 'unknown'] as const;
const NUTRIENT_DENSITY_LEVELS = ['low', 'moderate', 'high'] as const;
const ADDED_SUGAR_LEVELS = ['none', 'some', 'high'] as const;
const PROCESSING_LEVELS = ['whole_or_minimally_processed', 'processed', 'ultra_processed'] as const;
const COOKING_METHODS = [
  'grilled',
  'fried',
  'baked',
  'roasted',
  'steamed',
  'boiled',
  'raw',
  'sauteed',
  'unknown',
] as const;
const PORTION_UNITS = [
  'grams',
  'ounces',
  'cups',
  'tablespoons',
  'teaspoons',
  'pieces',
  'servings',
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

class NonRetryableApiError extends Error {
  readonly nonRetryable = true;
}

const SYSTEM_PROMPT = `You identify foods in a meal photo for a wellness-coaching app. Your ONLY job is
structured, honest observation — never coaching advice, never calorie or gram estimates, never a
diagnosis.

For each distinct food item you can see, report a short plain-language label, which of these
categories it mainly falls into (protein, carb, fat, vegetable, mixed, unknown), and your confidence
(0 to 1) in that identification. Use "mixed" for composite dishes where ingredients aren't visually
separable (casseroles, stir-fries, sauced dishes) rather than guessing a single category with false
confidence. A sugary drink, soda, juice, or sweetened beverage is category "carb" (its composition is
essentially all carbohydrate from sugar) — never "unknown" or "mixed" just because it's a liquid.
Plain water or an unsweetened, calorie-free beverage has no macro-contributing composition at all;
"unknown" is fine for it.

For each item, also report:
- portion_description: a short, practical, non-precise phrase a person would actually say — "about
  half a cup", "a palm-sized serving", "one medium piece", "roughly one cup", "a tablespoon or so".
  NEVER a specific gram or ounce figure here (that would be false precision from a photo alone) —
  save exact units for quantity/unit below, and only fill those when you have a genuinely reasonable
  basis (a known package/container size, a clearly countable item like "2 eggs").
- portion_confidence (0 to 1): your honest confidence in this portion read specifically — this is
  usually lower than your confidence identifying the food itself. Occluded plates, unusual angles, or
  stacked/layered food should get a low portion_confidence rather than a guessed-but-confident one.
- quantity + unit: OPTIONAL structured amount (grams/ounces/cups/tablespoons/teaspoons/pieces/
  servings) — only when you can identify a specific countable amount (e.g. "2" + "pieces" for two
  visible eggs); leave both null otherwise. Never invent a gram weight for food that isn't in a
  clearly measurable/countable form.
- cooking_method: your best honest read of preparation (grilled/fried/baked/roasted/steamed/boiled/
  raw/sauteed), or "unknown" when it genuinely isn't identifiable from the photo (a sauced or breaded
  dish, insufficient visual cues) — never guess confidently from ambiguous visual cues.
- is_condiment: true for a sauce, dressing, dip, oil drizzle, or topping rather than a standalone
  food — used only for display grouping, never to exclude it from analysis.

Then give a single plate-level estimate of the meal's overall protein, carbohydrate, and fat
EMPHASIS, each with its own confidence. This is a coarse relative judgment, not a nutrition-database
lookup — never a percentage, never a gram value. Each dimension is one of:
- "none" — essentially absent. Use this, not "low", when a macro is genuinely negligible: a can of
  regular (non-diet) soda has no meaningful protein or fat; plain water has none of any macro; a
  bowl of plain white rice has essentially no fat.
- "low" — present, but a small share of this item/plate's own composition.
- "moderate" / "high" — a moderate or dominant share of this item/plate's own composition.

Critical calibration point — judge each dimension by the food or drink's OWN nutritional
composition, never by comparing it to the size of a full day's eating or a large mixed meal, and
never by how much of it is visibly left in a cup, can, or bottle. A can or bottle of regular soda,
sweetened tea, or a sports drink is close to 100% carbohydrate by composition — that is HIGH
carbohydrate emphasis, not "low," even though a drink looks small next to a dinner plate, and even if
the container shown is only partly full or nearly empty. The amount of liquid remaining tells you
nothing about the product's composition — a half-empty bottle of regular soda is still a sugar-based
drink through and through. Do not default to "low" out of caution when the honest answer is "high" —
that under-states exactly the foods this app most needs to flag honestly. When you recognize a
specific, well-known packaged product or beverage, use your general knowledge of what that type of
product typically contains (in addition to what's visible) to make this call, rather than treating
every item as an ambiguous home-cooked plate.

Separately, report your honest read of this meal/item's broader nutritional quality profile —
this is a genuinely different judgment from the macro emphasis above, not simply its inverse. A food
can be carbohydrate-"high" and ALSO nutrient-dense at the same time: a sweet potato, whole fruit,
oats, beans, and lentils are all carbohydrate-dominant and nutrient-dense together. Only rate
nutrient density low when the food is genuinely low in protein, fiber, vitamins, and minerals
relative to its energy — added sugar, refined flour/grains, or fried snack foods are the clear
examples — regardless of which macro happens to dominate:
- nutrient_density: how much protein/fiber/vitamin/mineral value this has relative to its energy —
  low/moderate/high. Never inferred from "this is mostly carbs" or "this is mostly fat" alone.
- added_sugar_level: none/some/high — added or refined sugar, not naturally occurring sugars in
  whole fruit or vegetables.
- processing_level: whole_or_minimally_processed / processed / ultra_processed.
- has_meaningful_protein / has_meaningful_fiber / has_healthy_fat: true only when genuinely present
  in a meaningful amount, not a trace.
- is_beverage: true only when the item being judged is primarily a drink (soda, juice, sweetened
  tea/coffee, sports drink, water, etc.), false for solid food — used only to phrase feedback
  accurately (e.g. "sugary soda" vs. "sugary snack"), never to change the rating logic itself.
- confidence (0 to 1) in THESE quality judgments specifically — this can differ from your
  confidence in identifying the item, and from your confidence in the macro-emphasis levels above.

Be conservative with confidence throughout: occluded, stacked, sauced, or ambiguous food should get
a lower confidence, not a guessed-but-confident answer. You must call the
${RECORD_MEAL_ANALYSIS_TOOL} tool exactly once with your result.`;

function buildUserPromptText(
  personalizationContext: Array<{ label: string; category: string }> | undefined
): string {
  const base =
    'Identify the foods in the attached meal photo(s) and estimate the plate-level macro emphasis.';
  if (!personalizationContext || personalizationContext.length === 0) return base;

  const examples = personalizationContext
    .slice(0, 15)
    .map((c) => `- "${c.label}" → ${c.category}`)
    .join('\n');
  return `${base}\n\nThis member has previously confirmed these label→category mappings for their own recurring meals (use as helpful prior context, not as a guarantee this photo contains the same foods):\n${examples}`;
}

function toolSchema() {
  const macroDimension = {
    type: 'object',
    properties: {
      level: { type: 'string', enum: MACRO_LEVELS },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['level', 'confidence'],
  };

  return {
    name: RECORD_MEAL_ANALYSIS_TOOL,
    description:
      'Records structured, honest food identification, macro-emphasis, and quality-signal estimates for one meal photo.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              category: { type: 'string', enum: FOOD_CATEGORIES },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              portion_description: { type: 'string', nullable: true },
              portion_confidence: { type: 'number', minimum: 0, maximum: 1, nullable: true },
              quantity: { type: 'number', nullable: true },
              unit: { type: 'string', enum: PORTION_UNITS, nullable: true },
              cooking_method: { type: 'string', enum: COOKING_METHODS, nullable: true },
              is_condiment: { type: 'boolean' },
            },
            required: [
              'label',
              'category',
              'confidence',
              'portion_description',
              'portion_confidence',
              'is_condiment',
            ],
          },
        },
        macro_estimate: {
          type: 'object',
          properties: {
            protein: macroDimension,
            carb: macroDimension,
            fat: macroDimension,
          },
          required: ['protein', 'carb', 'fat'],
        },
        quality_signals: {
          type: 'object',
          properties: {
            nutrient_density: { type: 'string', enum: NUTRIENT_DENSITY_LEVELS },
            added_sugar_level: { type: 'string', enum: ADDED_SUGAR_LEVELS },
            processing_level: { type: 'string', enum: PROCESSING_LEVELS },
            has_meaningful_protein: { type: 'boolean' },
            has_meaningful_fiber: { type: 'boolean' },
            has_healthy_fat: { type: 'boolean' },
            is_beverage: { type: 'boolean' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: [
            'nutrient_density',
            'added_sugar_level',
            'processing_level',
            'has_meaningful_protein',
            'has_meaningful_fiber',
            'has_healthy_fat',
            'is_beverage',
            'confidence',
          ],
        },
      },
      required: ['items', 'macro_estimate', 'quality_signals'],
    },
  };
}

type ToolResultShape = {
  items: Array<{
    label: string;
    category: string;
    confidence: number;
    portion_description?: string | null;
    portion_confidence?: number | null;
    quantity?: number | null;
    unit?: string | null;
    cooking_method?: string | null;
    is_condiment?: boolean;
  }>;
  macro_estimate: {
    protein: { level: string; confidence: number };
    carb: { level: string; confidence: number };
    fat: { level: string; confidence: number };
  };
  quality_signals?: {
    nutrient_density: string;
    added_sugar_level: string;
    processing_level: string;
    has_meaningful_protein: boolean;
    has_meaningful_fiber: boolean;
    has_healthy_fat: boolean;
    is_beverage?: boolean;
    confidence: number;
  };
};

function isMacroLevel(value: string): value is (typeof MACRO_LEVELS)[number] {
  return (MACRO_LEVELS as readonly string[]).includes(value);
}

function isFoodCategory(value: string): value is (typeof FOOD_CATEGORIES)[number] {
  return (FOOD_CATEGORIES as readonly string[]).includes(value);
}

function isNutrientDensity(value: string): value is (typeof NUTRIENT_DENSITY_LEVELS)[number] {
  return (NUTRIENT_DENSITY_LEVELS as readonly string[]).includes(value);
}

function isAddedSugarLevel(value: string): value is (typeof ADDED_SUGAR_LEVELS)[number] {
  return (ADDED_SUGAR_LEVELS as readonly string[]).includes(value);
}

function isProcessingLevel(value: string): value is (typeof PROCESSING_LEVELS)[number] {
  return (PROCESSING_LEVELS as readonly string[]).includes(value);
}

function isCookingMethod(value: string): value is (typeof COOKING_METHODS)[number] {
  return (COOKING_METHODS as readonly string[]).includes(value);
}

function isPortionUnit(value: string): value is (typeof PORTION_UNITS)[number] {
  return (PORTION_UNITS as readonly string[]).includes(value);
}

function clampConfidence(value: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export class AnthropicFoodLensProvider implements FoodLensProvider {
  readonly name = 'anthropic_vision';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  async analyzeMeal(request: FoodLensAnalysisRequest): Promise<FoodLensAnalysisResult> {
    const photoContent = request.captures
      .filter((c) => c.signedUrl)
      .map((c: FoodLensCaptureInput) => ({
        type: 'image' as const,
        source: { type: 'url' as const, url: c.signedUrl },
      }));

    if (photoContent.length === 0) {
      throw new Error(
        'AnthropicFoodLensProvider: no capture with a usable signed URL was provided.'
      );
    }

    const userContent = [
      { type: 'text' as const, text: buildUserPromptText(request.personalizationContext) },
      ...photoContent,
    ];

    const body = {
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
      tools: [toolSchema()],
      tool_choice: { type: 'tool', name: RECORD_MEAL_ANALYSIS_TOOL },
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
          const message = `Anthropic vision API returned ${response.status}: ${bodyText.slice(0, 300)}`;
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
            `Anthropic vision provider returned no ${RECORD_MEAL_ANALYSIS_TOOL} tool call ` +
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
          throw new Error(`Anthropic vision provider timed out after ${this.timeoutMs}ms`);
        }
        throw err instanceof Error ? err : new Error('Anthropic vision provider failed');
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Anthropic vision provider failed');
  }

  private parseToolResult(input: ToolResultShape): FoodLensAnalysisResult {
    const items = (input.items ?? [])
      .filter((item) => typeof item.label === 'string' && item.label.trim().length > 0)
      .map((item) => ({
        label: item.label.trim(),
        category: isFoodCategory(item.category) ? item.category : ('unknown' as const),
        confidence: clampConfidence(item.confidence),
        portionDescription:
          typeof item.portion_description === 'string' && item.portion_description.trim().length > 0
            ? item.portion_description.trim()
            : null,
        portionConfidence:
          typeof item.portion_confidence === 'number'
            ? clampConfidence(item.portion_confidence)
            : null,
        quantity:
          typeof item.quantity === 'number' && Number.isFinite(item.quantity)
            ? item.quantity
            : null,
        unit: typeof item.unit === 'string' && isPortionUnit(item.unit) ? item.unit : null,
        cookingMethod:
          typeof item.cooking_method === 'string' && isCookingMethod(item.cooking_method)
            ? item.cooking_method
            : null,
        isCondiment: item.is_condiment === true,
      }));

    const dimension = (
      d: { level: string; confidence: number } | undefined,
      dimensionName: 'protein' | 'carb' | 'fat'
    ) => {
      const valid = d && isMacroLevel(d.level);
      if (d && !valid) {
        // The model returned a macro_estimate level outside none/low/
        // moderate/high (schema violation, or an off-schema tool-use
        // response) — this must never silently masquerade as a confident
        // "low" reading. Logged so a recurring pattern here is visible,
        // rather than quietly under-reporting a dimension the same way
        // the original "always low" bug did.
        console.error(
          `Anthropic vision provider returned an invalid macro_estimate.${dimensionName}.level ` +
            `("${d.level}") — defaulting to 'low' with confidence 0, never fabricating certainty.`
        );
      }
      // A malformed/missing dimension defaults to 'low' paired with
      // confidence 0 — not 'none', since asserting absence is itself a
      // claim we have no basis for here; the 0 confidence is what tells
      // the UI/member this reading isn't trustworthy, not the level word.
      return {
        level: valid ? (d!.level as (typeof MACRO_LEVELS)[number]) : ('low' as const),
        confidence: d ? clampConfidence(d.confidence) : 0,
      };
    };

    const qs = input.quality_signals;
    if (!qs) {
      console.error(
        'Anthropic vision provider returned no quality_signals — defaulting to the most ' +
          'conservative reading (confidence 0) rather than fabricating a quality judgment.'
      );
    }
    const qualitySignals = {
      nutrientDensity:
        qs && isNutrientDensity(qs.nutrient_density) ? qs.nutrient_density : ('low' as const),
      addedSugarLevel:
        qs && isAddedSugarLevel(qs.added_sugar_level) ? qs.added_sugar_level : ('none' as const),
      processingLevel:
        qs && isProcessingLevel(qs.processing_level) ? qs.processing_level : ('processed' as const),
      hasMeaningfulProtein: qs?.has_meaningful_protein === true,
      hasMeaningfulFiber: qs?.has_meaningful_fiber === true,
      hasHealthyFat: qs?.has_healthy_fat === true,
      isBeverage: qs?.is_beverage === true,
      confidence: qs ? clampConfidence(qs.confidence) : 0,
    };

    return {
      provider: this.name,
      model: this.model,
      items,
      macroEstimate: {
        protein: dimension(input.macro_estimate?.protein, 'protein'),
        carb: dimension(input.macro_estimate?.carb, 'carb'),
        fat: dimension(input.macro_estimate?.fat, 'fat'),
      },
      qualitySignals,
    };
  }
}

/**
 * Builds a real provider from environment configuration, or returns null if
 * unconfigured — reuses the same ANTHROPIC_API_KEY/ANTHROPIC_MODEL as the
 * Conversation Coach (lib/ai/providers/anthropic.ts), since this is the
 * same account/model, just a vision-capable request shape. No separate
 * env vars invented for this — one fewer thing to misconfigure.
 */
export function buildAnthropicFoodLensProviderFromEnv(): AnthropicFoodLensProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL;
  if (!apiKey || !model) return null;
  return new AnthropicFoodLensProvider(apiKey, model);
}
