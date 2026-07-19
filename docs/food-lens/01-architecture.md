# 1. System Architecture

## 1.1 High-level flow

```
Member                Client (browser/PWA)              Backend (Next.js server)          Third party
------                --------------------              ------------------------          -----------
opens Food Lens  -->   capture UX with live
                       framing/quality overlay
                       (on-device, no AI call)

points at meal   -->   member taps "capture"     -->     startFoodLensScanAction()
                                                          creates food_lens_scans row
                                                          returns upload target

                       uploads photo directly     -->     Supabase Storage
                       to private bucket                  (food-lens-media, per-member path)

                       calls                      -->     analyzeFoodLensScanAction(scanId)
                       analyzeFoodLensScanAction()         |
                                                            v
                                                          FoodLensProvider.analyzeMeal()
                                                          (signed URL, never raw bytes)   -->  Claude
                                                                                                (vision +
                                                                                                 forced tool-use
                                                                                                 JSON schema)
                                                          <-- items + macro-level estimate
                                                          + confidence, or throws/returns
                                                          "not_configured" -- never fabricates
                                                            |
                                                            v
                                                          writes food_lens_detected_items
                                                          (status: pending_confirmation)
                                                            |
                                                            v
                                                          deterministic comparison engine
                                                          (plain TS, NOT an LLM call):
                                                          compare macro estimate vs. the
                                                          member's active Primal Pattern
                                                          target -> writes
                                                          food_lens_pattern_comparisons
                                                          (verdict + template-selected
                                                          narrative + confidence)

                       renders results:          <--     getFoodLensScanAction(scanId)
                       detected items (editable),
                       confidence badges,
                       coaching narrative

member confirms/  -->   confirmDetectedItemAction() /
corrects items           correctDetectedItemAction() /
                         rejectDetectedItemAction()  -->  writes food_lens_corrections
                                                          (append-only)
                                                          recomputes macro estimate +
                                                          comparison from confirmed items
                                                          (still deterministic, no new
                                                          AI call needed)

                                                          --> lib/registry adapter writes
                                                          registry_entries
                                                          (domain: 'nutrition')
                                                          --> picked up by Intelligence
                                                          Engine / Root with zero changes
                                                          to those systems (see doc 8)
```

This is the same shape as `AssessmentWizard` → `CameraCapture` → `performAnalysis` →
`body_assessment_findings` in the existing Body Assessment feature, and should be built by
someone already familiar with that code path.

## 1.2 On-device vs. backend — and why

The Body Assessment feature's real lesson isn't "camera features call an AI vision API." It's
that **only the genuinely real-time, cheap-to-compute part runs on-device**; everything semantic
runs backend. Food Lens should split the same way:

