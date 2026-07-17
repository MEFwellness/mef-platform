/**
 * Generates the member-facing coaching sentence for one Food Lens scan.
 *
 * Product decision (hybrid approach): food identification, barcode lookup,
 * macro estimation, confidence scoring, safety rules, and every structured
 * output (food_lens_detected_items, food_lens_macro_estimates, and the
 * `signals`/`confidence` on food_lens_pattern_comparisons) stay
 * deterministic and reviewable — see lib/food-lens/comparison.ts. Only the
 * coaching *sentence* is generated dynamically here, from those
 * deterministic facts plus the member's real history, goals, symptoms,
 * assessments, Primal Pattern, and recent trends — reusing exactly the same
 * LLM provider the main Conversation Coach uses
 * (lib/conversation-coach/provider.ts), so this is genuinely Root talking,
 * not a second, disconnected AI voice.
 *
 * Guardrails (non-negotiable, enforced by what this module puts in the
 * prompt, not by hoping the model behaves):
 * - The prompt hands the model ONLY the already-computed signals/items/
 *   target/history below. It is explicitly told never to invent a fact,
 *   a number, or a food not listed, and never to diagnose.
 * - Never mentions calories or gram/weight values, under any circumstance.
 * - Stays inside wellness-coaching scope, same restriction as the main
 *   Conversation Coach prompt.
 * - If the member currently has any active safety restriction (same
 *   signal lib/safety/ already tracks and the Conversation Coach already
 *   checks), this skips the LLM call entirely and returns a soft, generic
 *   line — doc 7.3's "soften or suppress detailed macro-balance feedback
 *   for members currently flagged."
 * - If the provider is unconfigured, fails, or returns an unsafe result on
 *   the synchronous safety re-check, this falls back to a small set of
 *   honest, signal-derived deterministic lines — the member never sees a
 *   blank or broken result, same discipline as
 *   lib/conversation-coach/fallback.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FoodLensComparisonSignal,
  FoodLensDetectedItem,
  PrimalPatternProfile,
} from '@mef/shared-types-contracts';
import { getConversationContextIntelligence } from '@/lib/intelligence-engine/engine';
import { getConversationCoachingContext } from '@/lib/intelligence-core/service';
import { getConversationCoachProvider } from '@/lib/conversation-coach/provider';
import { classifyConcern } from '@/lib/safety/classifier';
import type { ComparisonMacroEstimate } from './comparison';
import { listRecentFoodLensComparisonsForMember } from './data';
import { FOOD_LENS_NARRATIVE_PROMPT_VERSION } from './coachingNarrativePromptVersion';

const SYSTEM_PROMPT = `Your name is Root. You are this member's own MEF Wellness Coach — calm, warm,
experienced, and genuinely familiar with their history, not a generic nutrition-facts label. You are
writing ONE short reaction to a meal they just photographed with MEF Food Lens.

You are given, below, the ONLY facts you may use: the foods detected in this specific photo, a
plate-level protein/carbohydrate/fat emphasis read (as none/low/moderate/high, never a number), how
that compares to this member's own Primal Pattern eating target, and a little real context about
this member (their recent Food Lens history, relevant wellness patterns, and current coaching focus).
"None" means that macro is essentially absent (e.g. a sugary drink's protein or fat) — a real,
distinct reading, not a placeholder; say so plainly rather than softening it into "a little."

Hard rules, no exceptions:
- Never state a calorie count, a gram weight, a percentage, or any numeric nutrition value. Only
  ever speak in the none/low/moderate/high vocabulary you were given.
- Never invent a food item, a detail, or a fact that isn't in the data below. If the data is thin,
  say less, don't fill the gap with a guess.
- Never diagnose a condition or claim a specific medical cause for anything.
- Stay strictly inside wellness/nutrition coaching. This is meal-pattern feedback, not a full-day or
  full-week verdict, even if recent history is mentioned — a single meal is a data point, never a
  score on the member.
- Keep it short and human: 1 to 3 sentences. Warm, plain, specific to what's actually true here.
  Educational and non-judgmental phrasing only ("consider adding more protein next time"), never
  anything that reads as scored or shaming ("you didn't eat enough protein").
- If it genuinely fits, you may reference a real recent pattern (e.g. "your last couple of scans have
  leaned this way too") or a real wellness identity note given below — only if it's actually provided,
  never fabricated, and only when it adds real value rather than padding the message.
- No greeting, no preamble, no label like "Coaching:" — just the message itself, the way Root would
  actually text it.
- Never say you are an AI, a model, or a chatbot.`;

function formatItems(items: Array<{ label: string; category: string; confidence: number }>): string {
  if (items.length === 0) return '(no items confirmed yet)';
  return items
    .map((i) => `- ${i.label} (${i.category}, confidence ${(i.confidence * 100).toFixed(0)}%)`)
    .join('\n');
}

function formatSignals(signals: FoodLensComparisonSignal[]): string {
  return signals
    .map((s) => `- ${s.dimension}: this meal reads ${s.mealLevel}, target is ${s.targetLevel} -> ${s.direction}`)
    .join('\n');
}

function directionWord(direction: 'match' | 'heavy' | 'light'): string {
  if (direction === 'match') return 'a good match for';
  if (direction === 'heavy') return 'heavier than';
  return 'lighter than';
}

/** A small, honest, signal-derived line — used only when the dynamic path is unavailable (provider unconfigured/failed) or the member is currently safety-restricted. Never the primary path; see this file's docblock. */
export function buildDeterministicFallbackNarrative(
  signals: FoodLensComparisonSignal[],
  patternLabel: string | null
): string {
  const patternPhrase = patternLabel ? `your ${patternLabel} pattern` : 'your eating pattern';
  const nonMatch = signals.find((s) => s.direction !== 'match');

  if (!nonMatch) {
    return `This meal looks like a solid match for ${patternPhrase}.`;
  }

  const levelPhrase =
    nonMatch.mealLevel === 'none' ? `shows no ${nonMatch.dimension}` : `reads ${nonMatch.mealLevel} in ${nonMatch.dimension}`;

  return `This meal ${levelPhrase} — ${directionWord(nonMatch.direction)} what ${patternPhrase} calls for right now.`;
}

