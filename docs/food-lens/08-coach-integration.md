# 8. Integration with Root (the AI Wellness Coach)

## 8.1 Principle: integrate through the Registry, not through direct wiring

The Conversation Coach (`lib/conversation-coach/context.ts`) already assembles its context from
the **centralized Intelligence Engine**, not from querying individual feature tables directly —
that's the whole point of `lib/intelligence-engine/computeMemberIntelligence` existing as "the one
reusable orchestrator every AI-facing feature should call instead of recomputing signals itself."
And the Universal Metric & Finding Registry (`lib/registry/`, `registry_entries`) already reserves
a `'nutrition'` domain specifically so a future feature like this one can plug in without anyone
touching the Intelligence Engine, Intelligence Core, or Conversation Coach source. Food Lens should
use exactly that seam:

```
food_lens_pattern_comparisons  --[lib/registry/adapters/foodLens.ts]-->  registry_entries (domain: 'nutrition')
                                                                                  |
                                                                                  v
                                                          MemberHealthProfile (read once by Intelligence Engine)
                                                                                  |
                                                                                  v
                                              Intelligence Core (identity observations, coaching style)
                                                                                  |
                                                                                  v
                                        Conversation Coach context.ts -- gatherConversationContext()
                                                                                  |
                                                                                  v
                                                              Root can reference recent meal-pattern
                                                              trends in ongoing conversation, e.g.
                                                              "I noticed your last few meals have
                                                              leaned carb-heavy against your pattern —
                                                              want to talk through some swaps?"
```

This is doc 6 phase 2's single integration line-item — `lib/registry/adapters/foodLens.ts` — and
it's deliberately the _only_ thing that needs to exist for Root to become nutrition-aware. No
change to `context.ts`, the Intelligence Engine, or the Intelligence Core is required.

## 8.2 The floating "Ask Root" launcher on Food Lens screens

`lib/conversation-coach/entryContext.ts` holds pure, page-specific one-liner builders
(`buildDashboardEntryContext`, `buildTodayEntryContext`, `buildBodyAssessmentReportEntryContext`,
etc.) that take data the host page already fetched and hand a short string to the floating
launcher — never re-querying the DB. Food Lens's results page adds its own:

```ts
function buildFoodLensEntryContext(
  scan: FoodLensScan,
  comparison: PatternComparison | null
): string;
```

e.g. `"Member just scanned a meal that came back carbohydrate-heavy against their protein-forward
Primal Pattern target."` — giving Root immediate, scan-specific context if the member taps "Ask
Root" right from the results screen, without waiting for the registry pipeline to run. This is
additive to `entryContext.ts` (a new exported function, doc 9 covers exactly what that touch
looks like) and doesn't change any existing entry-context builder.

## 8.3 What Root should _not_ do

Root should never be the one generating the meal-specific coaching verdict — that's
`food_lens_pattern_comparisons.narrative`, produced deterministically (doc 5 §5.4). Root's role is
downstream: a member can _ask about_ a result conversationally ("why did it say this was
carb-heavy?", "what should I eat instead next time?") and Root, with the entry context and/or
registry-derived pattern history, can have that broader conversation using its normal LLM-backed
reply pipeline (`lib/conversation-coach/service.ts`) — including its existing safety
classification gate, memory system, and fallback behavior. The one-line verdict on the results
screen itself stays template-driven and consistent; the open-ended follow-up conversation is where
Root's actual conversational strengths apply.

## 8.4 Coaching Brain (`lib/brain/`) — phase 3, not MVP

Once enough `registry_entries` with `domain: 'nutrition'` accumulate for a member, the Coaching
Brain's `getCoachingFocusDecision` (which today weighs check-ins, wellness index, and streaks
across celebration/challenge/risk/priority engines to decide "today's coaching focus") is a
natural place to add nutrition-pattern signals as one more input — e.g. surfacing a sustained
good-match streak as a celebration moment, or a sustained heavy-pattern trend as a gentle priority
nudge on the Today page. This is purely additive to that engine's existing signal set and
explicitly scoped to phase 3 (doc 6) — premature to design in detail before real registry data
exists to validate against.

## 8.5 Why this is a cleaner integration than Body Assessment's

Body Assessment needed a bespoke coach-review workflow (`body_assessment_coach_reviews`,
`assessment_ai_analyses`/`assessment_ai_observations`) because a practitioner needs to approve
clinical-adjacent findings before a member sees them, and because coaches need a dedicated review
queue UI. Food Lens has neither requirement (doc 3 §3.2) — which means its entire coach/AI-coach
integration story is the single registry adapter described above, with no new coach-facing review
UI, no approval workflow, and no changes to three separate, already-complex systems. That's a
deliberate simplicity gain from treating this as an education feature rather than a clinical one,
not an oversight.
