/**
 * Generates Root's member-facing coaching explanation for one packaged-food
 * barcode scan, from the MEF Nutrition Rules Engine's already-computed,
 * deterministic findings (lib/food-products/rulesEngine) — never from raw
 * nutrient numbers directly, and never re-deriving or overriding the rules
 * engine's own judgment. Reuses the exact same LLM provider the
 * Conversation Coach and Food Lens meal-photo narrative use
 * (lib/conversation-coach/provider.ts) — this is genuinely Root talking,
 * not a second AI voice, per product requirement §12/§13.
 *
 * Guardrails (non-negotiable, enforced by what this module puts in the
 * prompt, not by hoping the model behaves):
 * - The prompt hands the model ONLY the rules engine's structured findings
 *   plus the product's own normalized facts and real member context below.
 *   It is explicitly told never to invent a nutrient, ingredient, allergen,
 *   health benefit/risk, processing detail, or medical conclusion.
 * - Forbidden words/phrases (product requirement §13) are listed explicitly
 *   in the prompt and re-checked structurally isn't possible for free-text
 *   generation, so this relies on instruction plus the same synchronous
 *   safety re-check (lib/safety/classifier.ts) Food Lens's narrative uses.
 * - If the member currently has an active safety restriction, this skips
 *   the LLM call entirely and returns a soft, generic result (mirrors
 *   lib/food-lens/coachingNarrative.ts's buildSafetySoftenedNarrative).
 * - If the provider is unconfigured, fails, returns unparseable output, or
 *   fails the safety re-check, this falls back to a deterministic,
 *   signal-derived result built directly from rules_result — the member
 *   never sees a blank or broken result.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AllergenMatch,
  FoodCoachingResult,
  FoodRulesEngineResult,
} from '@mef/shared-types-contracts';
import { getConversationContextIntelligence } from '@/lib/intelligence-engine/engine';
import { getConversationCoachingContext } from '@/lib/intelligence-core/service';
import { getConversationCoachProvider } from '@/lib/conversation-coach/provider';
import { classifyConcern } from '@/lib/safety/classifier';
import { FOOD_PRODUCT_COACHING_PROMPT_VERSION } from './coachingNarrativePromptVersion';

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

const SYSTEM_PROMPT = `Your name is Root. You are this member's own MEF Wellness Coach — calm, warm, intelligent,
and genuinely familiar with their history, not a generic nutrition-facts label. You are explaining ONE
packaged food a member just scanned with MEF Food Lens's barcode scanner.

You are given, below, the ONLY facts you may use: the MEF Nutrition Rules Engine's already-computed,
deterministic findings for this product (ingredient quality, fat quality and source, carbohydrate
quality, protein quality, processing context, and nutrient-combination findings), the product's own
basic facts (name, brand, serving size, and normalized nutrients), whether any of the member's own
stated allergies matched a declared allergen, and a little real context about this member (relevant
wellness patterns, current coaching focus, dietary pattern, and recent Food Lens history).

Hard rules, no exceptions:
- Never invent a nutrient value, ingredient, allergen, health benefit, health risk, processing detail,
  or medical conclusion that isn't in the data below. If the rules engine's data_completeness is
  "partial" or "minimal", say so plainly rather than filling the gap with a guess.
- Never diagnose a condition, interpret a lab value, or claim a specific medical cause or outcome.
- The Rooted Reset philosophy: a food is never judged from one nutrient alone. Do not demonize fat,
  saturated fat, or seed oils on their own — the rules engine already evaluated fat source and
  nutrient combinations; explain what it found, don't add your own verdict about fat in general. Do
  not claim saturated fat or seed oils are harmless either — stay inside exactly what the rules engine
  reported.
- Never use these words/phrases, or anything with the same effect, under any circumstance: "good
  food", "bad food", "toxic", "clean", "dirty", "never eat this", "this will cause...", "this prevents
  disease", "this food is inflammatory" — unless the rules engine's own findings specifically and
  narrowly support a safety-grade statement (e.g. a confirmed trans-fat/partially-hydrogenated-oil
  finding, or a member allergen match), and even then stay factual and calm, never alarmist.
- If a member allergen match is present in the data below, acknowledge it clearly and directly in
  "Things to Be Mindful Of" — this is a safety-relevant fact, not something to soften.
- Write in exactly these four sections, each 1-3 sentences, using this EXACT format with each label on
  its own line followed by a colon (omit MISSING_INFO entirely if data_completeness is "complete"):

SUPPORTS_YOU: <what this product genuinely offers this member, grounded in the rules engine's findings>
MINDFUL_OF: <what's worth considering, per the rules engine's combination findings and quality dimensions>
BEST_FIT: <when/how this product fits best for this member, given their real context>
RECOMMENDATION: <one concrete, practical suggestion>
MISSING_INFO: <only if data_completeness is "partial" or "minimal" — what's missing and that the analysis is based only on available data>

- Educational and non-judgmental phrasing only ("may be worth considering", "could affect how
  satisfying this feels"), never shaming or absolute language.
- No greeting, no preamble, no extra commentary outside the five labeled lines above.
- Never say you are an AI, a model, or a chatbot.`;

function formatCombinationFindings(rules: FoodRulesEngineResult): string {
  if (rules.nutrientCombinations.length === 0) return '(no notable nutrient-combination findings)';
  return rules.nutrientCombinations.map((f) => `- [${f.severity}] ${f.narrative}`).join('\n');
}

function formatObservations(label: string, observations: string[]): string {
  if (observations.length === 0) return `${label}: (no observations)`;
  return `${label}:\n${observations.map((o) => `  - ${o}`).join('\n')}`;
}

export type GenerateFoodCoachingInput = {
  supabase: SupabaseClient;
  memberId: string;
  localDate: string;
  productName: string | null;
  brand: string | null;
  servingSizeText: string | null;
  rulesResult: FoodRulesEngineResult;
  allergenMatches: AllergenMatch[];
  dietaryPattern: string | null;
};

/** A small, honest, signal-derived result — used only when the dynamic path is unavailable. Never invents anything beyond what rules_result already contains. */
export function buildDeterministicFallbackCoaching(
  rules: FoodRulesEngineResult,
  allergenMatches: AllergenMatch[]
): FoodCoachingResult {
  const supportsParts: string[] = [];
  if (rules.proteinQuality.isMeaningfulAmount) supportsParts.push('a meaningful amount of protein');
  if (rules.fatQuality.fatSourceCategory === 'whole_food')
    supportsParts.push('fat from whole-food sources');
  if (rules.carbQuality.isWholeGrainIndicated) supportsParts.push('whole grain carbohydrate');
  if ((rules.carbQuality.fiberG ?? 0) >= 3) supportsParts.push('a meaningful amount of fiber');
  const supportsYou =
    supportsParts.length > 0
      ? `This product provides ${supportsParts.join(', ')}.`
      : 'This product was analyzed against your Rooted Reset nutrition profile — see the details below for the full picture.';

  const topCombination = rules.nutrientCombinations.find((f) => f.severity !== 'informational');
  const mindfulOf = topCombination
    ? topCombination.narrative
    : (rules.nutrientCombinations[0]?.narrative ??
      'No single nutrient here stands out as a concern on its own — consider the full picture below.');

  const bestFit =
    rules.processingContext.label === 'highly_processed'
      ? 'This may work better as an occasional convenience choice rather than a primary everyday item.'
      : 'This can fit into a variety of eating patterns — check the details below against your own goals.';

  const recommendation =
    rules.carbQuality.fiberG !== null && rules.carbQuality.fiberG < 3
      ? 'Consider pairing this with a fiber-rich food or vegetables to round out the meal.'
      : 'Keep the portion aligned with the serving size listed on the package.';

  const missingInformation =
    rules.dataCompleteness === 'complete'
      ? null
      : 'Some nutrient or ingredient information was missing for this product. This analysis is based only on the available data.';

  const allergenNote =
    allergenMatches.length > 0
      ? ` This product also declares ${allergenMatches.map((a) => a.allergen).join(', ')}, which matches an allergy on your profile — please check the label yourself before eating.`
      : '';

  return {
    supportsYou,
    mindfulOf: mindfulOf + allergenNote,
    bestFit,
    recommendation,
    missingInformation,
  };
}

