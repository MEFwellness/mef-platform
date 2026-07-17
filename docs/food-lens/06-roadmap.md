# 6. Implementation Roadmap: MVP → Production

## Phase 1 — MVP (single vision provider, manual pattern target, no barcode/label)

**Goal: validate the core loop — photo in, honest coaching out — before investing in
personalization or additional capture types.**

- `food_lens_scans`, `food_lens_captures`, `food_lens_detected_items`,
  `food_lens_macro_estimates`, `food_lens_pattern_comparisons`, `food_lens_corrections` tables
  (doc 3 §3.3) and the `food-lens-media` storage bucket (doc 3 §3.4).
- `primal_pattern_profiles` table exists, but is populated by a **simple manual-entry form**, not
  a real questionnaire (doc 5 §5.2) — unblocks development without waiting on the proprietary
  scoring logic.
- One vision provider only: Claude, reusing `lib/ai/providers/anthropic.ts`'s conventions (doc 2
  §2.1). No provider registry/fallback complexity yet — just a working `FoodLensProvider`
  implementation and an `UnconfiguredFoodLensProvider` stub for environments without the API key,
  mirroring `UnconfiguredBodyAssessmentProvider`.
- `MealCamera.tsx` with basic on-device brightness/blur/framing checks (no ML model needed yet —
  canvas pixel heuristics are enough to stop obviously-bad captures).
- Full confirm/correct/add-manual UI (`DetectedItemsList.tsx`) — this is not a "phase 2 nice to
  have," it's core to the "never present estimates as exact facts" requirement and to collecting
  the correction data phase 2 depends on.
- Deterministic comparison engine + a first-draft coaching message template library (doc 5 §5.4),
  reviewed by MEF's coaching/content team before launch.
- Feature-gated to premium members (per the product brief's "premium feature" framing) —
  concretely, whatever mechanism the app already uses to gate premium features (not investigated
  as part of this blueprint; flag for whoever implements).
- **No** registry integration, **no** Root/coach visibility, **no** barcode/label. Deliberately
  narrow scope.

**Exit criteria:** a member can photograph a real meal, see honestly-hedged AI-detected items and
a qualitative macro read, correct anything wrong, and get one of the reviewed coaching messages —
without any fabricated precision anywhere in the flow.

## Phase 2 — Personalization & platform integration

- Swap the manual pattern-target form for the real Primal Pattern Diet questionnaire once that
  ships (doc 5's contract seam is exactly where this plug-in happens — no Food Lens code changes
  needed beyond removing the manual-entry UI).
- `lib/registry/adapters/foodLens.ts` — writes `registry_entries` with `domain: 'nutrition'` from
  `food_lens_pattern_comparisons` (doc 3 §3.5). This is the single change that makes Food Lens
  findings visible to the Intelligence Engine, Intelligence Core, and Root with zero changes to
  any of those three systems — see doc 8.
- `lib/conversation-coach/entryContext.ts` gains `buildFoodLensEntryContext(...)` so the floating
  "Ask Root" launcher has scan context on Food Lens result pages (doc 8 §8.2).
- **Per-member correction personalization** (the realistic "learning" tier, doc 1's README note):
  a small derived cache — most recently and most frequently confirmed label↔category mappings per
  member — injected as few-shot examples in that member's future vision prompts. Not model
  training; a context-injection technique that meaningfully improves accuracy on a given member's
  recurring meals (their usual breakfast, their go-to protein) without any ML infra investment.
- `FoodLensHistory.tsx` / scan-trends view — "your last 5 scans have leaned carbohydrate-heavy" —
  the first place aggregate (not per-scan) framing becomes appropriate, still qualitative.
- `components/BottomNav.tsx` gets a Food Lens entry point (see doc 9 for exactly what that change
  looks like — not made by this blueprint).

**Exit criteria:** Food Lens results reflect the member's real questionnaire-derived pattern, Root
can reference recent meal-pattern trends in conversation, and repeat corrections measurably reduce
correction rate for returning members.

## Phase 3 — Barcode, label scanning, and production hardening

- Barcode: on-device `BarcodeDetector`/`@zxing/browser` decode → `lookupBarcodeAction` against Open
  Food Facts (primary) / Nutritionix (fallback) (doc 2 §2.2, doc 4 §4.5).
- Nutrition-label OCR: on-device crop guidance → `analyzeNutritionLabelAction`, starting with the
  same Claude vision provider before evaluating a dedicated OCR API (doc 2 §2.3).
- **Aggregate correction analytics** (the third and final "learning" tier): de-identified,
  aggregated-across-members correction data surfaces systematic misclassification patterns (e.g. a
  specific dish consistently mislabeled), feeding a periodic, versioned prompt revision process —
  same discipline as `CONVERSATION_COACH_PROMPT_VERSION`'s changelog convention. This is a process
  MEF's team runs periodically, not a real-time feedback loop.
- Coaching Brain (`lib/brain/`) integration: once enough registry entries accumulate, a
  "nutrition focus" mode alongside the existing celebration/challenge/risk/priority engines —
  e.g. celebrating a week of good-match meals, or gently surfacing a sustained carb-heavy trend on
  the Today page. Purely additive to `getCoachingFocusDecision`'s existing signal set.
- Cost/scale hardening: per-member daily scan rate limits (vision API calls are the dominant cost
  driver), response caching for repeated identical barcode lookups, monitoring/alerting on
  provider error rates — same operational bar as any other premium AI feature in the app.
- Provider fallback: if warranted by real accuracy/cost data, add a second vision provider (GPT-4o
  or Gemini, doc 2 §2.1's alternatives table) behind the same `FoodLensProvider` abstraction,
  mirroring how `providers/registry.ts` lists multiple candidates for Body Assessment today even
  though only one is actually configured.

**Exit criteria:** packaged foods and nutrition labels work without a vision-model call in the
common case, correction rates continue trending down, and the feature runs within a defined
per-member cost budget.

## Explicitly not planned

- No calorie counting or logging at any phase — out of scope by product requirement, not a future
  phase.
- No coach-review/approval workflow for individual scans (doc 3 §3.2) — if this becomes a real
  need later, it's a new, additive table and workflow, not a retrofit of the tables proposed here.
- No portion-size/weight estimation from photos (doc 2 §2.4).
