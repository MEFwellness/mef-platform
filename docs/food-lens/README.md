# MEF Food Lens — Implementation Blueprint

Status: **design proposal, not implemented.** Nothing under `apps/consumer-web-app` has been
changed to produce this blueprint. These documents are the foundation to build from, not a
description of shipped behavior.

## What this is

MEF Food Lens lets a member point their phone camera at a meal and get **coaching**, not calorie
counting: does this meal's rough protein/carb/fat balance line up with the eating pattern MEF's
Primal Pattern Diet questionnaire recommends for them. No exact macros, no calorie totals, no
gram weights — ever. Confidence is always visible, the member can correct what the AI detected,
and corrections make the feature smarter for that member over time.

## Why it's designed this way

This repo already shipped a feature with the same shape: the **Body Intelligence Engine**
(camera capture → AI analysis → structured, confidence-scored findings → member-facing coaching
copy). Rather than invent new patterns, this blueprint reuses its proven conventions —
provider abstraction with a "never fabricate, mark not-configured" fallback, confidence +
severity as first-class columns, append-only correction history, and a Universal Registry
adapter that gets new findings in front of the Intelligence Engine and the Root coach with zero
changes to those systems. Where this blueprint deliberately departs from that precedent (and
there are a few important places it does), the reasoning is called out explicitly rather than
left implicit.

## Documents in this set

| #   | File                                                                   | Covers                                                                                                                                |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [01-architecture.md](./01-architecture.md)                             | System architecture, sequence flow, on-device vs. backend split                                                                       |
| 2   | [02-ai-vision-models.md](./02-ai-vision-models.md)                     | Vision model/API recommendations for meal photos, barcodes, labels                                                                    |
| 3   | [03-database-schema.md](./03-database-schema.md)                       | Proposed tables, RLS, storage bucket (draft migration SQL, not applied)                                                               |
| 4   | [04-api-contracts.md](./04-api-contracts.md)                           | Server action / endpoint contracts, request & response shapes                                                                         |
| 5   | [05-primal-pattern-integration.md](./05-primal-pattern-integration.md) | The target-consumption contract Food Lens needs from the (separate, proprietary) Primal Pattern engine                                |
| 6   | [06-roadmap.md](./06-roadmap.md)                                       | Phased MVP → production plan                                                                                                          |
| 7   | [07-risks-privacy.md](./07-risks-privacy.md)                           | Technical risk, accuracy limitations, privacy/safety considerations                                                                   |
| 8   | [08-coach-integration.md](./08-coach-integration.md)                   | How this connects to Root (the AI wellness coach)                                                                                     |
| 9   | [09-existing-file-touchpoints.md](./09-existing-file-touchpoints.md)   | Every existing file that will eventually need a small, additive change, and exactly what changes — **not modified by this blueprint** |
| —   | [interfaces/types.ts](./interfaces/types.ts)                           | Reference TypeScript types for the contracts above (not wired into the app build)                                                     |

## Key design decisions, up front

1. **Food identification and coaching judgment are two separate steps, deliberately.** The vision
   model's only job is: identify foods, estimate a coarse protein/carb/fat _level_ (low/moderate/
   high) with a confidence per dimension. A plain, deterministic TypeScript function — not another
   LLM call — compares that estimate to the member's Primal Pattern target and selects the
   coaching message from a reviewed template library. This mirrors
   `lib/body-assessment/postureMeasurements.ts` + `comparison.ts` (deterministic engines feeding
   off an AI-derived measurement), keeps MEF's coaching voice consistent and legally reviewable,
   and means the AI never improvises nutrition advice.
2. **The Primal Pattern Diet questionnaire and its "proprietary logic" don't exist in this repo
   yet.** This blueprint does not attempt to design that scoring algorithm — it defines the
   narrow output contract Food Lens needs (a per-member macro-emphasis target), so that logic can
   be built independently and plugged in. See doc 5.
3. **"Learn from corrections" means prompt/context personalization, not model fine-tuning.**
   Anthropic's API doesn't offer classical fine-tuning for this use case. The realistic, honest
   version of "learning" is: immediate per-scan recompute from confirmed items (MVP), then
   per-member correction history injected as few-shot context in future prompts (near-term), then
   aggregate correction analytics driving periodic prompt revisions (production). See doc 6.
4. **No coach-review audit trail table, unlike Body Assessment — on purpose.** Body Assessment is
   a clinical-adjacent measurement a practitioner signs off on. Food Lens is self-serve education.
   Adding a `food_lens_coach_reviews` table and a per-scan approval workflow would slow the
   feature down for no member benefit. Coaches still get visibility, for free, through the
   Universal Registry adapter feeding the Intelligence Engine — see doc 3 and doc 8 for why this
   is sufficient.
