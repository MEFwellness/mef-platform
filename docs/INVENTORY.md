# MEF Platform — Codebase Inventory

Factual inventory of the repository as of the current state of the working tree (branch `main`). No quality judgments are made. Anything not fully enumerated is explicitly marked.

Repo layout: an npm workspaces monorepo (`apps/*`, `services/*`, `packages/*`) with a single active application, `apps/consumer-web-app` (Next.js App Router). All paths below are relative to `apps/consumer-web-app/` unless prefixed otherwise.

- `apps/consumer-web-app/` — the Next.js app (all pages, API routes, server actions, `lib/`, `components/`)
- `packages/shared-types-contracts/src/` — 26 shared `.types.ts` files + `database.types.ts`, `index.ts` (types only, no runtime logic)
- `packages/mef-method-repository/` — `README.md` + empty `content/.gitkeep` only, no source
- `services/knowledge-engine-api/`, `services/pattern-prioritization-engine/` — each contains only `README.md` + `package.json`, no source files found
- `supabase/` — 101 migrations, seed SQL, no `functions/` (Edge Functions) directory found
- `docs/` — pre-existing docs (Food Lens architecture series, Rooted Reset Method content, CHEK HLC1 and Four Doctors specs); a root-level `ASSESSMENT_INVENTORY.md` also exists and was not used as a source for this document

---

## 1. Pages / Routes (`app/**/page.tsx`)

Grouped by top-level route segment. `[param]` denotes a dynamic segment.

### Root / auth
- `app/page.tsx` — `/` (pure server-side redirect hub, no UI)
- `app/(auth)/login/page.tsx` — `/login`
- `app/(auth)/signup/page.tsx` — `/signup`
- `app/(auth)/verify/page.tsx` — `/verify`
- `app/(auth)/reset-password/page.tsx` — `/reset-password`
- `app/(auth)/reset-password/confirm/page.tsx` — `/reset-password/confirm`
- `app/name/page.tsx` — `/name`
- `app/welcome/page.tsx` — `/welcome`
- `app/onboarding/page.tsx` — `/onboarding`
- `app/error.tsx`, `app/not-found.tsx` — global error/404
- `app/layout.tsx`, `app/manifest.ts` — root layout, PWA manifest

### Core member surfaces
- `app/dashboard/page.tsx` — `/dashboard`
- `app/today/page.tsx` — `/today`
- `app/profile/page.tsx` — `/profile`
- `app/profile/baseline/page.tsx` — `/profile/baseline`
- `app/profile/reassessments/page.tsx` — `/profile/reassessments`
- `app/profile/reassessments/new/page.tsx` — `/profile/reassessments/new`
- `app/profile/reassessments/[id]/page.tsx` — `/profile/reassessments/[id]`
- `app/about/page.tsx`, `app/help/page.tsx`, `app/membership/page.tsx`, `app/notifications/page.tsx`, `app/connections/page.tsx`, `app/insights/page.tsx`, `app/recommendations/page.tsx`, `app/conversation/page.tsx`, `app/wellness-check/page.tsx`, `app/root-map/page.tsx`, `app/root-score/page.tsx`, `app/progress/page.tsx`, `app/progress/timeline/page.tsx`

### Check-in
- `app/checkin/page.tsx` — `/checkin`
- `app/checkin/evening/page.tsx` — `/checkin/evening`

### Body Assessment (singular `/assessment`)
- `app/assessment/page.tsx` — `/assessment`
- `app/assessment/new/page.tsx` — `/assessment/new`
- `app/assessment/[id]/page.tsx` — `/assessment/[id]`

### Questionnaires / Assessments (plural `/assessments`)
- `app/questionnaires/page.tsx` — `/questionnaires`
- `app/assessments/[questionnaireId]/page.tsx` — `/assessments/[questionnaireId]` (generic engine overview)
- `app/assessments/[questionnaireId]/take/page.tsx` — `/assessments/[questionnaireId]/take`
- `app/assessments/[questionnaireId]/history/page.tsx` — `/assessments/[questionnaireId]/history`
- `app/assessments/[questionnaireId]/results/[assessmentId]/page.tsx`
- `app/assessments/[questionnaireId]/results/[assessmentId]/category/[categoryId]/page.tsx`
- `app/assessments/four-doctors/results/[assessmentId]/page.tsx` — dedicated Four Doctors results page (separate from the generic `[questionnaireId]/results` route above)
- `app/assessments/primal-pattern-diet-type/page.tsx`
- `app/assessments/primal-pattern-diet-type/take/page.tsx`
- `app/assessments/primal-pattern-diet-type/results/[assessmentId]/page.tsx`
- `app/assessments/wbsa/page.tsx`
- `app/assessments/wbsa/take/page.tsx`
- `app/assessments/wbsa/results/[sessionId]/page.tsx`

### Movement / Exercises
- `app/movement/page.tsx`, `app/movement/profile/page.tsx`, `app/movement/session/page.tsx`
- `app/exercises/page.tsx`, `app/exercises/[id]/page.tsx`
- `app/programs/page.tsx`, `app/programs/[id]/page.tsx`

### Food Lens
- `app/food-lens/page.tsx`, `.../[id]/page.tsx`, `.../new/page.tsx`, `.../log/page.tsx`, `.../search/page.tsx`, `.../pantry/page.tsx`, `.../pattern/page.tsx`, `.../preferences/page.tsx`, `.../report/page.tsx`
- `app/food-lens/barcode/[id]/page.tsx`, `app/food-lens/barcode/new/page.tsx`
- `app/food-lens/label/[id]/page.tsx`, `app/food-lens/label/new/page.tsx`
- `app/food-lens/manual/new/page.tsx`
- `app/food-lens/restaurant/[id]/page.tsx`, `app/food-lens/restaurant/new/page.tsx`

