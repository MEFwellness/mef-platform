# 4. API Contracts

## 4.1 Implementation shape: server actions, not new route handlers

This codebase's convention (confirmed in `app/actions/body-assessment.ts` and every other feature)
is one `'use server'` file per feature under `app/actions/`, each action re-deriving `userId` from
the session (never trusting a client-supplied id), always re-checking row ownership before a
write, and returning an `ActionResult`-shaped `{ error? }` for mutations. Food Lens should follow
this exactly with a proposed `app/actions/food-lens.ts` — **not** new `app/api/food-lens/*` route
handlers. The two existing `app/api/*` route handlers in this app (`speech`, `cron/wearable-daily`)
exist because they need something a server action can't do (streaming audio, a cron-triggered
entrypoint with no session) — Food Lens has neither need for its core flow.

The contracts below are written in a REST-like request/response shape purely for clarity and
future-proofing (e.g. if a native mobile client is ever built against the same backend); the MVP
implementation of every one of these is a typed server action function, not an HTTP route.

## 4.2 Scan lifecycle

### `startFoodLensScanAction`

Creates the scan row and hands back where to upload.

```
Request:  { scanType: 'meal_photo' | 'barcode' | 'nutrition_label' }
Response: { scanId: string, uploadPath: string, signedUploadUrl: string }
Errors:   UNAUTHENTICATED
```

### `recordCaptureAction`

Called after the client finishes the direct-to-storage upload (see doc 1 §1.2).

```
Request:  { scanId: string, storagePath: string, captureType: 'photo' | 'barcode_image' | 'label_image',
            deviceInfo?: Record<string, unknown> }
Response: { captureId: string }
Errors:   UNAUTHENTICATED, SCAN_NOT_FOUND, SCAN_NOT_OWNED
```

### `analyzeFoodLensScanAction`

Triggers the vision provider call and writes detected items + macro estimate + comparison.
Mirrors `performAnalysis` in `app/actions/body-assessment.ts`.

```
Request:  { scanId: string }
Response: {
  status: 'analyzed' | 'not_configured' | 'failed',
  detectedItems?: DetectedItem[],
  macroEstimate?: MacroEstimate,
  comparison?: PatternComparison,
  error?: string   // present only when status = 'failed'
}
Errors:   UNAUTHENTICATED, SCAN_NOT_FOUND, SCAN_NOT_OWNED, SCAN_ALREADY_ANALYZING
```

Note: if `status` is `'not_configured'`, the response must not include fabricated
`detectedItems`/`macroEstimate`/`comparison` — same discipline as
`UnconfiguredBodyAssessmentProvider`. The UI shows a clear "Food Lens isn't available yet" state,
not a guess.

### `getFoodLensScanAction`

Full read for the results page.

```
Request:  { scanId: string }
Response: {
  scan: FoodLensScan,
  detectedItems: DetectedItem[],       // current (non-superseded) items only
  macroEstimate: MacroEstimate | null, // latest version
  comparison: PatternComparison | null,
  captures: { captureId: string, signedViewUrl: string, captureType: string }[]
}
Errors:   UNAUTHENTICATED, SCAN_NOT_FOUND, SCAN_NOT_OWNED
```

### `listMyFoodLensScansAction`

History/hub list.

```
Request:  { limit?: number, before?: string /* cursor: created_at */ }
Response: { scans: FoodLensScanSummary[], nextCursor: string | null }
Errors:   UNAUTHENTICATED
```

## 4.3 Corrections

### `confirmDetectedItemAction`

```
Request:  { itemId: string }
Response: { item: DetectedItem }   // status now 'confirmed'
Errors:   UNAUTHENTICATED, ITEM_NOT_FOUND, ITEM_NOT_OWNED
```

### `rejectDetectedItemAction`

```
Request:  { itemId: string }
Response: { item: DetectedItem }   // status now 'rejected'
Errors:   UNAUTHENTICATED, ITEM_NOT_FOUND, ITEM_NOT_OWNED
```

### `correctDetectedItemAction`

Writes a `food_lens_corrections` row and supersedes the original item with a new one — never
mutates the AI's original detection in place, so what the model actually said stays inspectable.

```
Request:  { itemId: string, correctedLabel?: string, correctedCategory?: FoodCategory }
Response: { newItem: DetectedItem, correction: FoodLensCorrection }
Errors:   UNAUTHENTICATED, ITEM_NOT_FOUND, ITEM_NOT_OWNED, NO_CHANGE_PROVIDED
```

### `addManualFoodItemAction`

For something the AI missed entirely.

```
Request:  { scanId: string, label: string, category: FoodCategory }
Response: { item: DetectedItem }   // source: 'member_added', confidence: 1
Errors:   UNAUTHENTICATED, SCAN_NOT_FOUND, SCAN_NOT_OWNED
```

### `recomputeFoodLensResultAction`

Called automatically after any of the four correction actions above (or explicitly by the client
after a batch of edits) — recomputes the macro estimate and comparison from the current set of
confirmed items. Purely deterministic, no AI call. See doc 1 §1.5 and doc 6 for why this is the
first tier of "learning from corrections."

```
Request:  { scanId: string }
Response: { macroEstimate: MacroEstimate, comparison: PatternComparison }
Errors:   UNAUTHENTICATED, SCAN_NOT_FOUND, SCAN_NOT_OWNED
```

## 4.4 Primal Pattern target (read-only from Food Lens's side)

### `getActivePrimalPatternProfileAction`

Food Lens's only touchpoint with the (separately built) questionnaire logic — a read of whatever
that system last wrote. See doc 5 for the full contract discussion.

```
Request:  {}
Response: { profile: PrimalPatternProfile | null }  // null if member hasn't completed the questionnaire yet
Errors:   UNAUTHENTICATED
```

If `profile` is `null`, `analyzeFoodLensScanAction` should still identify foods and produce a
macro estimate (still useful on its own — "this meal appears carbohydrate-heavy," full stop) but
skip the comparison step and prompt the member to complete the Primal Pattern questionnaire for
personalized coaching. This keeps Food Lens usable before that dependency ships — see doc 6 phase 1.

## 4.5 Future: barcode & label lookups (not MVP, contracts sketched for forward-compatibility)

### `lookupBarcodeAction` (phase 3)

```
Request:  { scanId: string, upc: string }   // decoded on-device, see doc 2 §2.2
Response: { product: PackagedProduct | null, macroEstimate: MacroEstimate | null }
Errors:   UNAUTHENTICATED, SCAN_NOT_FOUND, SCAN_NOT_OWNED, PROVIDER_UNAVAILABLE
```

### `analyzeNutritionLabelAction` (phase 3)

```
Request:  { scanId: string }   // capture already recorded via recordCaptureAction
Response: { extractedLabel: NutritionLabelFields | null, macroEstimate: MacroEstimate | null,
            status: 'analyzed' | 'not_configured' | 'failed' }
Errors:   UNAUTHENTICATED, SCAN_NOT_FOUND, SCAN_NOT_OWNED
```

Full type shapes for everything referenced above (`DetectedItem`, `MacroEstimate`,
`PatternComparison`, `PrimalPatternProfile`, etc.) are in
[`interfaces/types.ts`](./interfaces/types.ts).