/** Used only when a member currently has an active safety restriction (doc 7.3) — a generic, gentle line with no detailed macro-balance talk. */
function buildSafetySoftenedNarrative(): string {
  return "Thanks for logging this meal. I'll keep today's feedback light here — check in with your assigned coach if you'd like to talk through your eating in more detail.";
}

export type GenerateFoodLensNarrativeInput = {
  supabase: SupabaseClient;
  memberId: string;
  localDate: string;
  detectedItems: Pick<FoodLensDetectedItem, 'label' | 'category' | 'confidence'>[];
  macroEstimate: ComparisonMacroEstimate;
  target: PrimalPatternProfile;
  signals: FoodLensComparisonSignal[];
};

export type GenerateFoodLensNarrativeResult = {
  narrative: string;
  /** Null whenever the LLM path wasn't used (safety-softened or deterministic fallback) — mirrors conversation_messages.prompt_version's "only set when the LLM actually produced this text" discipline. */
  promptVersion: string | null;
};

export async function generateFoodLensCoachingNarrative(
  input: GenerateFoodLensNarrativeInput
): Promise<GenerateFoodLensNarrativeResult> {
  const { supabase, memberId, localDate } = input;

  const [intelligence, coachingContext, recentScans] = await Promise.all([
    getConversationContextIntelligence(supabase, memberId, localDate),
    getConversationCoachingContext(supabase, memberId),
    listRecentFoodLensComparisonsForMember(supabase, memberId, 5),
  ]);

  // doc 7.3: a member currently flagged by the existing Coaching Safety
  // System gets softened, non-detailed feedback — same signal the main
  // Conversation Coach already treats as restricting personalized topics.
  if (intelligence.restrictedTopics.length > 0) {
    return { narrative: buildSafetySoftenedNarrative(), promptVersion: null };
  }

  const provider = getConversationCoachProvider();
  if (!provider) {
    return {
      narrative: buildDeterministicFallbackNarrative(input.signals, input.target.pattern_label),
      promptVersion: null,
    };
  }

  const recentTrendLines = recentScans
    .filter((r) => r.scan.id) // defensive, always true
    .map((r) => {
      const date = new Date(r.comparison.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const nonMatch = r.comparison.signals.find((s) => s.direction !== 'match');
      return nonMatch
        ? `- ${date}: read ${nonMatch.mealLevel} ${nonMatch.dimension} (${nonMatch.direction} vs. target)`
        : `- ${date}: matched their pattern`;
    });

  const userPrompt = `MEMBER'S PRIMAL PATTERN TARGET: "${input.target.pattern_label}" — protein: ${input.target.protein_emphasis}, carb: ${input.target.carb_emphasis}, fat: ${input.target.fat_emphasis}.

THIS SCAN'S DETECTED ITEMS:
${formatItems(input.detectedItems)}

THIS SCAN'S MACRO ESTIMATE: protein ${input.macroEstimate.protein.level} (confidence ${(input.macroEstimate.protein.confidence * 100).toFixed(0)}%), carb ${input.macroEstimate.carb.level} (confidence ${(input.macroEstimate.carb.confidence * 100).toFixed(0)}%), fat ${input.macroEstimate.fat.level} (confidence ${(input.macroEstimate.fat.confidence * 100).toFixed(0)}%).

COMPARISON SIGNALS (this meal vs. their target):
${formatSignals(input.signals)}

THIS MEMBER'S RECENT FOOD LENS SCANS (most recent first, may be empty if this is their first):
${recentTrendLines.length > 0 ? recentTrendLines.join('\n') : '(no prior scans yet — this is new for them)'}

Relevant confirmed wellness patterns for this member:
${intelligence.confirmedInsights.length > 0 ? intelligence.confirmedInsights.map((i) => `- ${i}`).join('\n') : '(none yet)'}

This member's wellness identity (real, durable patterns noticed about them; weave in only if genuinely relevant):
${coachingContext.identityHighlights.length > 0 ? coachingContext.identityHighlights.map((h) => `- ${h}`).join('\n') : '(not enough history yet)'}

Write Root's one short reaction to this specific scan now.`;

  try {
    const result = await provider.generateCompletion({
      templateKey: 'food_lens_coaching_narrative',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxOutputTokens: 220,
      temperature: 0.6,
    });

    const text = result.content.trim();
    if (!text) {
      console.error(
        `Food Lens: provider "${result.provider}" (model ${result.model}) returned empty content ` +
          `for member ${memberId} — using deterministic fallback narrative.`
      );
      return {
        narrative: buildDeterministicFallbackNarrative(input.signals, input.target.pattern_label),
        promptVersion: null,
      };
    }

    // Defense-in-depth, same free synchronous check
    // lib/conversation-coach/safety.ts's guardConversationReply runs before
    // showing any generated text to a member — no DB-recorded evaluation
    // here since a scan result has no conversation_messages row to attach
    // one to, but an unsafe generation still never reaches the member.
    const quickCheck = classifyConcern({ text });
    if (quickCheck.classificationLevel !== 'standard_coaching') {
      console.error(
        `Food Lens: generated narrative failed the safety re-check for member ${memberId} ` +
          `(${quickCheck.classificationLevel}) — using deterministic fallback narrative.`
      );
      return {
        narrative: buildDeterministicFallbackNarrative(input.signals, input.target.pattern_label),
        promptVersion: null,
      };
    }

    return { narrative: text, promptVersion: FOOD_LENS_NARRATIVE_PROMPT_VERSION };
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : JSON.stringify(err);
    console.error(`Food Lens: narrative provider call threw for member ${memberId} — ${detail}`, err);
    return {
      narrative: buildDeterministicFallbackNarrative(input.signals, input.target.pattern_label),
      promptVersion: null,
    };
  }
}
