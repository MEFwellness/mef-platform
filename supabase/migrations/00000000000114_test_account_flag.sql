-- Production test accounts (Part 1 of the daily-loop follow-up batch):
-- a real member account and a real coach account are being seeded
-- directly in production so every future task can verify against a real
-- logged-in session on app.mefwellness.com, not just a local copy. They
-- must never be mistaken for real members: never counted in an admin
-- member list, never shown in a real coach's caseload, never included in
-- any future aggregate/analytics query.
--
-- `is_test` is a plain, always-populated boolean (not null, default
-- false) rather than a nullable flag, so every query that needs to
-- exclude test accounts can use a simple `is_test = false` filter with no
-- null-handling edge case, and every existing row is unambiguously real
-- (false) the moment this migration runs -- no backfill step needed.
alter table profiles add column is_test boolean not null default false;

comment on column profiles.is_test is
  'True only for seeded QA/test accounts (production test member + coach,
   see docs/PRODUCTION_TEST_ACCOUNTS.md). Every admin-facing user list and
   coach-facing caseload query must exclude is_test = true rows so a test
   account can never be confused with a real member or inflate a real
   count. A coach who is themself a test account (is_test = true) is the
   one deliberate exception -- they still see their own assigned test
   member, since that pairing is the intended QA fixture, not a leak.';