### Coach
- `app/coach/page.tsx`
- `app/coach/clients/[id]/page.tsx`
- `app/coach/clients/[id]/assessments/[submissionId]/page.tsx`
- `app/coach/clients/[id]/body-assessments/[assessmentId]/page.tsx`
- `app/coach/clients/[id]/body-assessments/[assessmentId]/report/page.tsx`
- `app/coach/clients/[id]/prescription/page.tsx`
- `app/coach/clients/[id]/programs/page.tsx`
- `app/coach/clients/[id]/programs/assign/page.tsx`
- `app/coach/clients/[id]/programs/workouts/[workoutId]/page.tsx` (no `.../workouts/page.tsx` index was found)
- `app/coach/clients/[id]/wbsa/[sessionId]/page.tsx`
- `app/coach/programs/page.tsx`, `app/coach/programs/[id]/page.tsx`, `app/coach/programs/new/page.tsx`
- `app/coach/review-queue/page.tsx`, `app/coach/review-queue/[id]/page.tsx`

### Admin
- `app/admin/page.tsx` — `/admin`

---

## 2. API Routes (`app/api/**/route.ts`)

Only 6 route handlers exist; nearly all mutation/read logic instead goes through Server Actions (section below).

- `app/api/auth/callback/route.ts`
- `app/api/cron/daily-coaching-scan/route.ts`
- `app/api/cron/wearable-daily/route.ts`
- `app/api/exercises/route.ts`
- `app/api/speech/route.ts`
- `app/api/v1/nutrition-intelligence/route.ts`

No `supabase/functions/` directory exists — no Supabase Edge Functions found.

## 3. Server Actions (`app/actions/*.ts`, all marked `'use server'`)

51 files:

`admin.ts`, `assessmentAssignments.ts`, `assessments.ts`, `auth.ts`, `body-assessment.ts`, `checkin.ts`, `coach-intelligence.ts`, `coach-programs.ts`, `coach.ts`, `coaching-brain.ts`, `coaching-engine.ts`, `coaching-insights.ts`, `consent.ts`, `conversation-coach.ts`, `eveningReflection.ts`, `events.ts`, `exercise-library.ts`, `feed.ts`, `food-insights.ts`, `food-label.ts`, `food-lens.ts`, `food-manual.ts`, `food-products.ts`, `food-search.ts`, `guest-preview.ts`, `health-profile.ts`, `intelligence-core.ts`, `intelligence-engine.ts`, `lifestyleExperiments.ts`, `longitudinalIntelligence.ts`, `memberNoticing.ts`, `movement-profile.ts`, `movement.ts`, `narrative.ts`, `notifications.ts`, `nutrition-reports.ts`, `onboarding.ts`, `pantry.ts`, `prescription-intelligence.ts`, `primal-pattern.ts`, `profile.ts`, `questionnaireCatalog.ts`, `recommendations.ts`, `restaurant.ts`, `rootCauseSignals.ts`, `rootCoaching.ts`, `rootMap.ts`, `safety.ts`, `scoring.ts`, `wbsa.ts`, `wearables.ts`, `welcome.ts`, `wellness-intelligence.ts`

Three additional files outside `app/actions/` also carry `'use server'`: `app/coach/lib.ts`, `lib/guest-preview/mergeCheckin.ts`, `lib/time/localDate.ts`. (Three test files also match the `'use server'` grep but are test fixtures, not action code: `tests/health-profile-orchestration-integration.test.ts`, `tests/welcome.test.ts`, `tests/wellness-events.test.ts`.)

---

## 4. Supabase Tables

101 migrations (`00000000000001` – `00000000000101`) define **117 tables** and **1 view**, enumerated below by `CREATE TABLE` statements found in `supabase/migrations/*.sql`. Grouped by apparent subsystem based on naming/migration-file adjacency (grouping is descriptive only, not an authoritative schema map — some tables may be referenced/extended by later migrations not reflected in this grouping).

**Identity / access**
`organizations`, `profiles`, `roles`, `user_roles`, `consent_records`, `coach_client_assignments`, `membership_tiers`

**Onboarding (legacy fixed + adaptive engine)**
`onboarding_assessment_versions`, `onboarding_questions`, `onboarding_submissions`, `onboarding_answers`, `onboarding_baselines`

**Daily check-in / habits**
`daily_checkins`, `habits`, `habit_logs`, `evening_reflections`

**Coach notes / safety**
`coach_notes`, `safety_classifications`, `safety_message_templates`, `safety_review_queue`, `safety_acknowledgments`, `safety_audit_log`

**AI infrastructure**
`ai_agents`, `ai_actions`, `ai_events`, `ai_history`, `ai_insights`, `ai_logs`, `ai_prompt_templates`, `ai_recommendations`, `ai_rules`

**Narrative / content / feed**
`narrative_items`, `mef_content_items`, `daily_feed_items`, `daily_feed_events`

**Wellness intelligence**
`wellness_insights`, `wellness_coaching_style_profile`, `wellness_identity_observations`, `wellness_profile_dimensions`, `wellness_recommendation_feedback`

**Conversation coach**
`conversation_sessions`, `conversation_messages`, `conversation_memory`, `conversation_handoffs`

**Intelligence core / registry**
`intelligence_profile_snapshots`, `intelligence_coach_alerts`, `registry_entries`

**Body Assessment**
`body_assessments`, `body_assessment_captures`, `body_landmark_sets`, `body_assessment_findings`, `body_assessment_annotations`, `body_assessment_notes`, `body_assessment_coach_reviews`, `body_assessment_comparisons`

