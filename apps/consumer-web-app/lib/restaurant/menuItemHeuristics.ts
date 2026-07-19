/**
 * Restaurant Intelligence (Food Lens Part 8, "first useful version") —
 * deterministic menu-item heuristics. Same discipline as
 * lib/food-products/rulesEngine/ingredientQuality.ts and fatQuality.ts:
 * plain, reviewable keyword-marker matching against whatever text the
 * member actually gave us (a menu item name, a pasted menu description, or
 * a restaurant's own menu text), no AI improvisation, no fabricated
 * nutrient value ever produced anywhere in this module.
 *
 * This is a genuinely coarser signal than the barcode Nutrition Rules
 * Engine has — a restaurant almost never publishes ingredient lists or
 * nutrient panels the way a packaged product does. That honesty is exactly
 * what `estimate_basis` on `restaurant_meal_entries` communicates to the
 * member; this module never claims more confidence than the input
 * actually supports, and it never assigns a "healthy"/"unhealthy"/"good"/
 * "bad" verdict to a preparation method or ingredient on its own (a fried
 * item is noted as fried, not judged — the coaching layer frames it as
 * "worth being mindful of" plus a practical modification, never a
 * demonization).
 *
 * A second, optional signal: if the member photographed their menu or
 * their actual plate (source 'menu_photo' / 'meal_photo'), Food Lens's own
 * vision pipeline (lib/food-lens) already produced
 * `food_lens_detected_items` rows for that scan. Those labels are folded
 * in here as a clearly-separate "visual estimate" signal — never merged
 * into the text-based findings as if they were the same kind of evidence.
 */

const FRIED_OR_BREADED_MARKERS = [
  'fried',
  'deep-fried',
  'deep fried',
  'battered',
  'breaded',
  'crispy',
  'crunchy',
  'tempura',
  'panko',
];

const LIGHTER_PREPARATION_MARKERS = [
  'grilled',
  'char-grilled',
  'chargrilled',
  'steamed',
  'roasted',
  'baked',
  'poached',
  'broiled',
  'blackened',
  'seared',
  'raw',
  'sauteed',
  'sautéed',
  'stir-fried',
  'stir fried',
];

const CREAMY_OR_RICH_SAUCE_MARKERS = [
  'creamy',
  'cream sauce',
  'alfredo',
  'cheese sauce',
  'queso',
  'buttery',
  'butter sauce',
  'ranch',
  'aioli',
  'mayo',
  'mayonnaise',
  'gravy',
  'hollandaise',
];

const LOADED_OR_LARGE_PORTION_MARKERS = [
  'loaded',
  'smothered',
  'stuffed',
  'supreme',
  'deluxe',
  'large',
  'jumbo',
  'family-size',
  'family size',
  'tower',
  'double',
  'triple',
  'xl',
  'giant',
  'grande',
  'combo',
  'platter',
  'all-you-can-eat',
  'bottomless',
];

const VEGETABLE_MARKERS = [
  'salad',
  'vegetable',
  'veggies',
  'broccoli',
  'spinach',
  'kale',
  'peppers',
  'zucchini',
  'greens',
  'slaw',
  'tomato',
  'cucumber',
  'asparagus',
  'brussels',
  'cauliflower',
  'mushroom',
];

const PROTEIN_SOURCE_MARKERS = [
  'chicken',
  'beef',
  'steak',
  'salmon',
  'fish',
  'shrimp',
  'turkey',
  'tofu',
  'egg',
  'pork',
  'tuna',
  'beans',
  'lentil',
  'bacon',
  'sausage',
];

const REFINED_CARB_MARKERS = [
  'fries',
  'french fries',
  'white bread',
  'bun',
  'white rice',
  'pasta',
  'noodles',
  'biscuit',
  'tortilla chips',
  'chips',
  'toast',
  'breadsticks',
];

const WHOLE_GRAIN_OR_FIBER_MARKERS = [
  'whole wheat',
  'whole grain',
  'brown rice',
  'quinoa',
  'sweet potato',
  'black beans',
  'wild rice',
  'lentil',
  'oats',
];

const SWEETENED_MARKERS = [
  'glazed',
  'candied',
  'honey',
  'caramel',
  'syrup',
  'sugared',
  'frosted',
  'sweet and sour',
  'teriyaki',
];

const CHEESE_MARKERS = ['cheese', 'cheddar', 'mozzarella', 'queso', 'parmesan', 'feta'];