function buildSafetySoftenedCoaching(): FoodCoachingResult {
  return {
    supportsYou: "Thanks for scanning this product — I'll keep today's feedback light here.",
    mindfulOf:
      "Check in with your assigned coach if you'd like to talk through this in more detail.",
    bestFit: null,
    recommendation: null,
    missingInformation: null,
  };
}

function parseCoachingSections(text: string): FoodCoachingResult | null {
  const extract = (label: string): string | null => {
    const regex = new RegExp(
      `${label}:\\s*([^\\n]+(?:\\n(?!(?:SUPPORTS_YOU|MINDFUL_OF|BEST_FIT|RECOMMENDATION|MISSING_INFO):)[^\\n]*)*)`,
      'i'
    );
    const match = text.match(regex);
    return match ? match[1]!.trim() : null;
  };

  const supportsYou = extract('SUPPORTS_YOU');
  const mindfulOf = extract('MINDFUL_OF');
  const bestFit = extract('BEST_FIT');
  const recommendation = extract('RECOMMENDATION');
  const missingInformation = extract('MISSING_INFO');

  if (!supportsYou && !mindfulOf && !bestFit && !recommendation) return null;

  return {
    supportsYou: supportsYou || null,
    mindfulOf: mindfulOf || null,
    bestFit: bestFit || null,
    recommendation: recommendation || null,
    missingInformation: missingInformation || null,
  };
}

