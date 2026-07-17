/**
 * Generates Root's member-facing coaching explanation for one restaurant
 * meal entry, from lib/restaurant/menuItemHeuristics.ts's already-computed,
 * deterministic findings — never from a fabricated nutrient value, and
 * never re-deriving or overriding those findings. Reuses the exact same
 * LLM provider the Conversation Coach, Food Lens, and the barcode
 * coaching narrative all use (lib/conversation-coach/provider.ts) — this
 * is genuinely Root talking, not a second AI voice.
 *
 * Mirrors lib/food-products/coachingNarrative.ts's guardrails line for
 * line, adapted for restaurant food specifically (product requirement
 * §8):
 * - The prompt hands the model ONLY the heuristics' structured findings,
 *   the restaurant/item names the member gave us, and real member
 *   context. It is explicitly told never to invent a nutrient, calorie,
 *   or gram value that wasn't actually provided — restaurants rarely
 *   publish that data, and this feature never pretends otherwise.
 * - The prompt always states what `estimate_basis` means for this
 *   specific entry (visual estimate from a photo vs. an ingredient/
 *   description-based estimate vs. information the member typed in
 *   themselves) so the member never mistakes this for the restaurant's
 *   own published nutrition facts.
 * - Forbidden words/phrases are listed explicitly in the prompt and
 *   re-checked against the generated text (the same style as
 *   lib/food-products/coachingNarrative.ts's FORBIDDEN_PHRASES — copied
 *   here rather than diverging).
 * - If the member currently has an active safety restriction, this skips
 *   the LLM call entirely and returns a soft, generic result.
 * - If the provider is unconfigured, fails, returns unparseable output, or
 *   fails the safety re-check, this falls back to a deterministic,
 *   heuristics-derived result — the member never sees a blank or broken
 *   result.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RestaurantEstimateBasis, RestaurantMealAnalysis } from '@mef/shared-types-contracts';
import { getConversationContextIntelligence } from '@/lib/intelligence-engine/engine';
import { getConversationCoachProvider } from '@/lib/conversation-coach/provider';
import { classifyConcern } from '@/lib/safety/classifier';
import type { MenuItemHeuristicsResult } from './menuItemHeuristics';
import { RESTAURANT_COACHING_PROMPT_VERSION } from './coachingNarrativePromptVersion';

// Same list, same wording as lib/food-products/coachingNarrative.ts's
// FORBIDDEN_PHRASES — copied intentionally rather than diverged, per the
// product requirement that Root's voice/guardrails stay one voice across
// Food Lens surfaces.
const FORBIDDEN_PHRASES = [
  'good food',
  'bad food',
  'toxic',
  'clean',
  'dirty',
  'never eat this',
  'this will cause',
  'this prevents disease',
  'this food is inflammatory',
];

const ESTIMATE_BASIS_EXPLANATION: Record<RestaurantEstimateBasis, string> = {
  published_nutrition:
    "the restaurant's own published nutrition information for this item",
  visual_estimate:
    "a visual estimate Root made from your photo — not the restaurant's own nutrition data",
  ingredient_estimate:
    'an estimate based on the menu description/ingredients you provided — not the restaurant\'s own nutrition data',
  member_entered: 'information you entered yourself',
};

const SYSTEM_PROMPT = `Your name is Root. You are this member's own MEF Wellness Coach — calm, warm, intelligent,
and genuinely familiar with their history, not a generic nutrition-facts label. You are explaining ONE
restaurant menu item a member logged with MEF Food Lens's Restaurant Intelligence.

You are given, below, the ONLY facts you may use: a deterministic keyword/description heuristics
analysis of this menu item (preparation method cues, protein/vegetable/refined-carbohydrate/whole-
grain cues, portion-language cues), the restaurant and item name the member gave us, how confident
we can be in this analysis (estimate_basis), and a little real context about this member (dietary
pattern, relevant wellness patterns, current coaching focus).

Hard rules, no exceptions:
- NEVER state or imply a specific calorie count, gram weight, or other exact nutrition value unless
  it is explicitly given to you below as the restaurant's own published nutrition information. Most
  restaurants do not publish this — when it isn't given to you, do not guess a number, ever, not even
  a rough one.
- Always make clear, in your own words somewhere in the response, what kind of information this is:
  ${Object.entries(ESTIMATE_BASIS_EXPLANATION)
    .map(([basis, text]) => `if estimate_basis is "${basis}", this is ${text}`)
    .join('; ')}.
- Never invent an ingredient, preparation method, health benefit, health risk, or medical conclusion
  that isn't in the heuristics findings below. If the heuristics found little or nothing (little
  descriptive text and no photo), say plainly that there wasn't much to go on rather than filling the
  gap with a guess.
- Never diagnose a condition or claim a specific medical cause or outcome.
- The Rooted Reset philosophy: a food is never judged from one preparation method or ingredient
  alone. Do not demonize fried food, fat, cheese, or any single ingredient outright — "fried" is a
  preparation method worth being mindful of, not an automatic negative; note it plainly and offer a
  practical, non-shaming modification (e.g. asking about a grilled version) instead of a verdict.
- Never use these words/phrases, or anything with the same effect, under any circumstance: "good
  food", "bad food", "toxic", "clean", "dirty", "never eat this", "this will cause...", "this prevents
  disease", "this food is inflammatory".
- Practical, concrete modifications only — the kind a member could actually ask their server for:
  dressing on the side, adding vegetables, choosing grilled/roasted/steamed instead of fried, adding a
  protein source, sharing or saving half a large portion, substituting a side, or simply keeping the
  dish as ordered and balancing the rest of the meal around it.
- For "better-fit alternatives from the same menu": ONLY name a specific dish if it is explicitly
  given to you below as a candidate found in the member's own pasted/photographed menu text. Never
  invent a dish name that wasn't given to you. If no candidate is given, say plainly that a specific
  alternative couldn't be identified from the menu information available, and suggest what to look
  for instead (e.g. "a grilled or salad-based option, if this menu has one").
- Educational and non-judgmental phrasing only ("may be worth considering", "could work well
  alongside"), never shaming or absolute language.
- Write in exactly this format, each labeled section a short list of 1-3 items (a single item is
  fine), plus one line for portion guidance. Use a dash "-" to start each list item. Omit no
  section — if genuinely nothing applies, write one honest, calm line saying so rather than skipping
  the label entirely.

SUPPORTS_YOU:
- <item>
MINDFUL_OF:
- <item>
MODIFICATIONS:
- <item>
PAIRINGS:
- <item>
BETTER_FIT_ALTERNATIVES:
- <item>
PORTION_GUIDANCE: <one calm, practical sentence>

- No greeting, no preamble, no extra commentary outside the labeled sections above.
- Never say you are an AI, a model, or a chatbot.`;

function formatHeuristics(h: MenuItemHeuristicsResult): string {
  if (h.observations.length === 0) return '(no notable findings — very little text or photo detail was available)';
  return h.observations.map((o) => `- ${o}`).join('\n');
}

export type GenerateRestaurantCoachingInput = {
  supabase: SupabaseClient;
  memberId: string;
  localDate: string;
  restaurantName: string;
  menuItemName: string | null;
  estimateBasis: RestaurantEstimateBasis;
  heuristics: MenuItemHeuristicsResult;
  dietaryPattern: string | null;
};

/**
 * A small, honest, heuristics-derived result — used only when the dynamic
 * path is unavailable. Never invents anything beyond what the heuristics
 * already found, and always names what estimate_basis means.
 */
