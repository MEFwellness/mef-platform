# Deploying consumer-web-app

No production deployment exists yet — this documents what's needed to
create one. It's written so a human with the actual accounts can execute
it directly; none of the steps below can be completed by an agent without
real account credentials.

## Prerequisites (things only a human can do)

1. **A production Supabase project.** Per the "Environment separation"
   section of the root README, production must be its own dedicated
   Supabase project — never the local CLI instance, never the dev project.
   Create it at [supabase.com](https://supabase.com), then apply the
   schema:
   ```bash
   supabase link --project-ref <production-project-ref>
   supabase db push
   ```
   Do **not** run `supabase/seed/*.sql` against production — that seed
   data creates synthetic test users (`member.one@example.test`, etc.)
   with a shared known password. It exists for local development and CI
   only.
2. **A Vercel account** with this repository connected as a project.

## Vercel project settings

This is an npm-workspaces monorepo with one deployable app. In the
Vercel dashboard, under Project Settings → General:

- **Root Directory**: `apps/consumer-web-app`
- **Framework Preset**: Next.js (auto-detected; `apps/consumer-web-app/vercel.json`
  pins this explicitly)

With Root Directory set this way, Vercel automatically runs
`npm install` from the true repository root (it detects the `workspaces`
field in the root `package.json`) and then builds only
`apps/consumer-web-app` — no custom install/build command override is
needed.

## Environment variables

Set these in Project Settings → Environment Variables, using your
**production** Supabase project's own values (from that project's
Settings → API page), separately for the Production and Preview
environments if you want previews to hit a different (e.g. staging)
Supabase project:

| Variable                        | Value                                                      |
| ------------------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Production project's API URL                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production project's anon/public key                       |
| `NEXT_PUBLIC_SITE_URL`          | The real deployed URL (e.g. `https://app.rootedreset.com`) |

`NEXT_PUBLIC_SITE_URL` matters beyond cosmetics: `app/actions/auth.ts` uses
it to build the email-confirmation and password-reset redirect URLs. If
it's left as `http://localhost:3000` in production, those emails will
send users back to a localhost link that doesn't exist for them.

**`SUPABASE_SERVICE_ROLE_KEY` is deliberately not listed above.** Per
`lib/supabase/server.ts`'s own comment, the app never uses the service
role in the request path — every read/write goes through the anon key and
is authorized by RLS. The service role is only for local seed/admin
scripts run outside the deployed app, so it has no reason to exist as a
Vercel environment variable, and shouldn't: it bypasses every RLS policy
this app relies on for security, so it should stay out of any environment
that serves live traffic.

## Supabase Auth configuration for the production URL

In the production Supabase project's Authentication → URL Configuration:

- **Site URL**: same value as `NEXT_PUBLIC_SITE_URL` above.
- **Redirect URLs**: add `<NEXT_PUBLIC_SITE_URL>/api/auth/callback` (this
  is what `app/api/auth/callback/route.ts` handles) and
  `<NEXT_PUBLIC_SITE_URL>/reset-password/confirm`.

## What's already handled by the app itself

Nothing else — the app has no deployment-specific code paths to configure.
`next.config.mjs` has no environment-specific branching, and the
Supabase clients (`lib/supabase/client.ts`, `lib/supabase/server.ts`) work
identically in every environment; they just read whichever
`NEXT_PUBLIC_SUPABASE_*` values are present.

## Verifying a deploy

After the first deploy, confirm end-to-end before treating it as live:

1. Sign up a real (non-seed) account and confirm the verification email
   arrives with a working link pointing at the real domain.
2. Log in, complete consent + onboarding, submit a check-in, confirm it
   shows up on `/dashboard` and `/progress`.
3. Confirm `/manifest.webmanifest` and `/icons/*` are reachable
   unauthenticated (`curl -I` should return `200`, not a redirect to
   `/login` — this exact bug existed once before and is covered by manual
   verification, not an automated test, since it requires a real deployed
   origin).
