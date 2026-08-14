-- Repair: auth.users rows whose token columns are NULL instead of empty
-- strings.
--
-- WHAT BREAKS, AND WHY IT LOOKS LIKE SOMETHING ELSE. GoTrue (the Supabase
-- auth service) scans several auth.users columns into plain Go strings, not
-- into pointers. A NULL in any of them makes the scan fail for the WHOLE
-- QUERY, not just for that row. The visible symptoms are therefore wildly
-- disproportionate to the cause, and neither of them mentions the real
-- problem:
--
--   * signing in as the affected account returns
--     500 "Database error querying schema"
--   * auth.admin.listUsers() returns 500 with an empty body `{}`, for EVERY
--     caller, because listing users selects every row and one bad row poisons
--     the result set
--
-- One malformed row can therefore take down the admin users API for an entire
-- project while every other part of the app carries on working normally.
--
-- HOW A ROW ENDS UP LIKE THIS. Only by being inserted with SQL rather than
-- through the Auth Admin API. GoTrue writes '' in these columns; a hand
-- written INSERT that simply omits them gets NULL. That is exactly what
-- happened to info@mefwellness.com on 2026-08-14, and is why
-- scripts/provision-admin-account.mjs now insists on the Admin API and this
-- file exists to clean up after the one time it was not used.
--
-- SAFE AND IDEMPOTENT. Only ever rewrites NULL to '', never touches a real
-- token, and never changes a password, an email, a confirmation state or a
-- role. Running it twice does nothing the second time. Running it when
-- nothing is broken reports zero rows repaired.
--
-- Run against production with the session-mode pooler URL from the repo-root
-- .env.local (CLAUDE.md step 6a), the same credential migrations use.

\echo '=== before: rows with at least one NULL token column ==='
select count(*) as rows_needing_repair
from auth.users
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null
   or email_change_token_current is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;

update auth.users set
  confirmation_token          = coalesce(confirmation_token, ''),
  recovery_token              = coalesce(recovery_token, ''),
  email_change                = coalesce(email_change, ''),
  email_change_token_new      = coalesce(email_change_token_new, ''),
  email_change_token_current  = coalesce(email_change_token_current, ''),
  phone_change                = coalesce(phone_change, ''),
  phone_change_token          = coalesce(phone_change_token, ''),
  reauthentication_token      = coalesce(reauthentication_token, ''),
  email_change_confirm_status = coalesce(email_change_confirm_status, 0)
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null
   or email_change_token_current is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;

\echo '=== after: must be zero ==='
select count(*) as rows_still_needing_repair
from auth.users
where confirmation_token is null
   or recovery_token is null
   or email_change is null
   or email_change_token_new is null
   or email_change_token_current is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;