| Concern                                                                                   | Where it runs                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live capture guidance (frame too dark/blurry, nothing plate-shaped in frame, hold steady) | **On-device**, browser only                                                                                                                                                                                              | Needs to run at interactive frame rates for a good capture UX. Doesn't need to know _what_ food it is — mirrors `PoseOverlay`/live pose validation, which only checks positioning quality, never identity. Can start as cheap pixel-level heuristics (brightness/blur via canvas `getImageData`, similar cost to existing capture-quality checks) rather than a model; a lightweight on-device object/plate detector (e.g. a small TFLite/MediaPipe model) is a reasonable v2 upgrade, not an MVP requirement. |
| Barcode decoding                                                                          | **On-device**, browser only                                                                                                                                                                                              | The native `BarcodeDetector` Web API (Chrome/Edge/Android) or `@zxing/browser` as a polyfill does real-time decoding client-side with no network round trip and no AI cost. Only the _decoded UPC string_ goes to the backend for a product lookup. See doc 2.                                                                                                                                                                                                                                                 |
| Food identification from a meal photo                                                     | **Backend**                                                                                                                                                                                                              | Needs a large vision-language model; not something to run client-side at usable quality or battery cost. One request, one response — no need for streaming or a persistent connection.                                                                                                                                                                                                                                                                                                                         |
| Macro-level estimation (protein/carb/fat as low/moderate/high)                            | **Backend**, same call as identification                                                                                                                                                                                 | Bundled into the same vision-model request via forced tool-use/structured output — see doc 2.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Nutrition-label OCR                                                                       | **Backend** (future)                                                                                                                                                                                                     | Real-world label photos are unconstrained (angle, glare, curved packaging); on-device OCR quality would be inconsistent. On-device only handles crop/framing guidance, same as barcode.                                                                                                                                                                                                                                                                                                                        |
| Comparison against the member's Primal Pattern target + coaching message selection        | **Backend**, deterministic, no AI call                                                                                                                                                                                   | Plain TypeScript, mirrors `lib/body-assessment/comparison.ts`. See doc 5 and the note in the README.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Correction storage & recompute                                                            | **Backend**                                                                                                                                                                                                              | Needs to be durable and drive the registry/Intelligence Engine pipeline; also the source of truth for future personalization context (doc 6).                                                                                                                                                                                                                                                                                                                                                                  |
| Raw photo bytes                                                                           | **Never touch the Next.js server as a body payload.** Client uploads directly to Supabase Storage (private bucket); the server only ever handles storage paths and short-lived signed URLs for the vision provider call. | Exactly the `body_assessment_captures` pattern — smaller payloads through server actions, no image bytes sitting in server action memory or logs.                                                                                                                                                                                                                                                                                                                                                              |

## 1.3 Component inventory (proposed, not built)

Mirrors `components/body-assessment/`:

- `FoodLensCaptureFlow.tsx` — top-level wizard: Intro (what this feature is / isn't, privacy note)
  → Capture → Review/Confirm → Results. Equivalent to `AssessmentWizard.tsx`.
- `MealCamera.tsx` — `getUserMedia` + canvas capture, on-device quality/framing overlay. Equivalent
  to `CameraCapture.tsx`, substantially simpler (no pose landmarker, no multi-person detection —
  just brightness/blur/framing heuristics).
- `DetectedItemsList.tsx` — editable list of AI-identified foods with per-item confidence badge,
  confirm/edit/remove/add-manually actions.
- `MacroBalanceMeter.tsx` — a **qualitative** protein/carb/fat visual (three ordinal bars or a
  simple triangle plot showing low/moderate/high, each annotated with its confidence) — explicitly
  not a pie chart with percentages, to avoid implying false precision.
- `PatternComparisonCard.tsx` — the coaching verdict + narrative, with a visible confidence
  indicator and a one-line "these are AI estimates, not exact measurements" disclaimer rendered
  every time. Equivalent to `MemberFindingCard.tsx`.
- `FoodLensHistory.tsx` — list of past scans (`app/food-lens/page.tsx`, mirrors
  `app/assessment/page.tsx`'s hub pattern).

None of these exist yet; this is a proposed inventory for whoever implements the frontend, not a
claim about what's in the working tree today.

## 1.4 Route shape (proposed)

Mirrors the Body Assessment route pattern exactly:

- `app/food-lens/page.tsx` — hub/history (server component; `auth.getUser()` → redirect if
  unauthenticated → list past scans).
- `app/food-lens/new/page.tsx` — mounts `FoodLensCaptureFlow`.
- `app/food-lens/[id]/page.tsx` — results for one scan (detected items, macro balance, comparison
  narrative, correction UI).

## 1.5 Why identification and coaching-message-selection are split

Worth restating because it's the single most load-bearing decision in this architecture: if the
vision model were asked to _also_ produce the coaching sentence ("this looks carbohydrate-heavy,
add more protein"), MEF would be shipping AI-improvised nutrition advice with no consistency
guarantee and no easy way to review or correct the message library. By constraining the AI's job
to structured facts (items + coarse macro levels + confidence) and keeping the judgment
("is this a good match, and what's the coaching line") in reviewable application code, MEF keeps
full editorial control over what members are told, exactly like `postureMeasurements.ts` produces
structured `PostureEstimate[]` and a separate, deterministic layer turns those into narratives —
never raw model output shown directly to a member.