export function buildDeterministicFallbackCoaching(
  heuristics: MenuItemHeuristicsResult,
  estimateBasis: RestaurantEstimateBasis
): RestaurantMealAnalysis {
  const basisNote = ESTIMATE_BASIS_EXPLANATION[estimateBasis];

  const supportsYou: string[] = [];
  if (heuristics.proteinSourcesMentioned.length > 0)
    supportsYou.push(
      `This item appears to include a protein source (${heuristics.proteinSourcesMentioned.slice(0, 3).join(', ')}), which can help with satiety.`
    );
  if (heuristics.vegetablesMentioned)
    supportsYou.push('Vegetables appear to be part of this dish.');
  if (heuristics.wholeGrainOrFiberMentioned)
    supportsYou.push('This item appears to include a whole-grain or fiber-rich component.');
  if (heuristics.lighterPreparation)
    supportsYou.push('This appears to use a lighter preparation method (grilled, roasted, steamed, or similar).');
  if (supportsYou.length === 0)
    supportsYou.push(
      `There isn't much menu detail to point to a specific strength yet — this analysis is based on ${basisNote}.`
    );

  const mindfulOf: string[] = [];
  if (heuristics.friedOrBreaded)
    mindfulOf.push('This is prepared fried or breaded — worth being mindful of, especially if you order this often.');
  if (heuristics.creamyOrRichSauce)
    mindfulOf.push('This appears to include a creamy or rich sauce/topping.');
  if (heuristics.loadedOrLargePortionLanguage)
    mindfulOf.push('The name/description suggests a larger-than-typical portion.');
  if (heuristics.refinedCarbMentioned && !heuristics.wholeGrainOrFiberMentioned)
    mindfulOf.push('This appears to pair with a refined-carbohydrate component.');
  if (heuristics.sweetenedMentioned)
    mindfulOf.push('This appears to have a sweetened preparation.');
  if (mindfulOf.length === 0)
    mindfulOf.push('No specific preparation concerns stood out from the available menu information.');
  mindfulOf.push(`Keep in mind this is ${basisNote}, not a lab-verified nutrition fact.`);

  const modifications: string[] = [];
  if (heuristics.friedOrBreaded)
    modifications.push('Ask if a grilled, roasted, or steamed version is available instead of fried.');
  if (heuristics.creamyOrRichSauce || heuristics.dressingOrSauceMentioned)
    modifications.push('Consider asking for the sauce or dressing on the side so you can control how much you use.');
  if (heuristics.loadedOrLargePortionLanguage)
    modifications.push('Consider sharing this item or saving half for later.');
  if (!heuristics.vegetablesMentioned)
    modifications.push('Consider adding a side salad or vegetables to round out the meal.');
  if (heuristics.refinedCarbMentioned && !heuristics.wholeGrainOrFiberMentioned)
    modifications.push('Ask if a vegetable or whole-grain side can be substituted for the standard side.');
  if (modifications.length === 0)
    modifications.push('No specific modification stands out — this item can likely be enjoyed as described.');

  const pairings: string[] = [];
  if (!heuristics.vegetablesMentioned) pairings.push('A side salad or steamed vegetables');
  if (heuristics.proteinSourcesMentioned.length === 0)
    pairings.push("Adding a protein source, like grilled chicken, fish, or beans, if one isn't already included");
  pairings.push('Water or an unsweetened beverage to help balance the rest of the meal');

  const betterFitAlternatives: string[] =
    heuristics.alternativeCandidatesFromMenuText.length > 0
      ? heuristics.alternativeCandidatesFromMenuText.map(
          (c) => `${c} — a lighter-prep or vegetable-forward option on the same menu`
        )
      : [
          "A specific alternative couldn't be identified from the menu information available — if this menu lists a grilled, roasted, or salad-based dish, that could be a lighter-prep option.",
        ];

  const portionGuidance = heuristics.loadedOrLargePortionLanguage
    ? 'The name/description suggests a larger portion than a standard serving — consider sharing it or saving half for later.'
    : 'Let your own hunger and fullness cues guide the portion — restaurant portions can run larger than a standard serving.';

  return { supportsYou, mindfulOf, modifications, pairings, betterFitAlternatives, portionGuidance };
}