**Coach Intelligence workspace**
(shares `intelligence_*` and `coach_*` tables above; no distinct additional tables found beyond those listed)

**Universal health registry / member health profile / timeline**
`member_health_profiles`, `health_timeline_events`

**Wearables**
`wearable_connections`, `wearable_daily_metrics`

**Morning brief / proactive coaching**
`coach_morning_briefs`

**Food Lens ecosystem**
`food_lens_scans`, `food_lens_captures`, `food_lens_detected_items`, `food_lens_corrections`, `food_lens_macro_estimates`, `food_lens_meal_quality_ratings`, `food_lens_barcode_scans`, `food_lens_label_scans`, `food_lens_label_field_corrections`, `food_lens_pattern_comparisons`, `food_analysis_results`, `food_products`, `product_nutrients`, `product_ingredients`, `product_allergens`, `member_food_favorites`, `member_food_log`, `member_food_preferences`, `pantry_items`, `saved_meals`, `saved_meal_items`, `restaurant_meal_entries`, `weekly_nutrition_reports`, `nutrition_rule_thresholds`, `member_nutrition_safety_flags`

**Movement / exercise library**
`movement_sessions`, `movement_session_exercises`, `movement_programs`, `movement_program_versions`, `mef_exercise_metadata`, `member_exercise_favorites`, `member_exercise_recent_views`, `member_exercise_completions`, `member_movement_profiles`, `movement_profile_review_items`

**Root Score / Root Map**
`root_score_snapshots`

**Generic "wellness_assessments" engine (CHEK HLC1 / Four Doctors / Short-HAQ)**
`wellness_assessments`, `wellness_assessment_answers`, `wellness_assessment_category_scores`

**Primal Pattern (bespoke tables)**
`primal_pattern_assessments`, `primal_pattern_assessment_answers`, `primal_pattern_profiles`

**Assessment registry / catalog (cross-cutting)**
`assessment_definitions`, `assessment_definition_versions`, `assessment_attempts`, `assessment_assignments`
View: `assessment_status_by_member`

**Program enrollment / reassessment scheduling**
`program_enrollments`, `programs`, `program_phases`, `reassessment_schedules`, `reassessment_schedule_configs`

**Coaching insights / member recommendations / pattern states**
`coaching_insights`, `member_recommendations`, `member_recommendation_events`, `member_pattern_states`, `lifestyle_experiments`

**Investigation router**
`investigation_router_decisions`

**Coach program builder / prescription**
`coach_program_templates`, `coach_program_template_sections`, `coach_program_template_exercises`, `coach_assigned_workouts`, `coach_assigned_workout_sections`, `coach_assigned_workout_exercises`, `coach_program_assignments`, `prescription_blocks`, `prescription_block_exercises`, `prescription_constraints`, `prescription_snapshots`, `assessment_report_exercises`

**Member coaching messages**
`member_coaching_messages`

**Unified Adaptive Assessment Foundation / Runtime (WBSA)**
`unified_assessment_definitions`, `unified_assessment_sections`, `unified_assessment_questions`, `unified_assessment_sessions`, `unified_assessment_answers`

Migrations `00000000000093`–`00000000000097` add `member_pattern_states`, `member_recommendation_events`, extend `onboarding_questions` with adaptive-engine columns (`question_pool`, `concern`, `weight`, `requires`, `boosts`, `helper_text`), and extend other existing tables/constraints — no full list of every `ALTER TABLE` was enumerated; only `CREATE TABLE`/`CREATE VIEW` statements are captured above. Migrations 88, 100, 101 also perform `UPDATE`/`ALTER`/`INSERT` operations against existing tables (documented inline in each file) rather than creating new tables.

---

## 5. Questionnaire / Assessment Definitions and Registration

Two separate registries exist (see Overlaps §1 below):

### 5a. `lib/assessment-registry/registry.ts` — cross-cutting catalog (membership gating, routes, comparison support, etc.) for **every** assessment system. Mirrored by the `assessment_definitions` DB table (`supabase/migrations/00000000000070_assessment_registry_catalog.sql`).

| key | displayName | status | route | content source |
|---|---|---|---|---|
| `onboarding-health-history` | Onboarding Assessment | live | `/onboarding` | `onboarding_questions` table + `lib/onboarding/*` |
| `chek-hlc1-nutrition-lifestyle` | Nutrition & Lifestyle Questionnaire | live | `/assessments/nutrition-lifestyle` | `lib/assessments/chek-hlc1/questionnaire.json` |
| `four-doctors` | Four Doctors Assessment | live | `/assessments/four-doctors` | `lib/assessments/four-doctors/questionnaire.json` |
| `primal-pattern-diet-type` | Primal Pattern Diet Type | live | `/assessments/primal-pattern-diet-type` | `lib/primal-pattern/questionnaire.ts` |
| `body-assessment` | Body Assessment | live | `/assessment` | `lib/body-assessment/assessmentTypes.ts` |
| `short-haq` | Short Health Assessment Questionnaire | live | `/assessments/short-haq` | `lib/assessments/short-haq/questionnaire.json` |
| `wbsa` | Whole-Body Systems Assessment | live | `/assessments/wbsa` | DB rows inserted by `supabase/migrations/00000000000101_wbsa_content.sql` (`unified_assessment_*` tables) |
| `readiness-to-change` | Readiness to Change | coming_soon (no content/route) | n/a | none |
| `finding-1-love` | Finding 1 Love | coming_soon (no content/route) | n/a | none |

### 5b. `lib/assessments/registry.ts` — a second, narrower registry ("Reusable Assessment Engine") covering only the 3 questionnaires that share the generic points-scored engine:

