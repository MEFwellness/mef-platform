# MEF Wellness platform monorepo

Implements Architecture v2.1 (canonical). Sprint 1 scope only — see
`docs/SPRINT_1_COMPLETION_REPORT.md` for exactly what is built vs. deferred.

## Why a monorepo

One repo, npm workspaces. Reasoning:
- `shared-types-contracts` needs to be consumed by `consumer-web-app`,
  `knowledge-engine-api`, and `pattern-prioritization-engine` with zero drift —
  a schema change should be a compile error in every consumer immediately,
  not a version-bump-and-hope across separate repos.
- Sprint 1 has one active app and two dormant service scaffolds. Polyrepo
  overhead (separate CI, separate versioning, separate release process) isn't
  earning its keep yet at this scale. Revisit if/when
  `knowledge-engine-api` and `pattern-prioritization-engine` need independent
  deploy cadences and on-call ownership — that's the natural split point.
- `supabase/` (migrations, seed, RLS) sits at the root because every app and
  service depends on the same database — it isn't owned by any single app.

## Workspace layout

```
apps/consumer-web-app        Next.js app — the only Sprint 1 product surface
services/knowledge-engine-api        scaffold only, not implemented this sprint
services/pattern-prioritization-engine  scaffold only, not implemented this sprint
packages/mef-method-repository       scaffold only, not implemented this sprint
packages/shared-types-contracts      TypeScript types generated from the DB schema
supabase/                    migrations, seed data, RLS, local dev config
```

## Local development

Prerequisites: Node 20+, npm 10+, Docker Desktop (for local Supabase), Supabase CLI.

```bash
npm install
npx supabase start                 # boots local Postgres + Auth + Studio
npx supabase db reset               # applies every migration in supabase/migrations, then seed/seed.sql
cp apps/consumer-web-app/.env.local.example apps/consumer-web-app/.env.local
# fill in the local values supabase start prints to stdout
npm run dev --workspace=apps/consumer-web-app
```

Local Supabase Studio: http://localhost:54323
App: http://localhost:3000

## Environment separation

Three environments, three separate Supabase projects, never shared credentials:

| Environment | Supabase project | Secrets location |
|---|---|---|
| local | `supabase start` (Docker, ephemeral) | `.env.local` (gitignored) |
| development | dedicated dev Supabase project | CI/hosting provider secrets store |
| production | dedicated prod Supabase project | CI/hosting provider secrets store, restricted access |

No production secret is ever committed, printed in a migration, or hardcoded.
`.env.local.example` contains placeholder values only.

## Branch strategy

- `main` — always deployable, protected, requires passing CI + 1 review
- `develop` — integration branch for the current sprint
- `feature/<short-description>` — cut from `develop`, merged back via PR
- Migrations are additive-only on `main` — a migration once merged is never
  edited, only superseded by a new migration (matches the append-only pattern
  used throughout the schema itself)

## Testing

```bash
npm run test --workspace=apps/consumer-web-app        # permissions + core data flow tests
```

Tests run against a local Supabase instance (`supabase start` must be running)
using real RLS — they are integration tests against real Postgres policies,
not mocks, because the whole point of Sprint 1 is proving the database itself
enforces access control.
