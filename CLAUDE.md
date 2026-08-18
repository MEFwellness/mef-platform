Read /docs/BUILD_STATUS.md before starting any task. Update it at the end of every task with what changed.

## Completion Workflow

Applies to every task unless the user says otherwise.

1. Implement the requested changes. If the request is ambiguous, ask before building — don't guess.
2. Reuse existing systems. Do not duplicate or replace working code. If an implementation of this already exists, say so in your report.
3. Run typecheck, lint, and project validation checks.
4. Run all relevant tests and fix failures.
5. Run the production build and resolve build errors.
6. Commit with a clear message and push. You are authorized to commit and push as part of this workflow without asking each time.
6a. Apply your own database migrations to production. The session-mode pooler URL lives in `SUPABASE_DB_URL` in the repo-root `.env.local` (gitignored, untracked): `export $(grep -E "^SUPABASE_DB_URL=" .env.local | head -1)` then `npx supabase db push --db-url "$SUPABASE_DB_URL"`. Never print, echo, log, commit or report that value, and redact any command output that could contain it.
7. Before and after deploying, confirm and report: correct repo, current branch, connected Vercel project, Preview vs Production, and that the domain points to this deployment. If anything is wrong, stop and explain it in plain language.
8. Update /docs/BUILD_STATUS.md to reflect what is now built.
9. Do not claim you verified the live site — you cannot see it. State only what you actually checked.
10. Provide a report containing: what you completed in plain language with no jargon, anything left unfinished or that didn't work, and a click-by-click checklist for the user to test on the site — screen by screen, what to tap, what they should see.

## Member-facing exercise names

- An exercise name a member can read describes the MOVEMENT. It never mandates equipment, and it never carries vendor plumbing: no `(L)` / `(R)` side suffixes, no provider ids, no internal variant codes. "Split Squat", not "Split squat (R)"; "Goblet Squat", not "Dumbbell Goblet Squat (R)".
- Which side she works, and whether she works both, is said by the slot's per-side mark and by the exercise's own instructions, never by its name.
- **One narrow exception, and only this one:** a variant word describing HOW the movement is performed is acceptable when it is what distinguishes a genuine regression from the movement it regresses. "Bodyweight Split Squat" beside "Split Squat" is correct, because the catalog holds two different exercises and the easier one has to be tellable from the harder one on the screen where she is offered it. The test is whether dropping the word would leave two exercises sharing a name. It never licenses a vendor suffix, a provider id or a variant code, and it is not a way to smuggle equipment back into a name: "Dumbbell Goblet Squat" is still wrong, because a goblet squat is already a loaded movement and nothing is being distinguished.
- The rule applies wherever a name can reach her: `exercise_catalog`, blueprint slots, program templates, and anything a coach picker can insert. Fix it in the catalog. Never paper over it with a display-only alias, because the alias and the real name then disagree on the next screen.

## Live-site verification

- Turnstile bot protection is LIVE on the `app.mefwellness.com` login form and blocks automated form sign-in **by design**. This is not a bug and never counts as a test failure. Do not report it as one, and never ask for the captcha to be disabled.
- The standing method for signed-in live checks is a one-time session minted with the production service-role key, retired immediately after use (`admin.signOut(accessToken, 'local')`, never `'global'`). Helper: `apps/consumer-web-app/scripts/lib/mint-session.mjs`. Fetch the keys with `npx supabase projects api-keys --project-ref piafgqstbibvllsnuike --output json`, write them to files, and pass file PATHS (`PROD_SUPABASE_URL`, `PROD_SERVICE_KEY_FILE`, `PROD_ANON_KEY_FILE`) so no key reaches a command line.
- Test member credentials live in the repo-root `.env.local` as `TEST_MEMBER_EMAIL` / `TEST_MEMBER_PASSWORD`. Same handling as `SUPABASE_DB_URL`: never print, echo, log, commit or report them.
