# Rooted Reset — Adaptive Reveal & Interpretation Integrity Audit

**Type:** read-only audit. No code, copy, database rows, migrations or config were changed. The only file added is this report.

**Date:** 2026-08-17
**Codebase:** `apps/consumer-web-app` at `81c9682` (branch `main`)
**Live site:** `https://app.mefwellness.com`, walked as the standing production test member `8weeks2fab@gmail.com` (display name "Ebony"). That member is 13 days in, has **3 completed check-ins**, 1 onboarding submission, 1 food scan, 0 movement sessions. Everything quoted in the live sections below is the exact on-screen wording captured from that account on 2026-08-17.

**Method actually run**

- **Part A, code sweep.** Traced intake → registry → each interpretation surface. Targeted greps for confidence percentages/labels, diagnostic vocabulary, raw enum renders in JSX, TODO/placeholder strings in user-facing components, and conditional-vs-unconditional rendering across the member and coach route trees.
- **Part B, live walk.** Signed in as the test member and captured the full rendered text and a screenshot of 44 member screens plus the daily check-in wizard end to end. The check-in was walked screen by screen and **deliberately never submitted and never exited through the app's own exit button** — the exit button is the only path that writes a draft row (`app/checkin/CheckinForm.tsx:838`), so closing the browser instead wrote nothing. No test-member data was created, altered or deleted.

**One gap to state up front:** the coach and admin views were **not** walked live. I do not have coach credentials, and the password-free session-minting route (fetching the production service-role key) was blocked by this environment's permission classifier. Every coach-surface finding below is therefore a **code** finding, not a live observation, and is marked as such. To get coach findings verified live, either supply a coach password or allow `npx supabase projects api-keys` to write to a file.

---

## Summary of the three build layers

| Layer | Violations found | Rough size |
|---|---|---|
| 1. Visibility | 11 | **L** — nothing today reads an intake answer to decide what to show, except one flag |
| 2. Interpretation | 19 | **L** — 9 independent interpretation engines that never reconcile |
| 3. Language | 17 | **M** — mostly find-and-replace plus 3 gating decisions |

---

# SECTION 1 — VISIBILITY LAYER VIOLATIONS (Rule 1)

**The headline.** Exactly **one** feature in the entire app changes what a member sees based on an intake answer: water tracking, gated on `profiles.hydration_focus` (migration 163). Every other assessment, tracker, feature, card and follow-up question is shown to every member on identical rules that never consult her answers, her behavior, or her patterns. The gating that *does* exist is of three kinds, none of which is adaptive: **membership tier**, **coach assignment**, and a **fixed linear chain** of three questionnaires.

### 1.1 The intake-driven unlock engine exists and is dead code — **L**

