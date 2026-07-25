# MEF Platform — Build Status

Source: `/docs/INVENTORY.md` (file-level inventory + Overlaps analysis), plus a small number of targeted follow-up reads cited inline where they go beyond what INVENTORY.md already established. Scope is bounded to the assessment / onboarding / welcome / cross-assessment-intelligence subsystem, which is what INVENTORY.md documented in depth — this is not a build-status audit of Food Lens, Movement, Wearables, etc. as standalone features. No application code was written or changed to produce this document.

---

## Direction of travel

**`lib/assessment-runtime/` + `lib/assessment-foundation/` (the Unified Adaptive Assessment Runtime) is the chosen shared foundation for all assessments going forward.** The older, per-assessment engines are legacy — candidates to be migrated onto the unified runtime over time, not systems to keep building out in parallel indefinitely.

This is not an inference — it's what the schema's own migration states. `supabase/migrations/00000000000098_unified_assessment_foundation.sql`'s header comment: *"a reusable question/section/assessment schema that future assessments (Four Doctors v2, HAQ, WBSA, Breathing, Nutrition, Primal Pattern, etc.) can opt into instead of inventing a new bespoke table set each time."* It explicitly names Four Doctors, HAQ, and Primal Pattern — three of today's legacy engines — as intended future migrants onto this schema, not permanent parallel systems.

- **Schema**: `unified_assessment_definitions`, `unified_assessment_sections`, `unified_assessment_questions` (`supabase/migrations/00000000000098_unified_assessment_foundation.sql`), `unified_assessment_sessions`, `unified_assessment_answers` (`supabase/migrations/00000000000099_unified_assessment_runtime.sql`).
- **Logic**: `lib/assessment-foundation/{repository,adaptive,index}.ts` (content read layer), `lib/assessment-runtime/{data,conditions,session,findings,types,index}.ts` (session/answer/branching/findings engine).
- **First (and, as of this document, only) adopter**: WBSA — content seeded by `supabase/migrations/00000000000100_wbsa_schema_extensions.sql` and `00000000000101_wbsa_content.sql`, served by `components/wbsa/WbsaTaker.tsx` and `app/assessments/wbsa/{page,take/page,results/[sessionId]/page}.tsx`.
- **Not yet migrated**: the generic points-scored engine (CHEK HLC1 / Four Doctors / Short-HAQ), Primal Pattern, Body Assessment, and the Onboarding adaptive engine — see 🟡 below for each.

---

## ✅ Built & Complete

Features where schema, logic, UI, and a real data path all exist and connect, verified by file citation.

### 1. WBSA (Whole-Body Systems Assessment) — end-to-end on the new foundation
The one assessment that is both feature-complete *and* already on the chosen target architecture.
- **Schema**: `unified_assessment_*` tables above, plus WBSA-specific extensions (`allows_prefer_not_to_answer` column, 7 new `registry_entries.domain` values) in migration 100; 16 sections/questions seeded by migration 101.
- **Logic**: `lib/assessment-runtime/*`, `lib/assessment-foundation/*`, `lib/wbsa/{safety,comparison,copy,constants,results}.ts`.
- **Server actions**: `app/actions/wbsa.ts`.
- **UI**: `components/wbsa/{WbsaTaker,WbsaQuestionCard}.tsx`; member routes `app/assessments/wbsa/page.tsx`, `.../take/page.tsx`, `.../results/[sessionId]/page.tsx`; coach route `app/coach/clients/[id]/wbsa/[sessionId]/page.tsx`.
- **Registered**: `lib/assessment-registry/registry.ts`'s `WBSA` entry (`key: 'wbsa'`, `implementationStatus: 'live'`), backed by the `assessment_definitions` catalog row inserted in migration 101.

