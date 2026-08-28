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

## Standing rules from the 2026-08-27 bug sweep

Nine patterns that produced real, shipped bugs. Check for each of them
before you finish, and do not reintroduce one.

- **A render never decides anything.** A page render, a server component
  and a layout may read. They may not insert, claim, upsert or schedule.
  Server actions revalidate their own route, and Next prefetches a `<Link>`
  when it scrolls into view, so a render-time write repeats on every button
  press and fires for screens nobody opened. State that belongs to a
  decision is written by the explicit action she took, or from a mounted
  effect that only runs when the screen is really shown
  (`components/programs/MarkProgramOpened.tsx` is the pattern).
- **Every date names its timezone.** Never `toLocaleDateString` /
  `toLocaleTimeString` / `toLocaleString` without a `timeZone`, and never
  `new Date()` or `toISOString().slice(0, 10)` to mean "today". Display text
  goes through `lib/time/displayDate.ts`: `formatInTimeZone` with the
  member's own zone for an instant she reads, `formatDisplayDate` for a bare
  `YYYY-MM-DD` and for staff surfaces. A day boundary used as data comes
  from `lib/time/memberToday.ts` on the server and is handed down as a prop.
  `tests/no-unpinned-dates-guard.test.ts` enforces both.
- **One source of truth per number.** Any status, count or label that
  appears on more than one screen is computed in one place and read from
  there. A counted claim always names the window it counted
  ("checked in on 3 days in the last 21 days", never "3 days so far"
  beside "4 check-ins so far").
- **Every pop-up branch checks its own due-ness.** A branch in the Root
  pop-up chain may not return a candidate the outer due-check will then
  throw away, because that silences everything below it. See the header of
  `app/actions/rootPopupMessages.ts`.
- **Test accounts never reach a staff surface or an analytics figure.**
  Enforce it in the data layer through `lib/staff/testAccounts.ts`, not
  per screen, and guard member-scoped route trees with a layout rather than
  asking each page to remember.
- **Access is the plan, plus a coach assignment that only ever adds.**
  `membership.minLevel` decides what opens. An assignment can open one more
  thing for one member. Nothing else gates anything, and there is no second
  invisible lock.
- **Say only what is true today.** No undated promise, no "coming soon"
  without a date, and one name per thing everywhere a member can read it.
- **No em dash anywhere a member or coach reads**, including stored
  content in the database, which the source guard cannot see. Commas,
  periods, colons or parentheses instead.
- **Screenshots and member data stay under gitignored paths** and are never
  committed. This repository is public.

**Re-run the whole sweep before launch, and after any large multi-screen
build.** Both halves: the pattern hunt through the codebase for the classes
above, and a real signed-in walk of every member, coach and admin screen
with console and page errors captured on each one. The 2026-08-27 run is in
`docs/BUG_SWEEP_2026-08-27.md` and is the template for what a run produces.

## Member-facing exercise names

- An exercise name a member can read describes the MOVEMENT. It never mandates equipment, and it never carries vendor plumbing: no `(L)` / `(R)` side suffixes, no provider ids, no internal variant codes. "Split Squat", not "Split squat (R)"; "Goblet Squat", not "Dumbbell Goblet Squat (R)".
- Which side she works, and whether she works both, is said by the slot's per-side mark and by the exercise's own instructions, never by its name.
- **One narrow exception, and only this one:** a variant word describing HOW the movement is performed is acceptable when it is what distinguishes a genuine regression from the movement it regresses. "Bodyweight Split Squat" beside "Split Squat" is correct, because the catalog holds two different exercises and the easier one has to be tellable from the harder one on the screen where she is offered it. The test is whether dropping the word would leave two exercises sharing a name. It never licenses a vendor suffix, a provider id or a variant code, and it is not a way to smuggle equipment back into a name: "Dumbbell Goblet Squat" is still wrong, because a goblet squat is already a loaded movement and nothing is being distinguished.
- The rule applies wherever a name can reach her: `exercise_catalog`, blueprint slots, program templates, and anything a coach picker can insert. Fix it in the catalog. Never paper over it with a display-only alias, because the alias and the real name then disagree on the next screen.

## Live-site verification

- Turnstile bot protection is LIVE on the `app.mefwellness.com` login form and blocks automated form sign-in **by design**. This is not a bug and never counts as a test failure. Do not report it as one, and never ask for the captcha to be disabled.
- The standing method for signed-in live checks is a one-time session minted with the production service-role key, retired immediately after use (`admin.signOut(accessToken, 'local')`, never `'global'`). Helper: `apps/consumer-web-app/scripts/lib/mint-session.mjs`. Fetch the keys with `npx supabase projects api-keys --project-ref piafgqstbibvllsnuike --output json`, write them to files, and pass file PATHS (`PROD_SUPABASE_URL`, `PROD_SERVICE_KEY_FILE`, `PROD_ANON_KEY_FILE`) so no key reaches a command line.
- Test member credentials live in the repo-root `.env.local` as `TEST_MEMBER_EMAIL` / `TEST_MEMBER_PASSWORD`. Same handling as `SUPABASE_DB_URL`: never print, echo, log, commit or report them.