function buildSafetySoftenedCoaching(): RestaurantMealAnalysis {
  return {
    supportsYou: ["Thanks for logging this meal — I'll keep today's feedback light here."],
    mindfulOf: ["Check in with your assigned coach if you'd like to talk through this in more detail."],
    modifications: [],
    pairings: [],
    betterFitAlternatives: [],
    portionGuidance: null,
  };
}

function splitListSection(block: string | null): string[] {
  if (!block) return [];
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

function parseCoachingSections(text: string): RestaurantMealAnalysis | null {
  const labels = [
    'SUPPORTS_YOU',
    'MINDFUL_OF',
    'MODIFICATIONS',
    'PAIRINGS',
    'BETTER_FIT_ALTERNATIVES',
    'PORTION_GUIDANCE',
  ];
  const extract = (label: string): string | null => {
    const regex = new RegExp(
      `${label}:\\s*([^\\n]*(?:\\n(?!(?:${labels.join('|')}):)[^\\n]*)*)`,
      'i'
    );
    const match = text.match(regex);
    return match ? match[1]!.trim() : null;
  };

  const supportsYou = splitListSection(extract('SUPPORTS_YOU'));
  const mindfulOf = splitListSection(extract('MINDFUL_OF'));
  const modifications = splitListSection(extract('MODIFICATIONS'));
  const pairings = splitListSection(extract('PAIRINGS'));
  const betterFitAlternatives = splitListSection(extract('BETTER_FIT_ALTERNATIVES'));
  const portionGuidanceRaw = extract('PORTION_GUIDANCE');
  const portionGuidance = portionGuidanceRaw ? portionGuidanceRaw.split(/\r?\n/)[0]!.trim() : null;

  if (
    supportsYou.length === 0 &&
    mindfulOf.length === 0 &&
    modifications.length === 0 &&
    pairings.length === 0 &&
    betterFitAlternatives.length === 0
  ) {
    return null;
  }

  return {
    supportsYou,
    mindfulOf,
    modifications,
    pairings,
    betterFitAlternatives,
    portionGuidance: portionGuidance && portionGuidance.length > 0 ? portionGuidance : null,
  };
}

export function containsForbiddenPhrase(result: RestaurantMealAnalysis): boolean {
  const text = [
    ...result.supportsYou,
    ...result.mindfulOf,
    ...result.modifications,
    ...result.pairings,
    ...result.betterFitAlternatives,
    result.portionGuidance ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return FORBIDDEN_PHRASES.some((phrase) => text.includes(phrase));
}

export type GenerateRestaurantCoachingResult = {
  result: RestaurantMealAnalysis;
  promptVersion: string | null;
};

export async function generateRestaurantCoachingNarrative(
  input: GenerateRestaurantCoachingInput
): Promise<GenerateRestaurantCoachingResult> {
  const { supabase, memberId } = input;

  const intelligence = await getConversationContextIntelligence(supabase, memberId, input.localDate);

  if (intelligence.restrictedTopics.length > 0) {
    return { result: buildSafetySoftenedCoaching(), promptVersion: null };
  }

  const fallback = () => ({
    result: buildDeterministicFallbackCoaching(input.heuristics, input.estimateBasis),
    promptVersion: null,
  });

  const provider = getConversationCoachProvider();
  if (!provider) return fallback();

  const alternativesText =
    input.heuristics.alternativeCandidatesFromMenuText.length > 0
      ? input.heuristics.alternativeCandidatesFromMenuText.map((c) => `- ${c}`).join('\n')
      : '(no candidate alternatives found in the menu text available)';

  const userPrompt = `RESTAURANT: ${input.restaurantName}
MENU ITEM: ${input.menuItemName ?? '(not specified)'}
ESTIMATE BASIS FOR THIS ENTRY: ${input.estimateBasis} — ${ESTIMATE_BASIS_EXPLANATION[input.estimateBasis]}
MEMBER'S DIETARY PATTERN: ${input.dietaryPattern ?? '(not set)'}

DETERMINISTIC MENU-ITEM FINDINGS:
${formatHeuristics(input.heuristics)}

CANDIDATE BETTER-FIT ALTERNATIVES FOUND IN THE MEMBER'S OWN MENU TEXT (only ever name one of these, never invent a different dish):
${alternativesText}

Relevant confirmed wellness patterns for this member:
${intelligence.confirmedInsights.length > 0 ? intelligence.confirmedInsights.map((i) => `- ${i}`).join('\n') : '(none yet)'}

Write Root's explanation of this restaurant meal now, in the exact labeled format described.`;

  try {
    const completion = await provider.generateCompletion({
      templateKey: 'restaurant_meal_coaching_narrative',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxOutputTokens: 520,
      temperature: 0.6,
    });

    const parsed = parseCoachingSections(completion.content);
    if (!parsed) {
      console.error(
        `Restaurant Intelligence: coaching narrative unparseable for member ${memberId} — using deterministic fallback.`
      );
      return fallback();
    }

    if (containsForbiddenPhrase(parsed)) {
      console.error(
        `Restaurant Intelligence: coaching narrative used a forbidden phrase for member ${memberId} — using deterministic fallback.`
      );
      return fallback();
    }

    const combinedText = [
      ...parsed.supportsYou,
      ...parsed.mindfulOf,
      ...parsed.modifications,
      ...parsed.pairings,
      ...parsed.betterFitAlternatives,
      parsed.portionGuidance ?? '',
    ]
      .filter(Boolean)
      .join(' ');
    const safetyCheck = classifyConcern({ text: combinedText });
    if (safetyCheck.classificationLevel !== 'standard_coaching') {
      console.error(
        `Restaurant Intelligence: coaching narrative failed the safety re-check for member ${memberId} (${safetyCheck.classificationLevel}) — using deterministic fallback.`
      );
      return fallback();
    }

    return { result: parsed, promptVersion: RESTAURANT_COACHING_PROMPT_VERSION };
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
    console.error(
      `Restaurant Intelligence: coaching narrative provider call threw for member ${memberId} — ${detail}`,
      err
    );
    return fallback();
  }
}