### 2. Universal Health Finding Registry — cross-assessment findings aggregation
A single findings table fed by 7 independent adapters, consumed widely by the intelligence layer.
- **Schema**: `registry_entries` (`supabase/migrations/00000000000040_universal_health_registry.sql`).
- **Logic**: `lib/registry/{data,trendStatus,types,timeline}.ts` + 9 adapter files in `lib/registry/adapters/` (`bodyAssessment`, `coachIntelligence`, `foodLens`, `foodProducts`, `movement`, `onboarding`, `primalPattern`, `unifiedAssessment`, `wearables`, `questionnaireEngine`).
- **Consumers**: `lib/intelligence-engine/registryFindings.ts`, `lib/intelligence-engine/crossAssessmentCorrelations.ts`, `lib/reassessment-intelligence/service.ts`, `lib/root-map/*` (per INVENTORY.md's Overlaps §Item 8 Resolved import lists).

### 3. Questionnaire catalog + membership/access gating
The browse/filter/resume/gate experience itself is complete, independent of which underlying engine each listed assessment runs on.
- **Schema**: `assessment_definitions`, `membership_tiers`.
- **Logic**: `lib/assessment-registry/{registry,access,status,membership,versionLock}.ts`, `app/actions/questionnaireCatalog.ts`.
- **UI**: `app/questionnaires/page.tsx`, `components/questionnaires/{CatalogQuestionnaireCard,QuestionnaireCatalogView,QuestionnairesHomeCard}.tsx`.

### 4. Assessment Assignments (coach assigns a questionnaire to a member)
- **Schema**: `assessment_assignments` (`supabase/migrations/00000000000077_assessment_assignments.sql`).
- **Logic**: `app/actions/assessmentAssignments.ts`.
- **UI**: `app/coach/clients/[id]/AssessmentAssignmentPanel.tsx`.

### 5. Reassessment Intelligence trigger system
Decides *when* to suggest a reassessment (worsening registry findings, elapsed time, experiment outcomes, recommendation sequences) — a real writer for a table that previously had none.
- **Schema**: `reassessment_schedules`, `reassessment_schedule_configs`.
- **Logic**: `lib/reassessment-intelligence/{data,service}.ts`.
- **Consumers**: `app/actions/{longitudinalIntelligence,rootCauseSignals,rootMap}.ts`, `app/api/cron/daily-coaching-scan/route.ts`.
- **UI surface**: `app/profile/reassessments/{page,new/page,[id]/page}.tsx`.

### 6. One consolidated assessment registry (was two)
`lib/assessments/registry.ts` (the "Reusable Assessment Engine" content-mapping registry — Questionnaire + Copy pairs for CHEK HLC1, Four Doctors, Short-HAQ) has been absorbed into `lib/assessment-registry/registry.ts`, which is now the single registry for all 9 assessment keys. `lib/assessments/registry.ts` is deleted.
- **What changed**: `QUESTIONNAIRE_CONTENT_REGISTRY` (content map, keyed by `questionnaire.id`) now lives in `lib/assessment-registry/registry.ts` alongside the pre-existing `ASSESSMENT_REGISTRY` (catalog map, keyed by `AssessmentKey`) — two distinct maps in one file, not merged into one shape, since their `AssessmentDefinition` types name unrelated things (disambiguated in-file via the `AssessmentContentDefinition` import alias). Exported functions (`getAssessmentDefinition`, `findAssessmentDefinition`, `listAssessmentDefinitions`) kept their exact names and signatures.
- **Callers updated**: `app/actions/assessments.ts`, `app/assessments/[questionnaireId]/history/page.tsx`, `lib/coaching-insights/sources/assessmentSource.ts`, and 4 test files (`tests/{assessments-engine,assessments-isolation,assessments-lifecycle-integration,short-haq-engine}.test.ts`) — all now import from `lib/assessment-registry/registry.ts`. `tests/assessments-isolation.test.ts`'s static-scan guard (which asserts only one file is allowed to reference "Four Doctors" outside its own module) was updated to point at the new location; the isolation property itself is unchanged since the new location sits outside that test's scanned directory set.
- **Verified**: `npm run typecheck` clean; `npm run lint` — 0 errors (29 pre-existing warnings, all in files this change didn't touch); `npm run build` (`next build`) — compiled successfully, all routes generated including every `/assessment*` and `/assessments/*` route, no build errors; full `vitest run` — 1759/1759 passing across 165 test files, including the real-DB integration suite (`tests/assessments-lifecycle-integration.test.ts`) against a live local Supabase instance. No behavior change for any of the 9 assessments.
- **Deployed**: commit `e6318fb` pushed to `origin/main` (`github.com/MEFwellness/mef-platform`) and built/deployed to the `mef-platform` Vercel project's Production environment, aliased to `app.mefwellness.com`. Confirmed via Vercel build logs that the deployment cloned `Branch: main, Commit: e6318fb` and completed ("Build Completed" / "Deployment completed" / status Ready). Confirmed via `curl` that `https://app.mefwellness.com` is live and serving from this deployment (`server: Vercel`, 307 redirect to `/login` for an unauthenticated request, matching `app/page.tsx`'s expected routing). Not verified: any actual page content or the 9 assessments' behavior in a browser — see the click-by-click checklist delivered with this task.

---

## 🟡 Built but Incomplete

### 1. Generic points-scored questionnaire engine (CHEK HLC1, Four Doctors, Short-HAQ)
- **What exists**: fully working end-to-end on its own tables — `wellness_assessments`/`wellness_assessment_answers`/`wellness_assessment_category_scores`; logic in `lib/assessments/engine/{navigation,scoring,types}.ts` + `lib/assessments/store.ts`; content in `lib/assessments/{chek-hlc1,four-doctors,short-haq}/{index.ts,questionnaire.json,copy.ts}`; UI in `components/assessments/AssessmentTaker.tsx` + `app/assessments/[questionnaireId]/*`.
- **What's unfinished**: not migrated onto `unified_assessment_*`/`lib/assessment-runtime`. Three separate live assessments still depend on a table set and engine migration 98's own comment names as a pre-unification system. No migration path or dual-write has been started.

### 2. Primal Pattern Diet Type
- **What exists**: `lib/primal-pattern/{questionnaire,scoring,store}.ts`, `primal_pattern_assessments`/`primal_pattern_assessment_answers`/`primal_pattern_profiles` tables, `components/primal-pattern/PrimalPatternTaker.tsx`, `app/assessments/primal-pattern-diet-type/*`.
- **What's unfinished**: also named explicitly in migration 98's comment as an intended future migrant to the unified runtime; still on its own bespoke tables/engine, unmigrated.

### 3. Body Assessment (camera-based posture/movement capture)
- **What exists**: `lib/body-assessment/*` (18 files), `body_assessments`/`body_assessment_captures`/`body_assessment_findings`/`body_assessment_coach_reviews`/etc. tables, `components/body-assessment/AssessmentWizard.tsx`, `app/assessment/*` + coach review routes under `app/coach/clients/[id]/body-assessments/*` and `app/coach/review-queue/*`.
- **What's unfinished**: not on the unified runtime. Architecturally distinct from the other four (media capture + coach review, not question/answer), so a literal migration onto `unified_assessment_questions` may not even be the right target — whether Body Assessment is in scope for unification at all is itself unresolved (not stated either way in migration 98's comment or anywhere else found).