- `CHEK_HLC1_QUESTIONNAIRE` (`lib/assessments/chek-hlc1/index.ts` + `questionnaire.json` + `copy.ts`)
- `FOUR_DOCTORS_QUESTIONNAIRE` (`lib/assessments/four-doctors/index.ts` + `questionnaire.json` + `copy.ts`)
- `SHORT_HAQ_QUESTIONNAIRE` (`lib/assessments/short-haq/index.ts` + `questionnaire.json` + `copy.ts`)

Served generically through `app/assessments/[questionnaireId]/*` and `lib/assessments/store.ts`.

### Other questionnaire/assessment content locations
- **Onboarding**: legacy fixed 12 questions + 9 concern banks (`lib/onboarding/concernBanks/{pain,performance,sleep,energy,stress,weight,digestion,generalOptimization,healthyAging}.ts` — described in code as "seed-authoring input," not runtime-imported) seeded into `onboarding_questions`.
- **Primal Pattern**: `lib/primal-pattern/questionnaire.ts`, `lib/primal-pattern/scoring.ts`, stored via `primal_pattern_assessments`/`primal_pattern_assessment_answers`.
- **Body Assessment**: `lib/body-assessment/assessmentTypes.ts` defines capture types; not a Q&A questionnaire (media capture + coach review).
- **WBSA**: content is SQL-seeded (16 sections) in `supabase/migrations/00000000000101_wbsa_content.sql`, not a JSON file; supporting code in `lib/wbsa/*`, `lib/assessment-runtime/*`, `lib/assessment-foundation/*`.
- **Documentation copies** (separate from runtime source of truth): `docs/assessments/chek-hlc1-nutrition-lifestyle/SPEC.md` + `questionnaire.json`, `docs/assessments/four-doctors/SPEC.md`.

---

## 6. Major Component Directories (`components/`)

| Directory | Files |
|---|---|
| `components/` (root, flat files) | 25 files — `BottomNav.tsx`, `AvatarLink.tsx`, `FloatingCoachLauncher.tsx`/`FloatingCoachPanel.tsx`, `RootMapCard.tsx`/`RootMapDomainCard.tsx`, `RootScoreCard.tsx`/`RootScoreDomainRow.tsx`/`RootScoreTrendChart.tsx`, `AssessmentComparisonView.tsx`, `AssessmentHistoryList.tsx`, `BaselineAssessmentView.tsx`, `ComprehensiveAssessmentCard.tsx`, `MovementAssessmentCard.tsx`, `MorningBriefCard.tsx`, `DashboardQuickLinks.tsx`, etc. |
| `components/assessments/` | 10 files (`AssessmentTaker.tsx`, `AssessmentProgressBar.tsx`, `AssessmentComparisonPanel.tsx`, `CategoryCard.tsx`, `CategoryRadarChart.tsx`, `CategoryScoreTrendChart.tsx`, `ContextQuestionCard.tsx`, `PriorityBadge.tsx`, `QuestionCard.tsx`, `ScoreRing.tsx`) + `four-doctors-results/` subfolder |
| `components/questionnaires/` | `CatalogQuestionnaireCard.tsx`, `QuestionnaireCatalogView.tsx`, `QuestionnairesHomeCard.tsx` |
| `components/wbsa/` | `WbsaQuestionCard.tsx`, `WbsaTaker.tsx` |
| `components/primal-pattern/` | `AutoSaveIndicator.tsx`, `PrimalPatternQuestionCard.tsx`, `PrimalPatternTaker.tsx` + `illustrations/`, `results/` subfolders |
| `components/body-assessment/` | 11 files |
| `components/auth/` | 2 files |
| `components/checkin/` | 6 files |
| `components/coach-program-builder/` | 11 files |
| `components/coaching-insights/` | 1 file |
| `components/conversation/` | 5 files |
| `components/dashboard/` | 4 files |
| `components/exercise-library/` | 12 files |
| `components/food-lens/` | 10 files |
| `components/food-products/` | 16 files |
| `components/health-safety/` | 1 file |
| `components/movement/` | 6 files |
| `components/movement-profile/` | 3 files |
| `components/pantry/` | 3 files |
| `components/prescription-intelligence/` | 3 files |
| `components/recommendations/` | 2 files |
| `components/restaurant/` | 1 file |
| `components/wearables/` | 3 files |

### Supporting `lib/` domain directories (not components, but directly relevant to the Overlaps analysis below)

`lib/assessment-registry/` (11 files), `lib/assessments/` (7 files + `chek-hlc1/`, `short-haq/`, `four-doctors/`, `engine/` subfolders), `lib/assessment-foundation/` (3), `lib/assessment-runtime/` (6), `lib/assessment-comparison/` (4), `lib/adaptive-assessment-engine/` (3), `lib/onboarding/` (10 + `concernBanks/` subfolder), `lib/primal-pattern/` (4), `lib/body-assessment/` (18), `lib/wbsa/` (5), `lib/welcome/` (2), `lib/guest-preview/` (4), `lib/registry/` (4 + `adapters/` subfolder of 9 files).

Full `lib/` directory list was enumerated (67 subdirectories total) but not exhaustively documented here beyond what's relevant to assessments/onboarding; see repository for the complete set (notable other areas: `lib/intelligence/`, `lib/intelligence-core/`, `lib/intelligence-engine/`, `lib/coaching-engine/`, `lib/coach-intelligence/`, `lib/root-coaching-engine/`, `lib/coaching-insights/`, `lib/investigation-engine/`, `lib/reassessment-intelligence/`, `lib/recommendation-engine/`, `lib/prescription-intelligence/`, `lib/nutrition-intelligence/`, `lib/longitudinal-intelligence/` — file-by-file boundaries between these were **not** verified and are marked unenumerated).