const SALAD_MARKER = 'salad';
const DRESSING_OR_SAUCE_MARKERS = ['dressing', 'sauce', 'gravy', 'aioli', 'glaze', 'vinaigrette'];

function includesAny(haystack: string, markers: string[]): string[] {
  return markers.filter((m) => haystack.includes(m));
}

/**
 * Looks for other lines in a pasted/OCR'd menu that mention a lighter
 * preparation method or a salad/vegetable-forward dish, distinct from the
 * item the member is actually asking about — a deterministic, non-
 * fabricated way to surface "better-fit alternatives from the same menu"
 * (product requirement §8) that never invents a dish name not literally
 * present in the menu text the member gave us.
 */
function findAlternativeCandidatesInMenuText(
  rawMenuText: string | null,
  currentItemNameLower: string
): string[] {
  if (!rawMenuText) return [];
  const lines = rawMenuText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && l.length < 140);

  const candidates: string[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (currentItemNameLower && lower.includes(currentItemNameLower)) continue;
    const isLighter = LIGHTER_PREPARATION_MARKERS.some((m) => lower.includes(m));
    const isSalad = lower.includes(SALAD_MARKER);
    if (isLighter || isSalad) {
      // Keep just the leading dish-name-shaped portion of the line (up to
      // the first price marker, " - " separator, or sentence-ending
      // period) rather than the whole menu line with its description/
      // price — still literally sourced from the member's own pasted
      // text, never invented. The space-hyphen-space split (rather than a
      // bare hyphen) avoids truncating a hyphenated dish name like
      // "Pan-Seared Salmon".
      const cleaned = line
        .split(/\s[-–—]\s|\$/)[0]!
        .trim()
        .replace(/[-–—.\s]+$/, '');
      if (cleaned.length > 2 && !candidates.includes(cleaned)) candidates.push(cleaned);
    }
    if (candidates.length >= 3) break;
  }
  return candidates;
}

export type MenuItemHeuristicsInput = {
  menuItemName: string | null;
  /** A member-pasted menu excerpt, OCR'd menu text, or free-text description of the dish — whatever text is actually available. */
  description: string | null;
  /** The full pasted/OCR'd menu text, if the member provided one — used only to look for alternative items literally present in it, never to invent one. */
  rawMenuText: string | null;
  /** Confirmed/current Food Lens detected-item labels for this entry's scan, if a menu or meal photo was captured — a visual estimate, not menu text. */
  visualEstimateLabels: string[];
};

export type MenuItemHeuristicsResult = {
  /** True when there was any real text (name, description, or raw menu text) to analyze beyond a bare item name. */
  hasDescriptiveText: boolean;
  friedOrBreaded: boolean;
  lighterPreparation: boolean;
  creamyOrRichSauce: boolean;
  loadedOrLargePortionLanguage: boolean;
  saladWithPossibleDressing: boolean;
  vegetablesMentioned: boolean;
  proteinSourcesMentioned: string[];
  refinedCarbMentioned: boolean;
  wholeGrainOrFiberMentioned: boolean;
  sweetenedMentioned: boolean;
  cheeseMentioned: boolean;
  dressingOrSauceMentioned: boolean;
  /** Dish-name-shaped candidates found in the member's own pasted menu text that mention a lighter preparation or a salad — never an invented dish. */
  alternativeCandidatesFromMenuText: string[];
  /** Food Lens's own confirmed/current detected-item labels for this entry's scan, if any — kept separate from the text-based fields above. */
  visualEstimateLabels: string[];
  /** Plain, deterministic, non-judgmental observations — never "healthy"/"unhealthy"/"good"/"bad". Mirrors the rules engine's observations[] convention. */
  observations: string[];
};