### 4. Onboarding adaptive engine
- **What exists**: real per-concern adaptive selection — `lib/onboarding/adaptivePlan.ts` + `lib/adaptive-assessment-engine/{select,types}.ts`, 9 concern banks in `lib/onboarding/concernBanks/*`, served by `app/onboarding/{OnboardingForm,OnboardingFlow}.tsx`, stored in `onboarding_questions`/`onboarding_submissions`/`onboarding_answers`.
- **What's unfinished**: two things. (a) Not on the unified runtime, same as the other three. (b) Internally, onboarding itself still runs two different question-ordering systems on the same `onboarding_questions` table: `lib/onboarding/branching.ts` (legacy reorder-only, now used only by the reassessment flow at `app/profile/reassessments/*`) alongside `lib/onboarding/adaptivePlan.ts` (the real adaptive engine, used by live `/onboarding`) — differentiated only by the `question_pool` column added in migration `00000000000097_onboarding_adaptive_engine.sql`. This split was never resolved into one system; per that migration's own comment, the reassessment flow "deliberately keeps its original behavior unchanged" rather than adopting the adaptive engine.

### 5. ~~Two assessment registries~~ — resolved, see ✅ Built & Complete #6

### 6. Two coexisting welcome/first-run flows
- **What exists**: `app/welcome/{page,WelcomeFlow}.tsx` + `lib/welcome/{eligibility,goals}.ts` (four-screen welcome experience, goal selection) sits *in front of* the pre-existing `app/onboarding/{page,OnboardingIntro,ConsentForm,OnboardingFlow,OnboardingForm}.tsx` consent → onboarding progression, gated by `WELCOME_FLOW_ENABLED = true` (`lib/welcome/eligibility.ts`) and a per-profile `welcome_flow_eligible` flag set only for new signups (migration 85's `handle_new_user` trigger).
- **What's unfinished**: confirmed by reading `app/actions/welcome.ts` — `completeWelcomeFlow()` marks `welcome_flow_completed_at` and simply `redirect('/')`s back to the routing hub (`app/page.tsx`), which then still runs its own separate `hasCompletedConsent()` / `onboarding_submissions` check and sends a brand-new member on to `/onboarding` next. The welcome flow does not replace or absorb consent/onboarding — it's an additive step in front of it for members marked eligible at signup. Existing members (created before migration 85, or otherwise ineligible) skip welcome entirely and go straight through the original consent → onboarding path — so two first-run sequences exist by population, not as alternatives a single member ever chooses between. See "Open decisions" below.

### 7. Two Four Doctors results routes
- **What exists**: the generic `app/assessments/[questionnaireId]/results/[assessmentId]/page.tsx` (serves CHEK HLC1, Four Doctors, Short-HAQ per the registry) alongside a dedicated `app/assessments/four-doctors/results/[assessmentId]/page.tsx`.
- **What's unfinished**: not actually ambiguous at runtime (see "Open decisions" — this is resolved by Next.js routing precedence, confirmed by both routes' own code), but it is unfinished cleanup: the generic route's Four Doctors code path is effectively dead (Next.js's static-over-dynamic resolution means `/assessments/four-doctors/results/*` never reaches the generic handler), yet no comment, redirect, or dead-code marker in the generic route acknowledges that Four Doctors is excluded from it in practice. A reader of only `app/assessments/[questionnaireId]/results/[assessmentId]/page.tsx` would not know this.