function containsForbiddenPhrase(result: FoodCoachingResult): boolean {
  const text = [
    result.supportsYou,
    result.mindfulOf,
    result.bestFit,
    result.recommendation,
    result.missingInformation,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return FORBIDDEN_PHRASES.some((phrase) => text.includes(phrase));
}

export type GenerateFoodCoachingResult = {
  result: FoodCoachingResult;
  promptVersion: string | null;
};

export async function generateFoodCoachingNarrative(
  input: GenerateFoodCoachingInput
): Promise<GenerateFoodCoachingResult> {
  const { supabase, memberId } = input;

  const [intelligence, coachingContext] = await Promise.all([
    getConversationContextIntelligence(supabase, memberId, input.localDate),
    getConversationCoachingContext(supabase, memberId),
  ]);

  if (intelligence.restrictedTopics.length > 0) {
    return { result: buildSafetySoftenedCoaching(), promptVersion: null };
  }

  const fallback = () => ({
    result: buildDeterministicFallbackCoaching(input.rulesResult, input.allergenMatches),
    promptVersion: null,
  });

  const provider = getConversationCoachProvider();
  if (!provider) return fallback();

  const userPrompt = `PRODUCT: ${input.productName ?? '(name unavailable)'}${input.brand ? ` by ${input.brand}` : ''}
SERVING SIZE: ${input.servingSizeText ?? '(not reported)'}
DATA COMPLETENESS: ${input.rulesResult.dataCompleteness}
OVERALL CONFIDENCE: ${(input.rulesResult.overallConfidence * 100).toFixed(0)}%

MEMBER ALLERGEN MATCH: ${
    input.allergenMatches.length > 0
      ? input.allergenMatches.map((a) => `${a.allergen} (${a.kind})`).join(', ')
      : 'none'
  }
MEMBER'S DIETARY PATTERN: ${input.dietaryPattern ?? '(not set)'}

${formatObservations('INGREDIENT QUALITY', input.rulesResult.ingredientQuality.observations)}

${formatObservations('FAT QUALITY', input.rulesResult.fatQuality.observations)}

${formatObservations('CARBOHYDRATE QUALITY', input.rulesResult.carbQuality.observations)}

${formatObservations('PROTEIN QUALITY', input.rulesResult.proteinQuality.observations)}

PROCESSING CONTEXT: ${input.rulesResult.processingContext.label} — ${input.rulesResult.processingContext.reason}

NUTRIENT-COMBINATION FINDINGS:
${formatCombinationFindings(input.rulesResult)}

Relevant confirmed wellness patterns for this member:
${intelligence.confirmedInsights.length > 0 ? intelligence.confirmedInsights.map((i) => `- ${i}`).join('\n') : '(none yet)'}

This member's wellness identity (weave in only if genuinely relevant):
${coachingContext.identityHighlights.length > 0 ? coachingContext.identityHighlights.map((h) => `- ${h}`).join('\n') : '(not enough history yet)'}

Write Root's explanation of this scan now, in the exact five-label format described.`;

  try {
    const completion = await provider.generateCompletion({
      templateKey: 'food_product_coaching_narrative',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxOutputTokens: 420,
      temperature: 0.6,
    });

    const parsed = parseCoachingSections(completion.content);
    if (!parsed) {
      console.error(
        `Food Products: coaching narrative unparseable for member ${memberId} — using deterministic fallback.`
      );
      return fallback();
    }

    if (containsForbiddenPhrase(parsed)) {
      console.error(
        `Food Products: coaching narrative used a forbidden phrase for member ${memberId} — using deterministic fallback.`
      );
      return fallback();
    }

    const combinedText = [
      parsed.supportsYou,
      parsed.mindfulOf,
      parsed.bestFit,
      parsed.recommendation,
    ]
      .filter(Boolean)
      .join(' ');
    const safetyCheck = classifyConcern({ text: combinedText });
    if (safetyCheck.classificationLevel !== 'standard_coaching') {
      console.error(
        `Food Products: coaching narrative failed the safety re-check for member ${memberId} (${safetyCheck.classificationLevel}) — using deterministic fallback.`
      );
      return fallback();
    }

    return { result: parsed, promptVersion: FOOD_PRODUCT_COACHING_PROMPT_VERSION };
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
    console.error(
      `Food Products: coaching narrative provider call threw for member ${memberId} — ${detail}`,
      err
    );
    return fallback();
  }
}