export function analyzeMenuItemHeuristics(
  input: MenuItemHeuristicsInput
): MenuItemHeuristicsResult {
  const nameLower = (input.menuItemName ?? '').toLowerCase();
  const descriptionLower = (input.description ?? '').toLowerCase();
  const combined = `${nameLower} ${descriptionLower}`.trim();
  const hasDescriptiveText = descriptionLower.trim().length > 0 || nameLower.trim().length > 0;

  const friedHits = includesAny(combined, FRIED_OR_BREADED_MARKERS);
  const lighterHits = includesAny(combined, LIGHTER_PREPARATION_MARKERS);
  const creamyHits = includesAny(combined, CREAMY_OR_RICH_SAUCE_MARKERS);
  const loadedHits = includesAny(combined, LOADED_OR_LARGE_PORTION_MARKERS);
  const vegetableHits = includesAny(combined, VEGETABLE_MARKERS);
  const proteinHits = Array.from(new Set(includesAny(combined, PROTEIN_SOURCE_MARKERS)));
  const refinedCarbHits = includesAny(combined, REFINED_CARB_MARKERS);
  const wholeGrainHits = includesAny(combined, WHOLE_GRAIN_OR_FIBER_MARKERS);
  const sweetenedHits = includesAny(combined, SWEETENED_MARKERS);
  const cheeseHits = includesAny(combined, CHEESE_MARKERS);
  const dressingHits = includesAny(combined, DRESSING_OR_SAUCE_MARKERS);
  const isSaladDish = combined.includes(SALAD_MARKER);

  const visualEstimateLabels = input.visualEstimateLabels.filter((l) => l.trim().length > 0);

  const alternativeCandidatesFromMenuText = findAlternativeCandidatesInMenuText(
    input.rawMenuText,
    nameLower
  );

  const hasAnyMarkerSignal =
    friedHits.length > 0 ||
    lighterHits.length > 0 ||
    creamyHits.length > 0 ||
    loadedHits.length > 0 ||
    vegetableHits.length > 0 ||
    proteinHits.length > 0 ||
    refinedCarbHits.length > 0 ||
    wholeGrainHits.length > 0 ||
    sweetenedHits.length > 0 ||
    cheeseHits.length > 0 ||
    isSaladDish;

  const observations: string[] = [];
  if (!hasAnyMarkerSignal && visualEstimateLabels.length === 0) {
    observations.push(
      hasDescriptiveText
        ? 'Only a restaurant and item name were provided — no menu description or photo detail is available yet.'
        : 'No menu description or photo detail was available — this is based only on the name provided.'
    );
  } else {
    if (friedHits.length > 0)
      observations.push(
        `The name/description mentions a fried or breaded preparation (${friedHits[0]}).`
      );
    if (lighterHits.length > 0)
      observations.push(
        `The name/description mentions a lighter preparation method (${lighterHits[0]}).`
      );
    if (creamyHits.length > 0)
      observations.push(`Mentions a creamy or rich sauce/topping (${creamyHits[0]}).`);
    if (loadedHits.length > 0)
      observations.push(
        `The name/description uses language suggesting a larger-than-typical portion (${loadedHits[0]}).`
      );
    if (isSaladDish)
      observations.push(
        'This appears to be a salad — many restaurants can serve the dressing on the side on request.'
      );
    if (vegetableHits.length > 0)
      observations.push('Vegetables are mentioned in the name/description.');
    if (proteinHits.length > 0)
      observations.push(`Mentions a protein source (${proteinHits.slice(0, 3).join(', ')}).`);
    if (refinedCarbHits.length > 0)
      observations.push(`Mentions a refined-carbohydrate component (${refinedCarbHits[0]}).`);
    if (wholeGrainHits.length > 0)
      observations.push(`Mentions a whole-grain or fiber-rich component (${wholeGrainHits[0]}).`);
    if (sweetenedHits.length > 0)
      observations.push(`Mentions a sweetened preparation (${sweetenedHits[0]}).`);
    if (cheeseHits.length > 0) observations.push('Mentions cheese.');
  }
  if (visualEstimateLabels.length > 0) {
    observations.push(
      `Your photo's identified items suggest: ${visualEstimateLabels.join(', ')} — a visual estimate from the image, not the restaurant's own nutrition data.`
    );
  }

  return {
    hasDescriptiveText,
    friedOrBreaded: friedHits.length > 0,
    lighterPreparation: lighterHits.length > 0,
    creamyOrRichSauce: creamyHits.length > 0,
    loadedOrLargePortionLanguage: loadedHits.length > 0,
    saladWithPossibleDressing: isSaladDish,
    vegetablesMentioned: vegetableHits.length > 0,
    proteinSourcesMentioned: proteinHits,
    refinedCarbMentioned: refinedCarbHits.length > 0,
    wholeGrainOrFiberMentioned: wholeGrainHits.length > 0,
    sweetenedMentioned: sweetenedHits.length > 0,
    cheeseMentioned: cheeseHits.length > 0,
    dressingOrSauceMentioned: dressingHits.length > 0,
    alternativeCandidatesFromMenuText,
    visualEstimateLabels,
    observations,
  };
}