---

## Overlaps

Cases where two or more implementations appear to address the same job, with file paths. Several of these are explicitly acknowledged as intentional in the code's own comments (cited where found) — included here regardless, since the request is to catalog the overlap, not judge it.

### 1. Two assessment registries, both named `registry.ts`
- `lib/assessment-registry/registry.ts` — cross-cutting catalog for all 9 assessment keys (membership gating, routes, comparison flags, coach settings), backed by the `assessment_definitions` table.
- `lib/assessments/registry.ts` — a second, differently-scoped registry ("Reusable Assessment Engine") covering only 3 of those 9 keys (CHEK HLC1, Four Doctors, Short-HAQ), mapping questionnaire id → `{questionnaire, copy}` content, with no membership/gating data.
- Both are imported independently across the codebase (e.g. `app/actions/assessments.ts`, `app/actions/questionnaireCatalog.ts`, `app/assessments/[questionnaireId]/page.tsx`).

### 2. Five parallel "take an assessment" engines/implementations
Each assessment key in `lib/assessment-registry/registry.ts` runs on its own, separately-implemented engine rather than a shared one:
- **Generic points-scored engine**: `lib/assessments/engine/{navigation,scoring,types}.ts` + `lib/assessments/store.ts` — serves CHEK HLC1, Four Doctors, Short-HAQ via `components/assessments/AssessmentTaker.tsx` and `app/assessments/[questionnaireId]/*`. Storage: `wellness_assessments` / `wellness_assessment_answers` / `wellness_assessment_category_scores`.
- **Onboarding adaptive engine**: `lib/adaptive-assessment-engine/{select,types}.ts` (described in its own header as "generic, domain-agnostic") wired specifically for onboarding via `lib/onboarding/adaptivePlan.ts`, served by `app/onboarding/OnboardingForm.tsx`/`OnboardingFlow.tsx`. Storage: `onboarding_questions` / `onboarding_submissions` / `onboarding_answers`.
- **Primal Pattern bespoke engine**: `lib/primal-pattern/{questionnaire,scoring,store}.ts`, served by `components/primal-pattern/PrimalPatternTaker.tsx`. Storage: `primal_pattern_assessments` / `primal_pattern_assessment_answers`.
- **Body Assessment (media capture) engine**: `lib/body-assessment/*` (18 files), served by `components/body-assessment/AssessmentWizard.tsx`. Storage: `body_assessments` / `body_assessment_captures` / `body_assessment_findings`.
- **Unified Adaptive Assessment Runtime**: `lib/assessment-runtime/{data,conditions,session,findings,types}.ts` + `lib/assessment-foundation/{repository,adaptive}.ts`, currently serving only WBSA via `components/wbsa/WbsaTaker.tsx`. Storage: `unified_assessment_sessions` / `unified_assessment_answers` / `unified_assessment_definitions` / `unified_assessment_sections` / `unified_assessment_questions`.

Migration `00000000000098_unified_assessment_foundation.sql`'s own header comment states this unified schema is "a reusable question/section/assessment schema that future assessments (Four Doctors v2, HAQ, WBSA, Breathing, Nutrition, Primal Pattern, etc.) can opt into instead of inventing a new bespoke table set each time," and that as of that migration "Every assessment continues to run on its current tables exactly as before" — i.e., the repository itself documents that the generic-engine, Primal Pattern, and unified-runtime systems are parallel/non-consolidated by design at this point, with only WBSA on the newest one.

### 3. Two onboarding question-ordering/adaptive systems, both under `lib/onboarding/`
- `lib/onboarding/branching.ts` — "reorder-only" question ordering, per its own header comment now used exclusively by the reassessment flow (`app/profile/reassessments/*`, `OnboardingForm` `mode="fixed"`).
- `lib/onboarding/adaptivePlan.ts` + `lib/adaptive-assessment-engine/` — the real adaptive concern-bank engine used by live `/onboarding`.
- Both read/write the same `onboarding_questions` table (differentiated at the row level by the `question_pool` column added in migration `00000000000097_onboarding_adaptive_engine.sql`).

### 4. Two "welcome/first-run" flows preceding onboarding
- `app/welcome/page.tsx` + `app/welcome/WelcomeFlow.tsx` + `lib/welcome/{eligibility,goals}.ts` — gated by `WELCOME_FLOW_ENABLED`/`isEligibleForWelcomeFlow` in `app/page.tsx`.
- `app/onboarding/page.tsx` + `app/onboarding/{OnboardingIntro,ConsentForm,OnboardingFlow,OnboardingForm}.tsx` — the pre-existing consent → onboarding progression.
- `app/page.tsx`'s own comment states eligible new members are "sent to the welcome flow first, ahead of the existing consent/onboarding progression," and ineligible members "fall through exactly as before" to `/onboarding` — i.e. two first-run entry sequences coexist, selected by eligibility check rather than one replacing the other.
- Related: `lib/guest-preview/*` (guest/pre-signup preview storage) and `app/GuestPreviewMigrator.tsx` sit alongside both flows as a third, pre-account-creation layer.

### 5. Two assessment routes for Four Doctors results
- `app/assessments/[questionnaireId]/results/[assessmentId]/page.tsx` — generic engine results route (applies to CHEK HLC1, Four Doctors, Short-HAQ per the registry).
- `app/assessments/four-doctors/results/[assessmentId]/page.tsx` — a separate, dedicated Four Doctors results route also exists alongside it.
- Both are present in the routing tree; which one is actually linked to from Four Doctors' own flow was not traced further (marked unverified).

