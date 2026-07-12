# Sprint 1 Completion Report

This is the document `README.md` has referenced since the initial commit.
It covers two things: what Sprint 1 itself delivered and deferred, and —
since a lot has been built since — what's shipped in the working sessions
after it. Treat the "Since Sprint 1" section as the more current picture
of the app; the Sprint 1 section is a historical record of the original
scope.

## Sprint 1 (original baseline)

Sprint 1's stated goal was proving the data model and access control layer
end-to-end, with exactly one styled product surface (the dashboard) on top
of it.

**Delivered:**

- Full Postgres schema (`supabase/migrations/`): organizations, profiles,
  roles/user_roles (RBAC with an activation-status kill-switch for
  unreleased roles), consent_records, coach_client_assignments, a versioned
  onboarding assessment system (assessment_versions/questions/submissions/
  answers), habits/habit_logs, and append-only daily_checkins with a
  `checkin_version` history and a `daily_checkins_current` view.
- RLS policies on every table — deny-by-default, member-owns-own-rows,
  coach-reads-assigned-clients, admin-reads-everything — enforced by
  Postgres itself, not application code.
- Atomic write functions (`submit_onboarding`, `submit_daily_checkin`) and
  admin RPCs (`grant_coach_role`, `assign_client_to_coach`, etc.), all
  `SECURITY INVOKER` — relying on RLS for authorization, not duplicating it.
- Auth flows (signup/login/reset) and the consent + onboarding assessment
  UI, functionally complete but unstyled.
- One fully-styled page: the dashboard, reading real check-in data.
- Seed data (`supabase/seed/`) exercising the full flow: consent, an
  onboarding submission, coach-client assignments (including a revoked
  one), and versioned check-ins.

**Explicitly deferred (by design, not oversight):**

- `onboarding_baselines` — table exists, no scoring job populates it. No
  wellness/readiness score computation anywhere.
- `/checkin`, `/profile`, `/coach`, `/admin`, `/progress` — zero UI, despite
  working server actions behind three of them.
- Styled auth/onboarding pages — raw unstyled HTML.
- Brand fonts referenced in the dashboard's Tailwind classes but never
  actually loaded (silent fallback to system fonts).
- Automated tests — vitest configured, zero test files; the CI job that
  ran them was a no-op.
- `services/knowledge-engine-api`, `services/pattern-prioritization-engine`,
  `packages/mef-method-repository` — scaffolding only (README + package.json,
  no code).
- Legal consent copy — placeholder text, marked "LEGAL REVIEW REQUIRED."
- Deployment tooling — no Vercel/Docker config anywhere.

## Since Sprint 1

Everything below was built in subsequent working sessions, in this order:

1. **Root-cause fixes**: an unawaited `resolveLocalDate()` call that passed
   a `Promise` where Postgres expected a `date` (dashboard runtime error),
   and a schema-drift bug where `mood_level`/`water_cups` were referenced
   in app code but didn't exist in the database — fixed via migration
   (`00000000000021`/`00000000000022`), not by deleting the fields.
2. **The daily-use loop, coach/admin surfaces, identity polish**: built
   `/checkin` (full form + habit checklist), `/profile`, `/progress` (real
   streaks/trends/history, retiring a fake dashboard alias), `/coach`
   (client roster + check-in history), `/admin` (user management, role
   grants, assignments) — all on top of server actions that already
   existed. Restyled every auth and onboarding page to match the
   dashboard's established design language, with zero logic changes.
   Loaded the brand fonts that were referenced but never wired up.
3. **Automated test suite**: 32 integration tests (`apps/consumer-web-app/tests/`)
   against a real local Supabase instance — RLS policies and RPC functions,
   not mocks, matching this project's stated testing philosophy. Wired the
   missing env vars into the CI job that was already configured to run them.
4. **PWA installability**: web app manifest, icon set, iOS/Android meta
   tags. Found and fixed a real bug while verifying it — the auth
   middleware was redirecting _all_ unauthenticated requests for public
   static assets (the logo, and now the manifest/icons) to `/login`,
   which had been silently breaking the logo on every auth page.
5. **Accessibility pass**: automated axe-core audit across all 10 pages,
   both authenticated and not. Found 21 violation instances (no `<main>`
   landmark anywhere in the app, one contrast failure), fixed all of them,
   re-audit confirms zero.
6. **CI format:check fix**: the `lint-and-typecheck` CI job's Prettier
   check had been failing since the original baseline commit (pure
   formatting drift, unrelated to any of the above). Reformatted the
   repo, added `.prettierignore` for harness-local `.claude/` config.

## Current state (accurate as of the commit that added this file)

Run `git log --oneline` for the authoritative list; as of this writing:

- Every top-level nav destination (`Dashboard`, `Check-in`, `Progress`,
  `Coach`, `Profile`) is a real, working page. `Admin` likewise.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and
  `npm run test --workspace=apps/consumer-web-app` (32 tests) all pass
  clean, both locally and via the `db-and-permission-tests` /
  `lint-and-typecheck` CI jobs.
- Still genuinely deferred, same as Sprint 1 — these need a product or
  business decision, not more engineering time: the wellness/readiness
  score (methodology needs product/clinical input), session/coaching
  booking (no schema, needs a real calendar-integration decision), final
  legal consent copy (needs legal review, not an engineering call), and
  live deployment (needs an actual hosting account connected — the config
  work itself isn't started).
- `services/knowledge-engine-api`, `services/pattern-prioritization-engine`,
  and `packages/mef-method-repository` are still scaffolding-only.
