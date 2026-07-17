# 2. AI Vision Models & APIs

## 2.1 Meal-photo identification + macro-level estimation — recommendation: Claude vision, reusing existing infra

**Use the same Anthropic integration this codebase already runs in production**
(`lib/ai/providers/anthropic.ts` — direct `fetch` against the Messages API, `ANTHROPIC_API_KEY`/
`ANTHROPIC_MODEL` from env, retry-with-backoff, 15s timeout), extended to send an image content
block alongside the prompt. Reasons this beats bringing in a second AI vendor:

- **Zero new infrastructure.** No new API key management, no new retry/timeout/error-handling
  code path to build and maintain — the existing `AnthropicProvider` shape (or a close sibling of
  it) already does 90% of what's needed.
- **Structured output via forced tool-use.** Claude's tool-use can be forced (`tool_choice`) so
  the model *must* return a JSON object matching a schema — e.g.
  `{ items: [{ label, category, confidence }], macro_estimate: { protein: {level, confidence},
  carb: {...}, fat: {...} } }` — instead of parsing freeform prose. This is materially more
  reliable than prompting for "please respond in JSON" and matters a lot here because a malformed
  response should never silently produce a bogus macro estimate.
- **Multi-image support** in a single request, needed later for barcode/label photos that include
  a reference shot, and useful now for "front + angled" meal photos if capture UX ever wants two
  angles for better identification confidence.
- **Consistent with the "never fabricate" convention.** Exactly like
  `UnconfiguredBodyAssessmentProvider`, a `FoodLensProvider` implementation should throw a typed,
  catchable error (or return a `not_configured` status) rather than ever inventing food items or
  macro levels when the provider isn't set up — see doc 3's `food_lens_scans.status` enum.

**Model choice within the Claude family:** use whatever the account's current
`ANTHROPIC_MODEL` env var points at for vision-capable tasks (per the existing provider, no model
is hardcoded — this should stay true for Food Lens too). At time of writing, Claude Sonnet 5 is
the right cost/accuracy tradeoff for food recognition: strong at compositional scene
understanding (multiple foods on one plate, partially occluded items, mixed dishes) and reliable
structured JSON via tool-use. Don't reach for a larger/more expensive tier unless eval data shows
Sonnet-tier accuracy is insufficient for composite dishes.

### Alternatives considered

| Option | Verdict |
|---|---|
| **GPT-4o / GPT-4.1 vision (OpenAI)** | Comparable food-recognition quality. Rejected for MVP only because it means standing up a second provider's auth/retry/error-handling path for no accuracy gain over what's already integrated. Worth keeping in the `providers/registry.ts`-style stub list (see doc 3) as a documented fallback/comparison option, exactly how `openai_vision` already sits alongside `anthropic_vision` in the Body Assessment provider registry. |
| **Google Gemini (2.x) vision** | Same reasoning as GPT-4o — solid option, not worth a second integration for MVP. Already present as `google_gemini` in the Body Assessment provider registry naming convention; reuse that naming if/when evaluated. |
| **Specialized food-recognition APIs** (LogMeal, Foodvisor, Clarifai's food model) | These are trained specifically for food and can be more accurate on packaged/branded/restaurant-chain foods, and some return actual nutrition-database lookups. Worth a real bake-off before committing engineering time, **but** they push MEF toward exactly the calorie/gram-precision framing this feature is explicitly avoiding, and adds a third vendor relationship. Not recommended for MVP; revisit only if Claude/GPT-4o composite-dish accuracy proves insufficient in practice. |
| **Self-hosted/open model** (e.g., a fine-tuned food-classification CNN) | Overkill for MVP volume; meaningful infra investment (hosting, GPU cost, retraining pipeline) for a premium feature that hasn't validated demand yet. Revisit only at production scale if per-call vendor API cost becomes the dominant cost driver — see doc 6 phase 3. |

## 2.2 Barcode scanning (future phase) — recommendation: on-device decode + free/open product database

- **Decoding**: native `BarcodeDetector` Web API where available (Chrome/Android), falling back to
  `@zxing/browser` (pure JS, works everywhere `getUserMedia` does). Fully on-device, no AI cost,
  real-time — same reasoning as live capture-quality checks in doc 1.
- **Product lookup**: decoded UPC/EAN goes to the backend, which queries **Open Food Facts**
  (free, open, community-maintained, huge packaged-food coverage — good fit for an
  education-not-tracking feature) as the primary source, with **Nutritionix** as a paid fallback
  for better US-brand coverage if Open Food Facts misses. No AI call needed for this path at all —
  it's a straight product database lookup, which is also why it's cheap to build once meal-photo
  Food Lens is live.
- Returned product macros (when the database has them) still get passed through the same
  deterministic comparison engine as meal photos — same output contract, same confidence
  discipline, just a different (much higher-confidence) input source. See doc 5's target contract
  and `interfaces/types.ts`'s `MacroEstimate` type, which is intentionally source-agnostic.

## 2.3 Nutrition-label scanning (future phase) — recommendation: on-device crop guidance + backend OCR

- On-device: same framing/quality guidance pattern as meal photos, just aimed at "get the whole
  label in frame, reduce glare."
- Backend OCR: two viable options, evaluate against real label photos before choosing —
  (a) Claude vision again, given a tightly cropped label image, forced tool-use for a structured
  `{ servingSize, protein, totalCarbohydrate, totalFat, ... }` result — reuses the exact same
  provider abstraction as meal photos, no new vendor; or
  (b) a dedicated OCR API (Google Cloud Vision `DOCUMENT_TEXT_DETECTION`, AWS Textract) if label
  text extraction accuracy turns out to need a purpose-built OCR engine rather than a general
  vision-language model. Start with (a) for architectural simplicity; only add (b) if eval data
  shows it's meaningfully more accurate on real (non-flat, glare-heavy, curved) label photos.
- Because a nutrition label states real values, this is the one capture type where the app *can*
  show the label's own printed numbers verbatim (that's the label doing the claiming, not MEF's
  AI) — but the comparison-against-Primal-Pattern output should still be expressed as levels, not
  as a recomputed macro percentage, to stay consistent with the rest of the feature and requirement
  "never present macro estimates as exact facts" (the *meal-level* estimate stays qualitative even
  when one *ingredient's* label is exact).

## 2.4 What NOT to build

- No calorie estimation, ever — out of scope by explicit product requirement, not just an MVP cut.
- No attempt to estimate portion size/weight from a 2D photo for MVP. Portion/depth estimation
  from a single monocular image is a hard, low-accuracy problem (needs a reference object or
  depth sensor for reasonable accuracy) and isn't needed for a *relative balance* judgment anyway
  — "is this plate carb-heavy" doesn't require knowing it's exactly 340g of rice.
