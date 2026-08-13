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