### 6. `/assessment` (singular) vs `/assessments` (plural)
- `/assessment*` — Body Assessment only (camera capture + coach review), routes under `app/assessment/`.
- `/assessments*` — everything else (CHEK HLC1, Four Doctors, Short-HAQ, Primal Pattern, WBSA), routes under `app/assessments/`.
- This split is explicitly called out as intentional in comments in both `app/questionnaires/page.tsx` ("Deliberately still separate from /assessment... same existing product decision as before") and `app/actions/questionnaireCatalog.ts` ("Body Assessment is registered in the framework but deliberately excluded here"). Documented here as a naming/routing overlap regardless, since two similarly-named route trees (`/assessment` and `/assessments`) exist for related-but-different features.

### 7. Navigation
- Only one primary navigation component was found: `components/BottomNav.tsx`, a fixed 3-item bar (Home → `/dashboard`, Check-In → `/checkin` or `/checkin/evening`, Today → `/today`, plus a conditional Coach tab → `/coach`). No duplicate/competing nav component was found elsewhere in `components/`.
- `/dashboard` and `/today` are both live, distinctly-purposed pages linked from the nav bar (not treated as an overlap here, since both are wired in and cross-referenced rather than redundant). `app/dashboard/page.tsx` carries an internal header comment describing itself as a "merge" of a prior design pass and Sprint 2 data wiring — noted for completeness, not flagged as an unresolved duplicate since no second competing dashboard route was found.

### 8. Not fully enumerated — possible additional overlap surface
The following similarly-named `lib/` directories were located but their file-level content was **not** individually read/compared for overlapping responsibility: `lib/intelligence/`, `lib/intelligence-core/`, `lib/intelligence-engine/`, `lib/coaching-engine/`, `lib/coach-intelligence/`, `lib/root-coaching-engine/`, `lib/coaching-insights/`, `lib/reassessment-intelligence/`, `lib/recommendation-engine/`. A spot check of file headers in `lib/coaching-engine/` (Root Proactive Coaching Engine / Morning Brief), `lib/coach-intelligence/` (Coach Intelligence Workspace, body-assessment analysis provider), and `lib/root-coaching-engine/` (Conversation Memory / Coach Summary Generator, "Prompt 13") suggests these are three distinct, non-overlapping subsystems rather than duplicates, but this was not verified exhaustively across all files in each directory.

**Resolved below — see "Overlaps — Item 8 Resolved."**

---

## Overlaps — Item 8 Resolved

All 71 files across the 9 directories below were read (header docblock + full export surface; several files read in full where responsibility was ambiguous). Import sites were located with `grep` across `app/`, `components/`, and `lib/` for each directory's import path. All 9 directories have at least one live importer — **none are orphaned.**

