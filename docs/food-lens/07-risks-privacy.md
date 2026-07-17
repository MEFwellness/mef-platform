# 7. Technical Risks, Limitations & Privacy Considerations

## 7.1 Accuracy limitations (be honest about these in-product, not just internally)

- **Composite and mixed dishes** (casseroles, stir-fries, sauced dishes, anything where
  ingredients aren't visually separable) are the hardest case for any vision model — expect lower
  confidence and more member corrections here than for a simple "chicken, rice, broccoli" plate.
  This is exactly why confidence is a first-class, always-visible field rather than an afterthought.
- **Occlusion and plating** — stacked or garnished food, food in deep bowls, food under sauce —
  degrades identification. Capture UX (doc 1's live framing guidance) helps but can't eliminate
  this.
- **Cultural/regional food coverage** — general-purpose vision-language models are trained on
  broadly Western/globally-common food imagery disproportionately; expect weaker accuracy on
  less-represented cuisines. Track this explicitly once correction data exists (doc 6 phase 3) —
  it's a fairness issue, not just an accuracy one, and MEF's member base should inform which
  cuisines need targeted eval attention.
- **No portion/weight signal** — by design (doc 2 §2.4), so this is a limitation only relative to
  a calorie-counting app's expectations, not relative to Food Lens's actual goal (relative
  balance, not absolute quantity).
- **A meal photo is a snapshot, not the whole day** — Food Lens should never imply a single meal's
  read is a verdict on the member's overall eating pattern. The coaching copy (doc 5 §5.4) and any
  aggregate trend framing (doc 6 phase 2) need to stay meal-scoped and pattern-scoped, not turn
  into an implied daily/weekly score without enough data to support one.

## 7.2 Coaching-quality and liability risk — why the architecture already mitigates this

The single biggest risk in a feature like this is an AI improvising nutrition advice that's wrong,
inconsistent, or reads as clinical/medical guidance MEF didn't intend to give. Doc 1 §1.5 and doc 5
§5.4 already address this structurally: the vision model never generates the coaching sentence,
only structured facts; a reviewed, versioned template library (owned by MEF's coaching/content
team, not engineering) produces every member-facing message. Anyone implementing this should
resist the temptation to "just let the model write the coaching line too" for a shortcut — it
reintroduces the exact risk this design avoids.

## 7.3 Eating-disorder sensitivity

A feature that scrutinizes a member's meal in real time, even framed as "coaching not counting,"
carries real risk for members with disordered eating patterns or a history of one. This needs
product/clinical input beyond what this blueprint can responsibly decide alone, but concretely:

- Never show numeric calories or gram weights, under any circumstance — already a hard product
  requirement, reinforced here as a safety issue, not just a brand-positioning one.
- Keep coaching language educational and non-judgmental — "consider increasing lean protein," never
  "you didn't eat enough protein" or anything scored/graded-sounding.
- This app already has a safety-classification gate for the conversational coach
  (`lib/conversation-coach/service.ts`'s `NO_LLM_LEVELS` check, which skips the LLM entirely and
  returns canned safety copy for members in a flagged state). **Food Lens should check the same
  member safety-classification state before showing scan results**, and soften or suppress
  detailed macro-balance feedback for members currently flagged, consistent with how the rest of
  the app already treats that signal. This is a cross-feature integration point worth flagging
  early to whoever owns the safety-classification system, not an afterthought bolted on later.
- Consider (product decision, not an engineering one) whether Food Lens should be opt-in with an
  explicit framing/consent step the first time a member opens it, similar to Body Assessment's
  intro screen (privacy/preparation notes before the first capture).

## 7.4 Privacy

- **Food photos are sensitive.** Dietary patterns can reveal health conditions, religious or
  cultural practices, pregnancy, disordered eating, and more. Treat meal photos with at least the
  same privacy bar as Body Assessment media: private storage bucket, per-member RLS-enforced
  folder paths, no public URLs ever, short-TTL signed URLs only for the vision provider call
  itself (doc 3 §3.4) — this blueprint applies that bar by default, not as an upgrade.
- **Third-party vision provider data handling** — before sending any member photo to Anthropic (or
  any vision API), confirm the actual data-retention/training-use terms under MEF's specific
  commercial agreement (Anthropic's default API terms don't use API inputs for model training, but
  this should be a verified compliance checkpoint against MEF's actual contract, not an assumption
  carried over from this blueprint). Same diligence applies to Open Food Facts/Nutritionix
  (product data only, not photos) and any OCR API evaluated for label scanning.
- **Retention policy** — decide (product/legal decision) how long meal photos are retained in
  storage after analysis completes. Unlike Body Assessment (where the photo may be clinically
  relevant long-term), Food Lens photos likely don't need indefinite retention once items are
  confirmed and the macro estimate is durable in `food_lens_macro_estimates` — consider an
  automatic deletion/expiry policy on the storage objects (not proposed concretely here; flag for
  a privacy/legal review before phase 1 ships).
- **Correction data aggregation** (doc 6 phase 3) must be genuinely de-identified before any
  cross-member analysis — no raw photo or per-member label history should leave the per-member RLS
  boundary as part of that process without explicit anonymization.

## 7.5 Cost risk

Vision API calls are the dominant per-scan cost. Concretely:

- Rate-limit scans per member per day, tiered by plan (premium feature framing already implies
  this should be more generous than a hypothetical free tier, but not unlimited).
- Barcode lookups (phase 3) avoid a vision call entirely for packaged foods — prioritizing this
  phase for members who scan a lot of packaged/repeat items is a meaningful cost lever, not just a
  feature completeness one.
- Per-member correction caching (phase 2) reduces re-identification cost for a member's recurring
  meals, which is also a cost benefit, not just an accuracy one.
- Monitor provider error/timeout rates from day one (reuse `AnthropicProvider`'s existing
  retry/timeout instrumentation) — a provider outage should degrade to a clear "not available right
  now" state (already the `not_configured`/`failed` status design in doc 3), never a silent hang
  or a fabricated result.