### 8. Unified comparison vocabulary (`lib/assessment-comparison/`) — single adopter
- **What exists**: `lib/assessment-comparison/{adapters,types,classify,index}.ts` — a shared `ComparisonDirection`/classification vocabulary intended to normalize "improved/declined" language across assessment types.
- **What's unfinished**: as of this document, its only importer found via `grep` is `lib/wbsa/comparison.ts`. The CHEK HLC1/Four Doctors/Short-HAQ engine (`lib/assessments/comparison.ts`) and Onboarding (`lib/onboarding/comparison.ts`) each still have their own separate, pre-existing comparison logic that does not go through this shared vocabulary. "Unified" describes the intent, not yet the adoption.

---

## ❌ Not Built

Referenced in the codebase or migrations as intended, with no implementation found.

- **`readiness-to-change` and `finding-1-love` assessments** — both are `comingSoon()` placeholder entries in `lib/assessment-registry/registry.ts` with `implementationStatus: 'coming_soon'`, `componentRef: 'n/a — not yet implemented'`, no questionnaire content, and `scoringAdapter: 'none'`. Catalog rows exist (per that file's comment, from `supabase/migrations/00000000000078_coming_soon_assessments.sql`) but no content, route, or scoring logic exists anywhere.
- **Real AI/LLM provider wiring for most subsystems** — confirmed by reading two registries directly: `lib/ai/providers/registry.ts` registers all 4 named providers (`openai`, `anthropic`, `google`, `local`) as `UnconfiguredProvider` stubs whose methods throw rather than call a real API; `lib/coach-intelligence/providers/registry.ts` (Coach Intelligence Workspace — AI analysis of a submitted Body Assessment) does the same for all 3 of its named providers (`openai_gpt4`, `anthropic_claude`, `custom_model`) — every call returns/throws `"... is not configured"` by design. The same `UnconfiguredProvider`/`not_configured` naming pattern also appears (found via `grep`, files not individually opened to confirm) in `lib/food-lens/providers/registry.ts`, `lib/food-lens/providers/labelOcr/registry.ts`, `lib/body-assessment/providers/registry.ts`, `lib/wearables/providers/registry.ts`, and `lib/movement/providers/registry.ts` — **not individually verified, marked as such.**
  - Exception found: `lib/ai/providers/anthropic.ts` is a real `AnthropicProvider` implementation, and `lib/conversation-coach/provider.ts` does call `registerProvider('anthropic', real)` to wire it into the registry for Conversation Coach specifically — but only when `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` env vars are both set. Checked `.env.local` in this repo: both are present as empty (unset) values. **Not verified** whether they're set in the actual deployed/production environment — this only confirms local repo state.
- **`services/knowledge-engine-api/` and `services/pattern-prioritization-engine/`** — both are declared workspace members (root `package.json`'s `"workspaces": ["apps/*", "services/*", "packages/*"]`) but each contains only `README.md` + `package.json`; no `src/` or any other source file exists in either directory.
- **`packages/mef-method-repository/`** — contains only `README.md` and an empty `content/.gitkeep`; no actual method/content files exist despite being a declared workspace package.
- **Reserved coaching-insights data sources** — `lib/coaching-insights/types.ts` declares a `CoachingSourceId` union that includes Sleep, Stress, Blood Work, Wearables, and Movement Assessments as named source ids, with its own comment stating "only the first five are backed by a real provider today" (check-ins, Food Lens, assessments, progress, and one more — see `lib/coaching-insights/sources/registry.ts`'s `ACTIVE_PROVIDERS`). No provider file exists for the 5 reserved-but-unimplemented sources.

---

## ⚠️ Not verified in the running app

Everything above is verified from files only — no dev server was started and no browser was used to produce this document. To confirm the claims above, the following would need to be clicked through:

- **WBSA take → results flow**: start a WBSA assessment at `/assessments/wbsa/take`, answer through all 16 sections, and confirm a session actually persists, findings compute, and `/assessments/wbsa/results/[sessionId]` renders without error. Code exists end-to-end; it has not been exercised.
- **Four Doctors results routing**: complete a Four Doctors assessment and click "View My Results" to confirm the dedicated `app/assessments/four-doctors/results/[assessmentId]/page.tsx` actually renders (per its own comment's Next.js static-over-dynamic routing claim), not the generic results page.
- **Welcome flow gating**: create a brand-new signup and confirm `/welcome` actually appears (i.e., `handle_new_user` from migration 85 is correctly setting `welcome_flow_eligible = true` in the live database), and that completing it correctly falls through to `/onboarding` next, not a loop or dead end.
- **Onboarding vs. reassessment question order**: take `/onboarding` fresh vs. starting a reassessment at `/profile/reassessments/new`, to confirm the two really do use visibly different question-selection behavior (adaptive concern banks vs. fixed reorder) as the code claims.
- **Coach Intelligence "not configured" behavior**: as a coach, trigger "Run analysis" on a submitted Body Assessment and confirm the UI shows a clear, handled message rather than a raw thrown error or a broken page.
- **Coming-soon assessment cards**: confirm `readiness-to-change` and `finding-1-love` render as non-clickable/clearly-labeled cards on `/questionnaires` rather than as dead links.
- **Database migration state**: whether all 101 migrations (including the `assessment_definitions` catalog rows whose UUIDs must match `lib/assessment-registry/registry.ts` exactly per that file's own comment) have actually been applied to the live/production Supabase instance was not checked — only the migration files themselves were read, not the database.
- **Production environment variables**: whether `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` (Conversation Coach) or any other provider credentials are set in the deployed environment (Vercel) — only the local `.env.local` checked into this working copy was inspected.

---

## Open decisions

**1. Which Four Doctors results route is canonical?**
Resolved in code, but the underlying question of *whether this is the intended long-term shape* is still open. `app/assessments/four-doctors/results/[assessmentId]/page.tsx`'s own header comment states it's "a static route... Next.js resolves ahead of the generic dynamic `app/assessments/[questionnaireId]/results/[assessmentId]/` route for this one exact path" — and `components/assessments/AssessmentTaker.tsx` (line ~301, ~322) redirects to `/assessments/${slug}/results/${id}`, which for the Four Doctors slug lands on that dedicated route by Next.js's static-over-dynamic precedence. So **the dedicated route is canonical today, by routing mechanics, not by an explicit decision recorded anywhere.** The generic route remains canonical for CHEK HLC1 and Short-HAQ only. Open question: should the generic `[questionnaireId]/results` route be updated to explicitly acknowledge it never serves Four Doctors (dead-code clarity), or should Four Doctors eventually be folded back into the generic route like its two siblings?

**2. Does the welcome flow replace the onboarding-consent path, or stay conditional?**
Confirmed conditional, not a replacement, by reading `app/actions/welcome.ts`: `completeWelcomeFlow()` redirects to `/` and lets `app/page.tsx`'s existing `hasCompletedConsent()` / `onboarding_submissions` checks run exactly as before — a brand-new member goes welcome → (back through the hub) → onboarding, not welcome-instead-of-onboarding. Gating is by `welcome_flow_eligible`, set only for new signups (migration 85), so existing members never see `/welcome` at all and go straight to consent/onboarding as before. Open question: is a permanent two-population split (new members: welcome + onboarding both; existing members: onboarding only) the intended end state, or is welcome meant to eventually absorb what `app/onboarding/{OnboardingIntro,ConsentForm}.tsx` currently do for new members — at which point those two files would become dead code for the new-member path (still load-bearing for the existing-member path, since they're not eligibility-gated the way welcome is)? Nothing in the code states an intended end state either way.

---

## Home dashboard redesign (2026-07-25)

Visual and structural redesign of the member Home screen (`app/dashboard/page.tsx` and its components) — no section removed, no copy changed, no data source changed. Coach-facing routes/components untouched.

- **Hero**: `components/dashboard/HomeHero.tsx` — full-bleed photo (`public/images/home-hero.jpg`) replaces the old plain header + white Root Score card. Dark diagonal gradient (stronger left/top) for legibility; logo and avatar sit on a subtle dark scrim in the top corners. Root Score counts up on load via `components/dashboard/RootScoreCountUp.tsx`. Before a member's first check-in, the hero shows only the greeting (`hasCheckins` prop) so it doesn't compete with `FirstCheckInWelcome` below it — matches the original page's own gating, just relocated.
- **Rhythm**: sections are grouped into six labeled zones (Quick Actions, Today, Your Path, What Root Is Noticing, Trends, Coming Up), each fading/rising into view on scroll (`components/dashboard/RevealOnScroll.tsx`, respects `prefers-reduced-motion`). No two consecutive sections repeat the same treatment — full-bleed color panels, plain divider rows, a horizontal carousel, CSS image-backed cards, and white cards (now the minority) are rotated deliberately.
- **Quick Actions** (`components/dashboard/QuickActionsCarousel.tsx`): Movement/Food Lens/Progress/Flag a Concern as one horizontal carousel. `components/checkin/ConcernFlag.tsx` is now a controlled component (`open`/`onOpenChange`) triggered by the carousel tile instead of its own internal button — same `flagConcern()` action, same copy. `components/DashboardQuickLinks.tsx` (superseded, no remaining importers) was deleted.
- **Questionnaires** (`components/questionnaires/QuestionnairesHomeCard.tsx`): now a plain row with a real progress bar, no card.
- **Guided Posture & Movement Assessment** (`components/MovementAssessmentCard.tsx`): new `variant="imageBacked"` (CSS-only gradient + silhouette treatment — no real photo asset exists for this yet) used only by the dashboard; `variant="card"` (default, unchanged) still serves `/today`, so that page's appearance is untouched.
- **Daily Wellness / Assigned Programs**: `components/checkin/DailyWellnessSection.tsx` is now a flat tinted panel; `components/AssignedProgramsCard.tsx` is now a plain divider row.
- **Unlock Smarter Coaching** (`components/wearables/ConnectWearableCard.tsx`, `dashboard` variant only): now a full-bleed dark green panel edge-to-edge with the site's own padding/rail offsets; the `today` variant (currently unused elsewhere) is untouched.
- **What Root Is Noticing**: `WhatWereNoticingCard`, `RootMapCard`, `CoachingMessageCard`, `RecommendationsCard` are visually grouped inside one tinted panel in `app/dashboard/page.tsx`; each component file is unmodified and keeps its own independent Suspense boundary/fetch.
- **Energy Trend**: the shared `components/EnergyTrendChart.tsx` is also used by the coach client view (`app/coach/clients/[id]/page.tsx`) and was left completely unmodified. The "line draws in" animation instead lives in a new dashboard-only wrapper, `components/dashboard/AnimatedEnergyTrendChart.tsx`, which wipes the unmodified chart in via `clip-path` on mount.
- **RootScoreCard.tsx** (superseded by `HomeHero.tsx`, no remaining importers) was deleted.
- New shared CSS in `app/globals.css`: `.mef-scrollbar-hidden` (carousels), `.mef-press` (button/link press state, all respecting `prefers-reduced-motion`).

**Verified**: `npm run typecheck` clean; `npm run lint` — 0 errors (only pre-existing warnings in unrelated files); full `vitest run` — 1759/1759 passing across 165 test files; `npm run build` (`next build`) — compiled successfully, all 64 routes generated including `/dashboard` and every `/coach/*` route. Manually driven in a real browser (Playwright against the local dev server + local Supabase, logged in as the seeded `member.one@example.test` dev account): hero, count-up score, Quick Actions carousel, the Flag a Concern reveal panel (typed text, Send button enabled — not submitted), the image-backed Movement Assessment card, the tinted Noticing zone, the Energy Trend chart, the quiet "Next session" row, and the full-bleed Unlock Smarter Coaching panel all rendered as designed with zero browser console errors.

**Not verified**: the pre-first-check-in hero state (greeting-only) and the "building your Root Score" (no-score-yet) hero state were reasoned through in code but not exercised against a real zero-checkin or zero-score account in this pass. Not deployed — this work is committed to a local branch only as of this entry; no push/deploy has happened yet.

**2026-07-25 follow-up — pre-first-check-in state fixes** (found on the live site after the above shipped):

- **Double greeting**: `components/FirstCheckInWelcome.tsx`'s headline changed from "Welcome, {firstName}" (a second greeting, duplicating the hero's "Good evening, {firstName}") to "Let's get started" — forward-looking, no name. The component no longer takes a `firstName` prop at all (nothing in it used it anymore); its only two callers, `app/dashboard/page.tsx` and `app/today/page.tsx` (this component is intentionally shared between both, per its own doc comment), were updated to drop the now-unused prop.
- **Hero height**: `components/dashboard/HomeHero.tsx`'s `HeroChrome` gained a `compact` mode, used only when `hasCheckins` is false — no forced `min-height`, no `mt-auto` push-to-bottom, just the header row plus a short gap before the greeting, so the band is only as tall as its content actually needs. The scored/full hero (`hasCheckins` true) is completely unchanged — verified side by side in a browser (screenshot before/after match).
- **CTA hidden behind the bottom nav / overlapping the floating chat button**: was real, and reproducible — measured via Playwright bounding boxes at 375×667 (iPhone SE, this app's narrowest supported width): the CTA button and the floating "Ask Root" launcher overlapped by roughly 10×37px, and the CTA's bottom edge was 2px past the bottom nav's top edge. Fixed by the hero-height change above plus tightening `FirstCheckInWelcome`'s own internal padding/margins and the page's hero-to-card gap (`app/dashboard/page.tsx`, `pt-8` → `pt-4`). Re-measured after the fix at the same 375×667 viewport: CTA bottom now sits 64px clear of the floating button's top edge and 128px clear of the bottom nav's top edge.
- **General bottom-padding safety net**: `<main>`'s mobile bottom padding in `app/dashboard/page.tsx` increased `pb-28` → `pb-32`, applying to both dashboard states (not just pre-check-in), per the instruction that no content should ever be trapped under the bottom nav on this page.

**Verified**: `npm run typecheck` clean; targeted `eslint` on every touched file clean; full `vitest run` — 1759/1759 passing (one earlier run in this session showed 2 failures in real-DB integration tests unrelated to any file touched here — `movement-profile`/`pattern-prioritization`-style tests — that passed cleanly on an immediate rerun, consistent with known flakiness in those real-Postgres-backed suites, not a regression); `npm run build` — compiled successfully. Manually verified in a real browser (Playwright, local dev server + local Supabase) logged in as the seeded **zero-check-in** dev account (`member.two@example.test`) at both 375×667 and 390×844 — single greeting, "Let's get started" card, CTA fully visible with no scrolling, no overlap with the floating chat button or bottom nav, zero console errors at either size. Also re-verified the scored-hero state (`member.one@example.test`) renders identically to before. Not deployed as of this entry.