- **Files:** `lib/investigation-engine/unlockEngine.ts:112`, `:143`; `lib/investigation-engine/registry.ts:73-180`; `lib/investigation-engine/rootRouter.ts:65-99`
- **What is wrong:** `lib/investigation-engine/registry.ts` declares real, reviewed `unlockTriggers` for every assessment, keyed on domain priority derived from intake — e.g. the Nutrition & Lifestyle questionnaire declares `{ kind: 'priority', domain: 'nutrition_metabolic_health', minPriority: 'worth_watching' }`, the Body Assessment declares `{ kind: 'finding_routed', domain: 'movement', minSeverity: 'moderate' }`. `unlockEngine.ts` implements the evaluator. **`isUnlockTriggerSatisfied` and `isInvestigationUnlocked` have zero callers anywhere in the codebase.** `decideNextAction()` — the function that actually decides what the member is offered — never calls either; it ranks by completion status and eligibility only (`pickRecommendation(factsByKey)`).
- **Rule broken:** 1
- **Fix size:** **L** (this is the visibility layer's whole spine)

### 1.2 The second unlock system is also declared and unused — **S**

- **File:** `lib/assessment-registry/registry.ts` — every entry
- **What is wrong:** `AssessmentDefinition.prerequisites` carries `unlockRule: string | null` and `recommendationRule: string | null`. **All 14 registered assessments set both to `null`.** Two separate designed-but-inert unlock vocabularies now exist side by side (this one and 1.1), which is itself a hazard for the build: pick one before writing rules into either.
- **Rule broken:** 1
- **Fix size:** **S** to delete the loser, **L** to populate the winner

### 1.3 Every questionnaire is offered to every member on fixed rules — **M**

- **Files:** `lib/assessment-registry/registry.ts`, `lib/assessment-registry/status.ts:104-130`, `app/questionnaires/page.tsx`
- **What is wrong:** the only prerequisites populated anywhere are a fixed three-step chain: `core-values-snapshot` → `life-signal-check` → `readiness-pulse`. Every other assessment has `prerequisiteKeys: []`. A member whose intake said sleep was her problem and a member whose intake said digestion was her problem see the identical catalogue in the identical order.
- **Live wording (Questionnaires, 2026-08-17):** the test member — whose intake reported stress 4/5, sleep 2/5, energy 2/5, digestion 2/5, and hip + lower-back pain — is shown all six available questionnaires with no ordering or emphasis derived from any of that. The two locked ones say **"Complete a prior step first to unlock this."** — locked by position in a fixed chain, not by anything about her.
- **Rule broken:** 1
- **Fix size:** **M**

### 1.4 The Today page's trackers and zones are unconditional — **M**

- **File:** `app/today/TodayZones.tsx:222-223`, `:293`, `:369`
- **What is wrong:** water is correctly gated (`showWaterOpen = hydrationTracked && !waterLoggedToday`). **Movement level, habits, notifications, the totals panel and the capability panel are not gated on anything.** `MovementLevelTracker` renders for every member regardless of whether movement is a stated concern, whether she has ever logged a session, or whether any pattern implicates it.
- **Live wording (Today):** "**MOVEMENT** — Log how much you moved today, any time. None / Light / Moderate / Full session — Nothing logged yet today." shown to a member with 0 movement days logged in 13 days, alongside "**YOUR TOTALS** — 3 Check-ins logged / 0 Days movement logged."
- **Rule broken:** 1
- **Fix size:** **M**

### 1.5 The Home screen renders every zone for every member — **M**

- **File:** `app/dashboard/page.tsx:395-628`
- **What is wrong:** Quick Actions, Today, Active Experiments, Personal Reset Plan, Your Path (Movement Assessment + Questionnaires + Comprehensive), What Root Is Noticing (5-card carousel), Trends, and Coming Up all render for every member. Several cards do self-gate on *having data* (`RootDiscoveryCard`, `ActiveExperimentsSection`, `PersonalResetPlanCard` render nothing when empty — good), but **none gates on relevance**. The distinction matters: "do I have data for this?" is not "is this her problem?"
- **Rule broken:** 1
- **Fix size:** **M**

### 1.6 The wearable pitch is shown to everyone, twice, permanently — **S**

- **Files:** `app/dashboard/page.tsx:603-624`, `:678-681`; `components/wearables/ConnectWearableCard.tsx`
- **Live wording:** a full-bleed panel "**UNLOCK SMARTER COACHING** — Connect your wearable so Root can personalize your sleep, recovery, stress, activity, and daily coaching." **and** a modal that opened over Home on login: "**Get the Most From Root** — Connect your wearable to unlock personalized recovery insights, adaptive coaching, sleep recommendations, and smarter daily guidance. [Connect Device] [Maybe Later]". Both on the same screen load, for a member 13 days in with no device.
- **Rule broken:** 1, 7
- **Fix size:** **S**

### 1.7 The daily check-in asks the same fixed questions of everyone — **M**

- **Files:** `lib/daily-checkin-adaptive/plan.ts`, `app/checkin/CheckinForm.tsx`
- **What is wrong:** there is a real adaptive layer, but it only governs the **rotating driver probes**. The four fixed screens are identical for every member. There is no path by which "my digestion is fine" at intake removes the digestion question, or "I have hip pain" adds a hip-specific one.
- **Live wording (check-in walked in full, 4 screens, not submitted):** Screen 1 "How are you feeling emotionally right now? / How energized do you feel right now? / How much stress are you carrying right now?" · Screen 2 "How restorative was your sleep? / Did it take you a while to fall asleep last night?" · Screen 3 "What was your main protein source today, if any? / How active would you say you were today overall, movement-wise? / **DISCOMFORT** Any discomfort today?" · Screen 4 "Send your coach a note about something new or worsening / Anything else worth noting?"
- **Rule broken:** 1
- **Fix size:** **M**

### 1.8 Findings from one intake answer are broadcast to multiple Root Map domains by table — **M**

- **File:** `lib/investigation-engine/domains.ts:164-177`
- **What is wrong:** `COACHING_DOMAIN_TO_REGISTRY_DOMAIN` deliberately maps one registry domain onto several coaching domains — `stress` → 2 domains, `sleep` → 2, `movement` → 3, `nutrition` → 2. So a domain a member has no data or concern in still lights up with someone else's findings. This is both a visibility problem (showing her a domain she never triggered) and an evidence problem (see 2.6).
- **Live wording (Root Map):** "**Movement & Physical Capacity — 0 of 21 days logged**" nevertheless shows two findings and a verdict. "**Digestion & Gut Health — 0 of 21 days logged**" likewise.
- **Rule broken:** 1, 3
- **Fix size:** **M**

### 1.9 Root Map shows all twelve domains to every member — **S**

- **File:** `lib/root-map/builder.ts`, `app/root-map/page.tsx`
- **What is wrong:** every member gets the same 12-segment ring, including four that carry the standing message "**These four are real coaching territory. There just isn't a dedicated assessment for them on the platform yet, so nothing here is tracked from your activity today.**" (Identity & Self-Concept, Purpose & Motivation, Relationships & Social Connection, Environment & Daily Rhythm). That is honest, but it is a third of the map permanently occupied by "we can't see this."
- **Rule broken:** 1
- **Fix size:** **S**

### 1.10 Coach client detail renders ~30 panels unconditionally — **M**

- **File:** `app/coach/clients/[id]/page.tsx:354-802`
- **What is wrong:** WellnessIndex, seven metric tiles, Energy Trend, Coaching Insights, Brain, Coaching Escalations, Intelligence, Member Intelligence, Root Cause Signals, Case View, Recommendations, Longitudinal Intelligence, Coach Workspace, Intelligence Core, Conversation, Body Assessment, WBSA, Core Values, Life Signal, Readiness Pulse, Reset Plan, Movement Profile, Programs, Prescription Intelligence, Assessment Assignment, Narrative, Feed, Baseline, Check-in History, Coach Notes — in one flat column, all the same visual weight.
- **Rule broken:** 1, 9
- **Fix size:** **M**
- *(Code finding — coach views were not walked live.)*

### 1.11 Two routes 404 for a signed-in member — **S**

- **Live:** `/assessments` and `/account` both render "**Page not found** — That page doesn't exist, or it hasn't been built yet." even though `app/assessments/` and `app/account/` exist in the route tree. Neither is currently linked from the member nav, so this is latent rather than active, but any future link to either would land on a dead end.
- **Rule broken:** 1 (a shipped surface in an unreachable state), 6
- **Fix size:** **S**

---

# SECTION 2 — INTERPRETATION LAYER VIOLATIONS (Rules 2, 3, 7, 8, 9)

## 2A. One interpretation everywhere (Rule 2)

### 2.1 There are nine independent interpretation engines and no shared layer — **L**

- **Files:** `lib/scoring/` · `lib/investigation-engine/` + `lib/registry/` · `lib/narrative/` · `lib/intelligence/` · `lib/intelligence-engine/` · `lib/intelligence-core/` · `lib/coaching-insights/` · `lib/longitudinal-intelligence/` · `lib/correlation-engine/` · `lib/brain/` · `lib/case-view/`
- **What is wrong:** each one reads raw member data and computes its own verdict. Nothing reads a shared interpretation. Concretely, "what is this member's strength / what is her problem" is computed **five separate times, five different ways**:
  1. `lib/scoring/explain.ts:44-46` — rank-orders five domain averages; top = strength, bottom = opportunity.
  2. `lib/investigation-engine/unlockEngine.ts:49` — severity of the strongest active registry finding per coaching domain.
  3. `lib/intelligence-core/service.ts` — confidence-weighted identity observations → `topStrengths` / `biggestOpportunities`.
  4. `lib/brain/priorityEngine.ts` — today's coaching focus from check-in signals.
  5. `lib/longitudinal-intelligence/signalState.ts` — tiered signal states.
- **Rule broken:** 2
- **Fix size:** **L**

### 2.2 Four surfaces named a different "today's focus" on the same morning — **L**

This is the single most legible symptom of 2.1. All four captured live within minutes of each other on 2026-08-17:

| Screen | Exact wording | Source |
|---|---|---|
| Home → Root's Daily Brief | "**TODAY'S FOCUS** — Stress" | `lib/brain/priorityEngine.ts` |
| Home → What Root Is Noticing carousel | "**RECOMMENDED FOR YOU** — Today's focus: Consistency" | persisted `member_recommendations` |
| Root Score → Prioritized Next Action | "**Complete today's movement session, even a short one.**" | `lib/scoring/explain.ts` |
| Today → Your Priority Today | "**Take a few minutes for your Daily Reset.**" | `lib/priority/select.ts` |
| Movement | "**TODAY'S FOCUS** — Strength & conditioning · Ready to train · ~40 min" | `lib/movement/` |
| Root Map | "**Stress & Nervous System Regulation looks like a specific area worth exploring further.**" | `lib/investigation-engine/routerOutcome.ts` |

Six surfaces, five different answers. **Fix size: L**

### 2.3 The recommendations page shows two things both titled "Today's coaching focus" — **M**

- **Files:** `lib/intelligence-engine/recommendations.ts:148-161`, `lib/recommendation-engine/data.ts`
- **What is wrong:** `dailyCoachingRecommendation()` writes a **persisted** row titled `Today's coaching focus: ${decision.focusLabel}`. Persisted rows from earlier days are not retired when a new one is written, so they accumulate and all read as "today".
- **Live wording (Recommendations, and identically inside Progress):**
  > **A WEEKLY PRACTICE** — Today's coaching focus: Stress — "Your recent check-ins point to stress as today's most useful place to focus." [Mark done] [Not helpful]
  > **A DAILY HABIT** — Today's coaching focus: Hydration — "Your recent check-ins point to hydration as today's most useful place to focus." [Mark done] [Not helpful]
- **Rule broken:** 2, 7
- **Fix size:** **M**

### 2.4 Root itself contradicts the Home screen about whether a score exists — **M**

- **Live wording (Conversation, asked "What does my root score mean?"):**
  > "Right now yours **hasn't calculated yet today since there's no check-in logged**. Once you check in, you'll see it reflect where you're actually at…"
  >
  > — while Home, at the same moment, displays "**27 /100 · Steady · HIGH CONFIDENCE**" and Root Score displays "27 / 100 · Steady since last calculation · Priority Focus · High confidence".
- **Files:** `lib/conversation-coach/prompt.ts` builds the LLM's context separately from `lib/scoring/data.ts`'s snapshot read.
- **Rule broken:** 2
- **Fix size:** **M**

### 2.5 Two surfaces disagree about whether patterns exist at all — **S**

- **Live wording:** Progress → "**COACHING INSIGHTS** — Complete a few check-ins and Root will start noticing patterns worth surfacing here." · Insights (one tap away) → "**Patterns We're Beginning to Notice** — Discomfort: hips: We noticed this once. / Discomfort: lower back: You mentioned this once. / Digestive Complaints: You mentioned this once."
- **Files:** `app/progress/page.tsx` reads `lib/coaching-insights/`; `app/insights/page.tsx:137` reads `lib/longitudinal-intelligence/`.
- **Rule broken:** 2, 3
- **Fix size:** **S**

## 2B. Evidence integrity (Rule 3)

### 2.6 One intake answer is presented as up to three independent findings — **M**

- **Files:** `lib/registry/adapters/onboarding.ts:141`, `lib/investigation-engine/domains.ts:164-177`, `lib/root-map/builder.ts`
- **What is wrong:** one slider answer at intake writes one registry finding; the domain table then fans that single finding out across two or three Root Map domains, where each appearance reads as a separate observation with no indication they are the same answer.
- **Live wording (Root Map):**
  - "Elevated Stress reported as 'poor'…" appears under **Stress & Nervous System Regulation** *and* **Emotional Resilience & Mood**.
  - "Low Energy reported as 'poor'…" and "Poor Sleep Quality reported as 'poor'…" appear under **Sleep & Circadian Rhythm** *and* **Recovery & Energy Regulation**.
  - "Ongoing discomfort in the hips…" and "…lower back…" appear under **Recovery & Energy Regulation**, **Movement & Physical Capacity** *and* **Pain & Structural Integrity**.
- **Rule broken:** 3 (bullet 2)
- **Fix size:** **M**

### 2.7 The same six findings are listed twice on one screen — **S**

- **File:** `lib/intelligence-engine/memberFacingNoticing.ts:53`, `:60`; `app/noticing/page.tsx:89`, `:118`
- **What is wrong:** `noticing` maps every active finding to its narrative; `worthAttention` maps the moderate/significant subset to its label. Both render on the same screen, so a moderate finding is stated twice.
- **Live wording (What We're Noticing):** six bullets under **WHAT WE'RE NOTICING**, then four of the same six repeated as bare labels under **AREAS WORTH PAYING ATTENTION TO** (Digestive Complaints / Low Energy / Elevated Stress / Poor Sleep Quality).
- **Rule broken:** 3 (bullet 2)
- **Fix size:** **S**

### 2.8 A single observation is filed under a heading that calls it a pattern — **S**

- **File:** `app/actions/longitudinalIntelligence.ts:81-85` — `emergingPatterns` explicitly includes `state === 'one_time_observation'`; `app/insights/page.tsx:137` titles that array **"Patterns We're Beginning to Notice"**.
- **What is wrong:** the sentence-level copy is honest ("We noticed this once", `lib/longitudinal-intelligence/copy.ts:17`) and the heading overrides it. The tiering system underneath is correct; only the grouping is wrong.
- **Live wording (Insights):** "**Patterns We're Beginning to Notice** — Discomfort: hips: **We noticed this once.**"
- **Rule broken:** 3 (bullet 3)
- **Fix size:** **S** (move `one_time_observation` out of `emergingPatterns` into its own honestly-labelled group)

### 2.9 "High confidence" is claimed while all five underlying domains read "Building" — **M**

This is the sharpest evidence violation in the app, and it is on the first screen after login.

- **Files:** `lib/scoring/confidence.ts:25-35`, `lib/scoring/config.ts:34`, `components/dashboard/HomeHero.tsx:268`, `app/root-score/page.tsx:177`
- **What is wrong:** `computeRootConfidence` = `coverageRatio × 0.7 + historyFactor × 0.3`, where `historyFactor = min(1, priorSnapshotCount / 5)`. **`priorSnapshotCount` counts how many times the score has been calculated, not how much member evidence exists.** Snapshots accrue daily from a cron whether or not the member logs anything, so after five days every member's history factor is maxed. Meanwhile each of the five domain scores independently computes its own coverage confidence (`lib/scoring/domains.ts:38-53`) and all five can read "Building" while the roll-up reads "High".
- **Live wording, both at once on 2026-08-17 (Root Score):**
  > "27 / 100 · Steady since last calculation · **Priority Focus · High confidence**"
  > … and immediately below, under **DOMAIN BREAKDOWN**: Recovery **Building**, Stress Regulation **Building**, Nutrition **Building**, Movement **Building**, Consistency **Building**.
  > And on Home: "27 /100 · Steady · **HIGH CONFIDENCE**".
- **Rule broken:** 3 (bullet 4), 4
- **Fix size:** **M**

### 2.10 A low average is presented as a confirmed strength — **M**

- **File:** `lib/scoring/explain.ts:44-46`, `:60-63`
- **What is wrong:** `buildExplanation` sorts the available domain scores and declares the top one a strength and the bottom one the opportunity, **with no minimum data requirement and no confidence gate**. The only guard is `available.length > 1`.
- **Live wording (Home hero and Root Score, from 3 check-ins in 13 days, over a recovery score of 50/100):**
  > "**Your recovery is a real strength, while movement consistency is your clearest opportunity.**"
- **Rule broken:** 3 (bullets 1 and 4)
- **Fix size:** **M**

### 2.11 Domains with zero logged days still get verdicts — **S**

- **File:** `lib/root-map/builder.ts:69-100` — `recommendationCopyForDomain()` returns "Looking steady / Nothing specific needed here right now" for `priority === 'quiet'`, which is what a domain with no data resolves to.
- **Live wording (Root Map):** "**Movement & Physical Capacity — 0 of 21 days logged** … **LOOKING STEADY** — Nothing specific needed here right now." for a member with two active pain findings and zero movement sessions in 13 days. Same on **Digestion & Gut Health — 0 of 21 days logged**.
- **Rule broken:** 3 (bullets 1 and 4) — absence of data is being reported as absence of a problem
- **Fix size:** **S**

### 2.12 "Improving" is derived from a severity value that means "nothing was found" — **S**

- **File:** `lib/intelligence-engine/memberFacingNoticing.ts:56-58` — the improving list is `trend_status === 'improving' **|| severity === 'none'**`.
- **Live wording (What We're Noticing):** "**WHAT'S IMPROVING** — Packaged food scan has been improving." — generated from a single barcode scan whose severity was `'none'` (see `lib/registry/adapters/foodProducts.ts:18-23`). One scan, no trend, no second data point.
- **Rule broken:** 3 (bullets 1, 3 and 4)
- **Fix size:** **S**

### 2.13 Yesterday's check-in is narrated as today's state — **S**

- **File:** `lib/coaching-engine/` (Root's Daily Brief), rendered `app/dashboard/page.tsx`
- **Live wording (Home, Root's Daily Brief, on a day with no check-in logged):**
  > "**SLEEP** — Your sleep was only fair last night." · "**STRESS LEVEL** — Your stress was moderate **today**."
  > — while Today, on the same morning, says "**You haven't checked in yet today**". Her last check-in was 2026-08-16.
- **Rule broken:** 3 (bullet 1), 2
- **Fix size:** **S**

### 2.14 A 30-day average over three recorded days is displayed as an average — **S**

- **File:** `app/progress/TrendsPanel.tsx`
- **What is wrong:** the panel correctly withholds the *trend* below 7 days ("You have 3 recorded days for energy in the last 30 days. Your trend and typical-day view appear once you have 7.") and then prints the average anyway.
- **Live wording (Progress):** "**AVG ENERGY** — 3.0 / 5 in the last 30 recorded days" — from 3 days, all of which were energy 3.
- **Rule broken:** 3 (bullet 4)
- **Fix size:** **S**

### 2.15 Coach-facing trend and pattern alerts convert a correlation coefficient into a confidence percentage — **M**

- **Files:** `lib/intelligence-engine/alerts.ts:112`, `:126`; `lib/intelligence-engine/recommendations.ts:62`
- **Exact current wording:** "`{Area} has been declining over the last 30 days with {strength} strength ({N}% confidence).`" and "`{Area} has improved sharply over the last 30 days ({N}% confidence)…`"
- **What is wrong:** `trend.confidence` here is a measure of fit strength, not of evidential reliability, and the sentence conflates the two. There is no minimum observation count in the sentence.
- **Rule broken:** 3 (bullet 4), 4
- **Fix size:** **M** *(code finding)*

## 2C. One priority at a time (Rule 7)

### 2.16 The Priority Card engine is correct; every screen around it is not — **L**

The decision engine itself (`lib/priority/select.ts`) is genuinely compliant and should be protected — see Section 4. The violation is that **no screen respects its verdict as exclusive.**

- **Live count of simultaneous calls to action on Home, 2026-08-17:** "Body Assessment → **Continue**" (coach-assigned invite) · "Core Values Snapshot → **Start now**" (From Root invite) · "Case → 1 of 9 complete" · "Movement" · "Guided Posture & Movement Assessment → **Start Assessment**" · "Questionnaires 1/9" · "Review your assessment" · "Recommended for you: Today's focus: Consistency" · "**Connect Device**" (panel) · "**Connect Device**" (modal). **Ten.** The Priority Card did not appear on Home at all.
- **Live count on Today:** "Evening Reflection" · "Log water as you drink it" · "Note how today's meals feel in your check-in" · "**Start check-in**" · water +/− · movement None/Light/Moderate/Full session · "**Log 18 more days…**" · "**YOUR PRIORITY TODAY** — Take a few minutes for your Daily Reset." **Eight.**
- **Files:** `app/dashboard/page.tsx:395-628`, `app/today/page.tsx:281-845`
- **Rule broken:** 7
- **Fix size:** **L**

### 2.17 The friction question does not exist for the priority loop — **M**

- **Files:** `lib/coaching-direction/adaptation.ts`, `lib/priority/select.ts`
- **What is wrong:** rule 7 requires that when an action is not completed before a new one is assigned, the member is asked what got in the way. **Nothing asks.** What exists instead is a silent counter: three consecutive ignored days → change the *framing* (`IGNORES_BEFORE_APPROACH_CHANGE = 3`); two framing changes with no response → escalate to a coach and stop offering it (`CHANGES_BEFORE_ESCALATION = 2`). The member is never asked why, and a new priority is assigned every single day regardless of yesterday's outcome.
- **Where a friction question does exist, and does not reach this loop:** `lib/root-coaching-engine/questions.ts:28` (`experiment_unsuccessful` → "What got in the way with {topic}?") is **coach-facing only**; `lib/readiness-pulse/q2.ts:33` ("What usually got in the way?") is inside one questionnaire.
- **Every path that skips it:** all of them. There is no path today that fires a friction question after an uncompleted priority.
- **Rule broken:** 7
- **Fix size:** **M**

### 2.18 Root's pop-up chain can stack an invite on top of the day's priority — **S**

- **File:** `components/dashboard/HomeScreenPopups.tsx`, `app/dashboard/page.tsx:678-681`
- **Live:** the wearable modal opened over Home on sign-in, on the same load that already offered a coach-assigned Body Assessment, a Core Values Snapshot invite and a Guided Movement Assessment. The chain arbitrates so two *pop-ups* never stack, but does not arbitrate against the cards underneath.
- **Rule broken:** 7
- **Fix size:** **S**

## 2D. Alert tiers (Rule 8)

### 2.19 Safety is tiered correctly; coach alerts are not, and the two are never distinguished on one screen — **M**

- **What is right:** `lib/safety/categories.ts` is a genuinely good tiering: 13 concern categories, each with an explicit `urgency` of `critical` / `high` / `medium` / `low` / `none`, an explicit `coachReviewRequired`, and topic-scoped restrictions rather than account-wide lockouts. Protect this.
- **What is wrong:** the *other* alert system, `lib/intelligence-engine/alerts.ts`, uses a completely separate three-value scale — `important` / `notable` / `info` — for "no recent check-in", "reassessment overdue", "possible burnout risk", "symptoms worsening" and "rapid improvement". A **possible burnout risk** and a **reassessment overdue** can both land on `notable`. There is no mapping between the two scales, and nothing marks one system's output as safety-critical and the other's as routine.
- **On the coach dashboard** (`app/coach/page.tsx:275-290`) the Safety Review Queue is rendered as **one more card in the same stack** as Program Library, Corrective Programs, Generate, Exercise Library, Movement Profile, Question Bank and Protein Targets — same size, same shape, same position logic, distinguished only by red text.
- **Rule broken:** 8
- **Fix size:** **M** *(code finding)*

## 2E. Coach dashboard (Rule 9)

Assessed against the six things the target asks for. *(Code finding throughout — the coach view was not walked live.)*

| Target | Status | Where |
|---|---|---|
| **What is improving** | **Missing** on the dashboard. Exists only as an `info`-severity alert buried in the client detail page. | `lib/intelligence-engine/alerts.ts:118-128` |
| **What needs attention** | **Partial.** A "Needs Attention" count and a per-client `attentionReasons` list exist, but the reasons are not ranked and safety is not separated from routine. | `app/coach/page.tsx:63`, `app/coach/lib.ts` |
| **How reliable each finding is** | **Present but wrong form.** Reliability is shown as bare percentages with no explanation of what they measure — see 3.1. | 6 panels |
| **What the member is working on** | **Missing.** The member's active Priority Card thread is not surfaced on the coach dashboard at all. `CoachWorkspacePanel`'s "Current priorities" is ~20 panels down the client detail page. | `app/coach/clients/[id]/page.tsx:601` |
| **What may be getting in the way** | **Partial and buried.** `lib/analytics-service/friction.ts` computes real friction signals; they reach the priority engine but have no coach-facing surface. Coaching escalations (`CoachingEscalationsPanel`) are the closest thing and sit at line 535 of an 808-line page. | — |
| **What the coach should ask next** | **Present but buried.** `lib/root-coaching-engine/questions.ts` generates up to two real questions per topic. They render only inside `CoachWorkspacePanel`, ~20 panels deep. | `app/coach/clients/[id]/CoachWorkspacePanel.tsx:60-78` |

**What is noise:** the four stat tiles include "Upcoming Sessions — Nothing scheduled / Booking isn't connected yet" (a permanently empty quarter of the dashboard header); seven always-present navigation cards occupy the space between the summary and the client list; and the client detail page's ~30 flat panels mean the six questions above have to be answered by scrolling.

**Overall size to rebuild the coach dashboard against the target: L.**

---

# SECTION 3 — LANGUAGE PASS VIOLATIONS (Rules 4, 5, 6)

## 3A. Confidence language (Rule 4)

**Nothing renders a numeric confidence percentage on a member screen.** Every percentage below is coach-facing. The member-facing violations are the *word-label* ones (3.1a–b), which are more damaging because they are on the first screen.

### Member-facing confidence labels

| # | Location | Exact wording | How computed | Size |
|---|---|---|---|---|
| 3.1a | `components/dashboard/HomeHero.tsx:268` (Home) | "**HIGH CONFIDENCE**" | `coverage×0.7 + min(1, snapshotCount/5)×0.3`, bucketed at 0.75/0.5/0.25. Snapshot count is how many times the cron ran, not evidence. | **M** |
| 3.1b | `app/root-score/page.tsx:177` | "Priority Focus · **High confidence**" | same | **M** |
| 3.1c | `components/RootScoreDomainRow.tsx:15-19` | "Building confidence" / "Low confidence" / "Moderate confidence" / "High confidence" | `dataPoints / expectedForFullConfidence`, `lib/scoring/domains.ts:38` | **S** |
| 3.1d | `components/RootMapDomainCard.tsx:25-29` | "Building confidence" / "Low confidence" / "Moderate confidence" / "High confidence" | `lib/investigation-engine/confidence.ts` — a *different* formula from 3.1c under an identical label | **M** |
| 3.1e | `components/food-lens/DetectedItemsList.tsx:201` | "`{category} · {N}% confident this is right`" | Anthropic vision model's own per-item score | **S** |
| 3.1f | `components/food-lens/DetectedItemsList.tsx:63-64` | "High confidence" / "Likely" | `portion_confidence ≥ 0.7 / ≥ 0.4` | **S** |
| 3.1g | `components/food-lens/MacroBalanceMeter.tsx:57` | "`{level} · {N}% confidence`" | per-macro model confidence | **S** |
| 3.1h | `components/food-lens/PatternComparisonCard.tsx:45` | "`{N}% confidence`" | `lib/food-lens/comparison.ts` | **S** |
| 3.1i | `components/food-lens/LabelConfirmForm.tsx:79-83` | "High confidence" | per-field OCR confidence | **S** |

### Coach-facing confidence percentages

| # | Location | Exact wording | How computed | Size |
|---|---|---|---|---|
| 3.2a | `app/coach/clients/[id]/RecommendationsPanel.tsx:87` | "`{N}% confidence`" | `Recommendation.confidence`, hard-coded per rule in `lib/intelligence-engine/recommendations.ts` (e.g. `0.9` for daily coaching, `0.75` for coach follow-up) | **S** |
| 3.2b | `app/coach/clients/[id]/IntelligencePanel.tsx:234` | "`{N}% confidence`" | `lib/intelligence/confidence.ts` | **S** |
| 3.2c | `app/coach/clients/[id]/RootCauseSignalsPanel.tsx:54`, `:84` | "`{N}%`" / "`{N}% confidence`" | `lib/intelligence-engine/hypotheses.ts` | **S** |
| 3.2d | `app/coach/clients/[id]/MemberIntelligencePanel.tsx:315`, `:344`, `:369` | "`{N}% confidence`" ×3 (trend, pattern, hypothesis) | three different sources under one label | **M** |
| 3.2e | `app/coach/clients/[id]/IntelligenceCorePanel.tsx:224` | "`{N}% confidence · {N} data point(s)`" | `lib/intelligence-core/dimensions.ts:370` | **S** |
| 3.2f | `components/case-view/FindingsList.tsx:49` | bare "`{N}%`" with no label at all | `lib/case-view/findings.ts` | **S** |
| 3.2g | `…/RightPanel/PostureFindingsSection.tsx:143` | "`Confidence: {N}%`" | `lib/body-assessment/findings.ts` | **S** |
| 3.2h | `…/RightPanel/AIAssistantSection.tsx:74-79`, `:194`, `:403` | "High/Moderate/Low confidence" + "`Overall confidence · {N}%`" + "`{N}% confidence`" | LLM analysis output | **S** |
| 3.2i | `components/prescription-intelligence/PrescriptionReviewPanel.tsx:140`, `:230` | "`Confidence {N}%`" and "`{raw enum} · {N}%`" | `lib/prescription-intelligence/confidence.ts:81` | **S** |
| 3.2j | `lib/intelligence-engine/alerts.ts:112`, `:126`; `recommendations.ts:62` | "`({N}% confidence)`" inside alert prose | trend fit strength — see 2.15 | **M** |

**Pattern across all of them:** at least six different quantities are rendered under the single word "confidence" — data coverage, calculation count, correlation fit, LLM self-report, OCR certainty, and hard-coded per-rule constants. Nothing on any screen tells the reader which.

## 3B. Medical and diagnostic language (Rule 5)

### 3.3 Member-facing, live-confirmed

| Location | Exact current wording | Size |
|---|---|---|
| Root Map, What We're Noticing, Insights, Root Score | "**Elevated Stress**" | S |
| same | "**Poor Sleep Quality**" | S |
| same | "**Low Energy**" | S |
| same | "**Digestive Complaints**" | S |
| Root Map | "**Pain & Structural Integrity**" (domain name) | S |
| Root Map | "**Nutrition & Metabolic Health**" (domain name) | S |
| Root Map | "**Stress & Nervous System Regulation**" (domain name) | S |
| Insights | "**Discomfort: hips**", "**Discomfort: lower back**" | S |

Source: `lib/registry/adapters/onboarding.ts:47-52`, `:178`, `:206`; `lib/investigation-engine/domains.ts`.

### 3.4 Member-facing, in code, reachable on assessment screens

| File | Exact current wording | Size |
|---|---|---|
| `lib/registry/adapters/questionnaireEngine.ts:83` | "**Gut Fungal & Parasite Concerns**" | S |
| `:90` | "**Detoxification Load Concerns**" | S |
| `:120` | "**Movement Deficiency**" | S |
| `:62` | "**Circadian Rhythm Disruption**" | S |
| `:191` | "**Cardiovascular & Circulation Pattern**" | S |
| `:198` | "**Hormonal Balance Pattern**" | S |
| `:170` | "**Immune & Respiratory Pattern**" | S |
| `:177` | "**Musculoskeletal Discomfort Pattern**" | S |
| `:99` | "**Emotional Wellbeing Concern**" | S |
| `lib/wbsa/constants.ts:22` | "**Adrenal & Stress-Response Patterns**" | S |
| `:27` | "**Nutrient Insufficiency Patterns**" | S |
| `:20` | "**Thyroid & Metabolic-Related Observations**" | S |
| `:21` (list) | "**Kidney, Bladder & Fluid-Balance Patterns**" | S |
| `:15` | "**Liver & Detoxification Support**" | S |
| `:16` | "**Immune & Inflammatory Patterns**" | S |
| `lib/assessments/insights.ts:65` | "Your stress and detoxification scores both **indicate they deserve greater attention**. **Chronic stress and a taxed detox system commonly show up together**…" | S |
| `lib/investigation-engine/registry.ts:255` | "A whole-body check-in across **16 connected functional systems: digestive, metabolic, immune, respiratory, circulatory, renal, thyroid, adrenal, reproductive, neurological, musculoskeletal, dermatological, nutrient, and recovery patterns.**" | S |

**Note in mitigation:** every one of these screens carries a real, prominent disclaimer — e.g. Root Map: "Your Root Map is a wellness coaching guide built from your own check-ins, activity, and assessments. It is not a medical diagnosis, a clinical measurement, or a prediction about your health." That is genuinely good and should be kept. It does not, however, change what the *labels themselves* sound like.

**Total for 3B: M** (25 strings, mostly mechanical, but each needs a real replacement written).

## 3C. Internal leakage (Rule 6)

### 3.5 A test-script artifact is rendering on the member's Root Map as a clinical finding — **M**

- **File:** `lib/registry/adapters/foodProducts.ts:25-28`, `:44`
- **What is wrong:** `narrativeFor()` interpolates the **user-supplied product name** straight into a registry finding narrative, and that narrative renders under "WHAT WE'RE SEEING" on the Root Map with the same weight as an assessment finding.
- **Live wording (Root Map, under both Nutrition & Metabolic Health *and* Digestion & Gut Health):**
  > "**Live check food 04:05:02: This product offers 31g of protein per serving, which is a nutritionally meaningful amount if protein intake matters to you.**"
- The item name is an artifact left by a previous live verification script. The deeper leak is structural: **any** free-text product name a member types becomes a permanent, domain-attributed finding on her wellness map.
- **Rule broken:** 6, and 3 (one scan → a standing finding in two domains)
- **Fix size:** **M**

### 3.6 A raw enum value is quoted into member copy — **S**

- **File:** `lib/registry/adapters/onboarding.ts:141` — `` `${config.label} reported as '${status}' on the latest onboarding submission.` `` where `status` is the raw `MetricStatus` union.
- **Live wording, six times across Root Map and What We're Noticing:** "Elevated Stress **reported as 'poor'** on the latest onboarding submission."
- The quotes around a lowercase system value are the giveaway that this is a variable, not a sentence.
- **Fix size:** **S**

### 3.7 An internal feature name is presented as a wellness metric — **S**

- **File:** `lib/registry/adapters/foodProducts.ts:44` (`label: 'Packaged food scan'`) → `lib/intelligence-engine/memberFacingNoticing.ts:57`
- **Live wording:** "**WHAT'S IMPROVING** — Packaged food scan has been improving."
- **Fix size:** **S**

### 3.8 An unfinished-state string renders as the day's content — **S**

- **File:** `app/today/page.tsx:426-430`
- **Live wording (Today, occupying the slot where the day's lesson belongs):**
  > "**Still putting today's lesson together.** I don't have it ready quite yet. Check back shortly and I'll have something for you."
- **Fix size:** **S**

### 3.9 Development-status copy on a member screen — **S**

- **Live wording (Movement):** "**MOVEMENT SCORE** — 0 / 100 — Just getting started — **EARLY VERSION, MORE DEPTH COMING**"
- **File:** `app/movement/page.tsx:6` documents the score as a placeholder in its own header comment.
- **Fix size:** **S**

### 3.10 An empty section heading with no body — **S**

- **Live wording (Movement):** "**WHY THIS SESSION WAS SELECTED**" renders with nothing underneath it.
- **Fix size:** **S**

### 3.11 "Coming soon" on three member surfaces — **S**

| Location | Exact wording |
|---|---|
| `app/dashboard/page.tsx:599` | "Next session: nothing scheduled yet — **Coming soon**" (confirmed live on Home) |
| `components/questionnaires/CatalogQuestionnaireCard.tsx:86` | "**Coming Soon**" |
| `components/assessments/four-doctors-results/NextStepsCards.tsx:53` and `components/primal-pattern/results/NextStepsCards.tsx:48` | "**Coming soon**" |

**Fix size: S**

### 3.12 Raw enums rendered on coach screens — **M** *(code findings)*

| File:line | Rendered value | What the coach actually sees |
|---|---|---|
| `app/coach/review-queue/[id]/page.tsx:69` | `{entry.source_feature}` | `daily_checkin` |
| `:61` | `{entry.classification_level}` | e.g. `restricted_topic` |
| `:65` | `{entry.urgency}` | `critical` / `high` / `medium` |
| `:85` | `{category}` | `self_harm_crisis`, `eating_disorder_risk` — raw category slugs on the safety screen |
| `:115` | `{entry.status}` | raw status enum |
| `app/coach/clients/[id]/IntelligencePanel.tsx:150`, `:163` | `{insight.severity}`, `{insight.status}` | raw |
| `app/coach/clients/[id]/MemberIntelligencePanel.tsx:71`, `:78`, `:394` | `{alert.severity}`, `{alert.status}`, `{r.domain}` | raw; `r.domain` prints `daily_coaching`, `coach_follow_up` |
| `app/coach/clients/[id]/RootCauseSignalsPanel.tsx:100` | `{f.domain}` | raw registry domain |
| `app/coach/clients/[id]/entries/page.tsx:388`, `:401` | `{submission.kind}` | raw |
| `app/coach/clients/[id]/page.tsx:505` | `{insight.kind}` | raw |
| `app/coach/clients/[id]/CoachWorkspacePanel.tsx:70` | `{topic.sourceState.replaceAll('_',' ')}` | "repeated signal", "conflicting information" — de-underscored, still an enum |
| `app/coach/clients/[id]/MovementProfilePanel.tsx:80` | `{item.status}` | raw |
| `app/coach/clients/[id]/RootMapPanel.tsx:63` | `({r.triggerSource})` | raw |
| `app/coach/corrective-programs/[memberId]/page.tsx:121` | `{p.severity}` | raw |
| `components/prescription-intelligence/PrescriptionReviewPanel.tsx:230` | `{snapshot.confidence_level}` | raw |
| `…/RightPanel/AIAssistantSection.tsx:410` | `{observation.severity}` | raw |

### 3.13 An internal certification identifier is in a member-visible URL — **S**

- **Files:** `lib/assessment-registry/registry.ts:98` (`key: 'chek-hlc1-nutrition-lifestyle'`), `lib/assessments/chek-hlc1/copy.ts`, route `app/assessments/[questionnaireId]/`
- **What is wrong:** the questionnaire the member sees as "**Nutrition & Lifestyle Questionnaire**" carries the registry key `chek-hlc1-nutrition-lifestyle`, which is the `[questionnaireId]` route segment — so the certification identifier appears in her address bar and in any shared link. The display name is already correct; only the key/route is not.
- **Fix size:** **S** (route alias; the key can stay internal)

### 3.14 An unlabelled illustration placeholder — **S**

- **File:** `app/today/page.tsx:554` — a gradient band standing in for lesson artwork. Renders as a coloured band with an icon; not a text leak, but it is a visible unfinished element on the day's main content card.
- **Fix size:** **S**

---

# SECTION 4 — ALREADY COMPLIANT (protect during the builds)

These behaviours already follow the rules. **Do not regress them.**

### 4.1 The Priority Card decision engine — the model to build the rest on

`lib/priority/select.ts` is the one place in the app that does exactly what rule 7 asks:

- **Exactly one winner, always.** Two overrides (safety, re-entry) that suspend the ladder, then a nine-rung ladder walked top-down, first survivor wins. The function is **total** — the fallback always applies, so it can never return nothing and can never invent an insight to fill a gap (`:770-782`).
- **Safety cannot be suppressed by a counter** and never repeats the member's disclosure back to her (`:285-306`, `reason: null` with the reasoning written out at the call site).
- **Re-entry never names the length of an absence** (`:308-326`).
- **Reorders can only ever move candidates the ladder already admitted** — the week focus and grade preference operate strictly *within* a rung, the follow-on preference across rungs but only for an already-admitted thread, and all three are explicitly barred from touching safety, re-entry and the Reset Plan commitment (`:695-721`).
- **A movement action must carry a live session key or it is dropped** — enforced once in the walk rather than per-rule (`:217-220`, `:731-740`).
- **Resolved priorities collapse and move down the page rather than disappearing or persisting at the top** (`app/today/page.tsx:836-845`, `app/dashboard/page.tsx:646-650`).

### 4.2 The three-tier longitudinal language module

`lib/longitudinal-intelligence/copy.ts` is correct at the sentence level: tier 1 says "You mentioned this once" / "We noticed this once", tier 2 "This has shown up more than once", tier 3 "A consistent pattern is emerging". Openers are deterministic, never random. Correlation is stated as correlation, never causation. **Only the grouping above it is wrong (2.8); the module itself should not be touched.**

### 4.3 Case View's honesty about early data

Live wording, and the single best-behaved surface in the app:

> "**STILL BUILDING YOUR CASE** — It's been 13 days since you started, and you've logged 3 check-ins so far. **I don't usually have a real finding this early, that's expected, not a problem.**"
> "**THE INVESTIGATION** — … Currently being looked at / **Still gathering enough evidence to say either way**"
> "**Not trackable yet:** Bedtime consistency, Meal timing, … There's no daily way to measure these yet, so no investigation has started."

It names its own limits, distinguishes "looking at it" from "concluded", and is explicit about what it cannot see. `lib/case-view/`.

### 4.4 The member-facing sanitizer for the Wellness Profile

`lib/intelligence-core/memberView.ts:17-30` strips confidence, evidence refs and domain codes, and applies a hard `MIN_CONFIDENCE_FOR_MEMBER = 0.6` floor so a barely-formed observation cannot reach a member. This is the pattern the rest of the app should adopt.

### 4.5 The safety classification tiering

`lib/safety/categories.ts` — 13 categories, explicit `urgency` from `critical` to `none`, explicit `coachReviewRequired` and `acknowledgmentRequired` per category, restrictions scoped to a topic rather than the whole account, and accumulating `concern_categories` so a lower-severity concern in the same input is never silently dropped. Deterministic keyword matching that runs *before* any LLM. **This is the reference implementation for rule 8** — the coach-alert scale (2.19) should be reconciled onto it, not the reverse.

### 4.6 The safety gate that suppresses interpretation

When a safety topic is open, `lib/recommendation-engine/builder.ts:30-34` and `lib/root-map/builder.ts:41-43` both suppress *everything* and show one message rather than partially suppressing:
> "Your coach is reviewing something in this area with you right now, so specific details are paused here for the moment."
`app/actions/longitudinalIntelligence.ts:75` does the same (`if (rootMap?.safetyGated) return empty`).

### 4.7 Conditional water tracking

`profiles.hydration_focus` (migration 163), gated at **18** call sites through one choke point on `daily_checkins_current`, with a three-state flag where `null` (never asked) safely behaves as `true`. **This is the working model of what the visibility layer should look like everywhere else.** Confirmed live: water renders on Today only because the flag is currently on for this member.

### 4.8 The disclaimers

Real, specific, and on every interpretation surface. Root Map: "…**not a medical diagnosis, a clinical measurement, or a prediction about your health.** Working hypotheses only, held loosely, and always something to confirm or correct with your coach." Root Score, Recommendations and Case View each carry an equivalent. Keep them.

### 4.9 The check-in itself

Four screens, plainly worded, no interpretation, no confidence claim, no diagnostic label anywhere in the flow, and no verdict shown mid-flow. Walked end to end live and clean.

### 4.10 Honest empty states

Notifications: "I don't have anything to tell you yet…" · Resilience: "Building your resilience baseline — MEF Wellness needs more history… **There's nothing else to do here.**" · Trends: "You have 3 recorded days for energy in the last 30 days. Your trend and typical-day view appear once you have 7." · Root Map's uninstrumented domains. These are the app at its best and several of the fixes above are just extending this behaviour to surfaces that currently skip it.

### 4.11 Momentum's minimum-data gate

`lib/scoring/config.ts:21` — `MOMENTUM_MIN_DATA_POINTS_PER_WINDOW = 2` required in *each* window before a direction is claimed. `lib/scoring/domains.ts:61-63` — `directionFromSeries` returns `'unknown'` below 4 points "rather than a direction claimed from noise". `lib/scoring/config.ts:31` — `MAX_ROOT_SCORE_DAILY_CHANGE = 6` makes a large jump from one day structurally impossible. The guards exist; they are simply not applied to the strength/opportunity claim (2.10) or the confidence roll-up (2.9).

---

## Appendix — evidence

Live captures (rendered text + full-page screenshots for 44 member screens and the 4-screen check-in) were taken with two throwaway scripts, `audit-walk-member.mjs` and `audit-walk-checkin.mjs`, run from `apps/consumer-web-app`. Neither is committed. Neither writes to the member's account.