### `lib/intelligence/` — Personal Wellness Intelligence Engine
- **Job**: Per-metric trend/pattern/strength/baseline detectors run directly over daily check-in history (`daily_checkins`). Produces `WellnessInsightDraft`s persisted as `wellness_insights` rows. Answers, in its own words (`lib/intelligence-core/types.ts`'s disambiguation comment), *"what is changing."*
- **Files**: `baselineEngine.ts`, `confidence.ts`, `copy.ts`, `data.ts`, `patternEngine.ts`, `priorityIntelligence.ts`, `safety.ts`, `service.ts`, `strengthEngine.ts`, `trendEngine.ts`, `types.ts`, `windows.ts`.
- **Imported by**: `app/actions/wellness-intelligence.ts`, `app/actions/feed.ts`, `app/actions/intelligence-core.ts`, `app/actions/intelligence-engine.ts`, `app/actions/memberNoticing.ts`, `app/actions/recommendations.ts`, `app/actions/rootCauseSignals.ts`, `app/actions/rootMap.ts`, `app/api/cron/daily-coaching-scan/route.ts`, `app/coach/clients/[id]/{IntelligenceCorePanel,IntelligencePanel,MemberIntelligencePanel,RootCauseSignalsPanel}.tsx`, `app/progress/{WellnessIdentityPanel,WellnessStoryPanel}.tsx` — plus in-`lib/` consumers `lib/ai/dispatcher.ts`, `lib/brain/service.ts`, `lib/coaching-engine/{morningBrief,service}.ts`, `lib/conversation-coach/{context,prompt,service}.ts`, `lib/food-lens/coachingNarrative.ts`, `lib/food-products/coachingNarrative.ts`, `lib/health-profile/{orchestration,summary}.ts`, `lib/intelligence-core/*`, `lib/intelligence-engine/*`, `lib/investigation-engine/routerOutcome.ts`, `lib/longitudinal-intelligence/{service,signalState}.ts`, `lib/reassessment-intelligence/service.ts`, `lib/recommendation-engine/{builder,classifier,types}.ts`, `lib/restaurant/coachingNarrative.ts`, `lib/root-map/{builder,types}.ts`.
- **Status**: Actively used — the most widely-imported of the 9 directories; also the base layer the other two `intelligence-*` directories are built on.

### `lib/intelligence-engine/` — MEF Intelligence Engine
- **Job**: Composes `lib/brain/` + `lib/intelligence/` + `lib/narrative/` + safety + feed data into a `MemberHealthProfile` → longitudinal trends, pattern insights, root-cause hypotheses, coach alerts, recommendations, and a member summary. Its own `types.ts` states this is *"the centralized longitudinal layer every coaching surface... reads instead of independently deriving its own picture of a member."* Answers *"what does this all mean right now, and why."* Explicitly re-uses `lib/intelligence/trendEngine.ts`'s trend classification and `lib/intelligence/patternEngine.ts`'s detectors rather than re-deriving them (see `trends.ts`, `patterns.ts` header comments) — a documented composition, not a duplicate.
- **Files**: `alerts.ts`, `crossAssessmentCorrelations.ts`, `data.ts`, `engine.ts`, `hypotheses.ts`, `memberFacingNoticing.ts`, `patterns.ts`, `profile.ts`, `recommendations.ts`, `registryFindings.ts`, `rootCauseSignals.ts`, `summary.ts`, `thresholds.ts`, `trends.ts`, `types.ts`.
- **Imported by**: `app/actions/intelligence-engine.ts`, `app/actions/memberNoticing.ts`, `app/actions/recommendations.ts`, `app/actions/rootCauseSignals.ts`, `app/actions/rootMap.ts`, `app/api/cron/daily-coaching-scan/route.ts`, `app/coach/clients/[id]/{MemberIntelligencePanel,RootCauseSignalsPanel}.tsx` — plus `lib/conversation-coach/context.ts`, `lib/food-lens/coachingNarrative.ts`, `lib/food-products/coachingNarrative.ts`, `lib/health-profile/{orchestration,summary}.ts`, `lib/intelligence-core/{dimensions,observations,prioritization,recommendationGuard,service,types}.ts`, `lib/investigation-engine/routerOutcome.ts`, `lib/longitudinal-intelligence/service.ts`, `lib/reassessment-intelligence/service.ts`, `lib/recommendation-engine/{builder,classifier,types}.ts`, `lib/restaurant/coachingNarrative.ts`, `lib/root-map/{builder,types}.ts`.
- **Status**: Actively used; the layer `lib/intelligence-core/` and `lib/recommendation-engine/` are both explicitly built on top of.

### `lib/intelligence-core/` — MEF Wellness Intelligence Core
- **Job**: One layer above `lib/intelligence-engine/`. Does not recompute trends or hypotheses; reads the Intelligence Engine's report plus Conversation Coach memory and Daily Feed engagement history to build durable, higher-order state nothing else persists: confidence-weighted "Wellness Identity" observations, a 15-dimension "Wellness Profile," a learned Coaching Style Profile, prioritization capped to one primary/two secondary opportunities, and recommendation-repeat suppression. Answers *"who is this person, as a coaching subject, and how should we talk to them."*
- **Files**: `coachingStyle.ts`, `data.ts`, `dimensions.ts`, `memberView.ts`, `observations.ts`, `prioritization.ts`, `recommendationGuard.ts`, `service.ts`, `thresholds.ts`, `types.ts`.
- **Imported by**: `app/actions/intelligence-core.ts`, `app/actions/feed.ts`, `app/coach/clients/[id]/IntelligenceCorePanel.tsx`, `app/progress/{WellnessIdentityPanel,WellnessStoryPanel}.tsx` — plus `lib/ai/dispatcher.ts`, `lib/conversation-coach/{context,service}.ts`, `lib/food-lens/coachingNarrative.ts`, `lib/food-products/coachingNarrative.ts`, `lib/health-profile/orchestration.ts`.
- **Status**: Actively used, rendered on `/progress` (member-facing) and the coach client detail page.

**Verdict on the `intelligence*` trio**: `lib/intelligence-core/types.ts` contains an explicit, self-written disambiguation comment naming all three directories and their distinct jobs (quoted above). Cross-checking that claim against actual imports confirms it: `intelligence-engine` imports from `intelligence` (composes it), `intelligence-core` imports from both `intelligence` and `intelligence-engine` (composes them further), and there is no reverse import (`intelligence` never imports from `intelligence-engine` or `intelligence-core`, `intelligence-engine` never imports from `intelligence-core`). This is a genuine one-directional three-layer stack, not an overlap — **distinct**.

### `lib/coaching-engine/` — Root Proactive Coaching Engine (Daily Morning Brief)
- **Job**: Builds the Daily Morning Brief (`coach_morning_briefs` table) from the Coaching Brain's decision, recent check-ins, habits, streaks, and `lib/intelligence/`'s active trend insights. One orchestrator (`getOrCreateTodaysMorningBrief`) is idempotent per (member, local_date) and is called both on-demand and by the daily cron.
- **Files**: `data.ts`, `habitSelection.ts`, `morningBrief.ts`, `service.ts`, `types.ts`.
- **Imported by**: `app/actions/coaching-engine.ts`, `app/api/cron/daily-coaching-scan/route.ts`, `lib/longitudinal-intelligence/service.ts`.
- **Status**: Actively used — surfaces on Dashboard/Today per its own header comment, plus the daily cron pre-warm.

### `lib/coach-intelligence/` — Coach Intelligence Workspace
- **Job**: Runs a configurable AI provider to analyze one submitted assessment (currently Body Assessment) and produce/store observations for coach review (`assessment_ai_analyses`, `assessment_ai_observations`, `assessment_report_exercises` tables). No provider is registered by default — every call returns `'not_configured'` rather than fabricating a result. Distinct problem domain from every other directory here: this is an AI-analysis-provider boundary, not a coaching-message or intelligence-composition system.
- **Files**: `analysis.ts`, `data.ts`, `providers/registry.ts`, `providers/types.ts`.
- **Imported by**: `app/actions/body-assessment.ts`, `app/actions/coach-intelligence.ts`, `app/progress/timeline/page.tsx`, `lib/registry/adapters/coachIntelligence.ts`.
- **Status**: Actively used; wired into the Body Assessment submit/review flow.

### `lib/root-coaching-engine/` — Root Coaching Conversation Engine ("Prompt 13")
- **Job**: The conversation layer sitting on top of `lib/longitudinal-intelligence/`, `lib/lifestyle-experiments/`, and `lib/investigation-engine/routerOutcome.ts`. Ranks candidate topics, composes a single Observation→Explanation→Action→Encouragement member-facing coaching message, and separately builds a Coach Workspace summary (conversation summary, priorities, recent themes, suggested discussion topics) — persisted to `member_coaching_messages`.
- **Files**: `coachSummary.ts`, `composer.ts`, `data.ts`, `engagement.ts`, `index.ts`, `questions.ts`, `selector.ts`, `service.ts`, `templates.ts`, `topicLabel.ts`, `types.ts`.
- **Imported by**: `app/actions/rootCoaching.ts`, `app/coach/clients/[id]/CoachWorkspacePanel.tsx`.
- **Status**: Actively used, both member- and coach-facing.

### `lib/coaching-insights/` — Coaching Intelligence Engine (multi-source pattern statements)
- **Job**: A separate, template-driven (never LLM) statement generator that reads normalized `CoachingObservation[]`s from five pluggable data sources (check-ins, Food Lens, assessments/Primal Pattern, Root Score progress, plus a registered-but-unimplemented set reserved for Sleep/Stress/Blood Work/Wearables/Movement) and produces leveled (1–4) `coaching_insights` rows — from a same-day observation up to a multi-week trend claim requiring independently-cleared evidence at each level.
- **Files**: `copy.ts`, `data.ts`, `levels.ts`, `safety.ts`, `service.ts`, `types.ts`, `sources/{assessmentSource,checkinSource,nutritionSource,progressSource,registry}.ts`.
- **Imported by**: `app/actions/coaching-insights.ts` (consumed by `app/insights/page.tsx` and `components/coaching-insights/CoachingInsightCard.tsx`), `app/actions/rootCoaching.ts`.
- **Status**: Actively used, rendered on `/insights`.

**Verdict on the four "coaching" directories** (`coaching-engine`, `coach-intelligence`, `root-coaching-engine`, `coaching-insights`): despite very similar names, each targets a different output and a different table — Morning Brief (`coach_morning_briefs`), AI provider analysis of a submitted assessment (`assessment_ai_analyses`), a single ranked conversational message plus coach summary (`member_coaching_messages`), and multi-source leveled pattern statements (`coaching_insights`) respectively. No file in any of the four imports from another of the four except `lib/root-coaching-engine/{engagement,topicLabel}.ts` importing `lib/recommendation-engine` (a fifth, separate directory — see below), and `app/actions/rootCoaching.ts` calling into both `root-coaching-engine` and `coaching-insights` as sibling inputs to one server action, not one importing the other. **Distinct.**

### `lib/reassessment-intelligence/` — Reassessment Intelligence
- **Job**: Decides *when* a reassessment should be suggested — not calendar-only, but from worsening `registry_entries` findings, calendar elapsed time, experiment outcomes, or recommendation-sequence signals. Writes `reassessment_schedules` rows with an explicit `trigger_source`/`trigger_context`.
- **Files**: `data.ts`, `service.ts`.
- **Imported by**: `app/actions/longitudinalIntelligence.ts`, `app/actions/rootCauseSignals.ts`, `app/actions/rootMap.ts`, `app/api/cron/daily-coaching-scan/route.ts`.
- **Status**: Actively used, including in the daily cron.

### `lib/recommendation-engine/` — Recommendation Engine ("Prompt 11")
- **Job**: Takes `lib/intelligence-engine/recommendations.ts`'s already-computed `Recommendation[]` plus the Root Router's `RootRouterOutcomeView` and turns each into a richer, persistable, lifecycled `MemberRecommendation` (`member_recommendations` table) — classification into 15 member-facing categories, staleness/lifecycle derivation (shown/completed/ignored/expired), and member-facing copy. Explicitly positioned in its own header comment as coming *after* the Root Router and *not* re-deciding what it already decided.
- **Files**: `builder.ts`, `classifier.ts`, `data.ts`, `describeForMember.ts`, `index.ts`, `lifecycle.ts`, `outcomeHistory.ts`, `types.ts`.
- **Imported by**: `app/actions/lifestyleExperiments.ts`, `app/actions/recommendations.ts`, `app/actions/rootCoaching.ts`, `app/actions/rootMap.ts`, `app/api/cron/daily-coaching-scan/route.ts`, and `lib/root-coaching-engine/{engagement,topicLabel}.ts`.
- **Status**: Actively used, including as an input into `lib/root-coaching-engine/`.

### Cross-cutting verdict
No two of the 9 directories were found to independently implement the same job. They form one directed pipeline plus two side-branches, corroborated by both the code's own header comments and actual import direction (no cycles found):

```
lib/intelligence/  →  lib/intelligence-engine/  →  lib/intelligence-core/
                                │                          │
                                ├──→ lib/recommendation-engine/ ──→ lib/root-coaching-engine/
                                │
                                └──→ lib/reassessment-intelligence/

lib/coaching-engine/       (Morning Brief — reads lib/intelligence/, independent output)
lib/coach-intelligence/    (AI analysis provider for Body Assessment — independent domain)
lib/coaching-insights/     (multi-source leveled statements — independent domain, feeds app/actions/rootCoaching.ts alongside root-coaching-engine)
```

All 9 are live (imported and rendered on real routes); none are orphaned. The similar names (`intelligence` / `intelligence-core` / `intelligence-engine`; `coaching-engine` / `coach-intelligence` / `root-coaching-engine` / `coaching-insights`) reflect a layered/adjacent-domain architecture rather than duplicated implementations, to the extent verifiable from imports and header comments. This does not rule out finer-grained duplication *within* individual functions (e.g., two directories independently computing a similar-looking number from different inputs) — that level of logic-by-logic comparison was not performed.
