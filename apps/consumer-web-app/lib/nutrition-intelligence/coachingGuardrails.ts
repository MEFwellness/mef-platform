/**
 * Shared coaching-language guardrails for any feature that generates
 * member-facing nutrition coaching copy grounded in the Nutrition
 * Intelligence Service (lib/nutrition-intelligence/service.ts) — today:
 * Food Lens's meal-photo narrative (lib/food-lens/coachingNarrative.ts) and
 * its barcode/product narrative (lib/food-products/coachingNarrative.ts).
 * Centralized so the banned-phrase list and the health-safety-override
 * framing can't drift between call sites as more consumers are added.
 *
 * Per the product requirement, this coaching is educational and
 * awareness-building, never a verdict on the member or a clinical
 * directive — these phrases are the ones that most reliably read as a
 * scored judgment ("good"/"bad"/"forbidden"/"approved") rather than a
 * supportive observation.
 */

export const NUTRITION_COACHING_FORBIDDEN_PHRASES = [
  'good food',
  'bad food',
  'cheat meal',
  'clean eating',
  'forbidden',
  'approved',
  'perfect',
  'wrong',
];

export function containsNutritionCoachingForbiddenPhrase(
  text: string,
  extraPhrases: string[] = []
): boolean {
  const haystack = text.toLowerCase();
  return [...NUTRITION_COACHING_FORBIDDEN_PHRASES, ...extraPhrases].some((phrase) =>
    haystack.includes(phrase)
  );
}

/**
 * The member-facing line used whenever a member has an active
 * health-safety override (migration 65 — diabetes, prediabetes,
 * gestational diabetes, reactive hypoglycemia, insulin use, pregnancy, or
 * an existing clinician nutrition plan). Deliberately generic and free of
 * any macro-nutrient direction: a member's clinical situation takes
 * priority over generic pattern-matching coaching, so no
 * carbohydrate/protein/fat increase-or-decrease suggestion is ever
 * generated while this is true. Used to short-circuit narrative
 * generation entirely, mirroring how each narrative module already
 * short-circuits on the general Coaching Safety System's
 * `restrictedTopics` signal.
 */
export function buildHealthSafetyPriorityMessage(): string {
  return "Your health profile takes priority here, so I'm keeping today's feedback general rather than commenting on specific nutrients like carbohydrates. Your care team is the right place for guidance tailored to your health needs.";
}

/**
 * Shared prompt fragment describing how a coaching narrative should use
 * the Nutrition Intelligence Service's profile data. Kept as one exported
 * string (not duplicated inline in each system prompt) so a future
 * wording change stays a one-file edit.
 *
 * Extension seam for future data sources: as additional per-member signal
 * sources come online (daily check-ins, sleep, stress, movement, blood
 * work, wearables, symptoms, hydration, recovery), each would get its own
 * accessor on a richer coaching-context object
 * (see getMemberNutritionCoachingContext in service.ts) and its own
 * short "what this data means and how to use it" fragment here, added
 * alongside this one — never replacing it. None of those sources are
 * implemented yet; this comment exists so the seam is obvious when they
 * are.
 */
export const NUTRITION_COACHING_HARD_RULES = `- Never use these words or anything with the same effect, under any circumstance: "good food", "bad
  food", "cheat meal", "clean eating", "forbidden", "approved", "perfect", "wrong". Speak in supportive,
  awareness-building language instead — the goal is to encourage the member's own awareness, not
  obedience to a rule.
- Never issue a bare directive to eat more or fewer carbohydrates, or to increase or decrease protein or
  fat, in the abstract. Any protein/carb/fat observation must stay grounded in this specific scan's own
  comparison signal — e.g. "you may notice better fullness by pairing this with more protein" is fine
  because it is tied to this meal's actual reading; a generic "you should eat fewer carbs" is not.
- If detection confidence for this scan is low, say so plainly rather than speaking confidently about a
  shaky read. Never claim to know exact portions — this is a photo/label estimate, not a lab measurement;
  hidden ingredients, cooking oils, and sauces can all go undetected, and it's fine to name that when it's
  relevant to what you're saying.
- Clearly keep separate: what was actually detected in this scan, what the member reported about
  themselves (e.g. their Primal Pattern Assessment result), and what is your own educational suggestion.
  Never state a diagnosis or claim a specific medical cause — this is education, not a clinical
  determination, and anything beyond that belongs with the member's care team.`;
