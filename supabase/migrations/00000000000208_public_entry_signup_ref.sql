-- ---------------------------------------------------------------------
-- THE THIRD JOIN: A ONE-TIME REFERENCE THAT RIDES HER OWN BUTTON.
--
-- THE GAP THIS CLOSES, MEASURED ON PRODUCTION (2026-09-05).
-- A visitor finished "Where Your Energy Goes" on her phone at 09:06, read
-- her result, tapped Create a free account at 09:11, and confirmed her
-- email at 09:12. Her account came out bound to nothing: no origin row, no
-- acquisition row, and a completed quiz session sitting one table away with
-- nobody attached to it.
--
-- Nothing was broken in the two joins migration 207 left in place. They
-- simply could not reach:
--
--   The BROWSER TOKEN join happens in the claim route, and the claim route
--   needs a signed-in session. Between tapping the button and confirming
--   the email she has no session at all, and the confirmation link opens in
--   whatever browser her mail app uses, which holds no token. The token is
--   sitting in the browser that took the quiz, and that browser is on the
--   verify screen, signed out, possibly forever.
--
--   The EMAIL MATCH join needs an address on the finished quiz session, and
--   the email step on the result screen is optional. She skipped it, which
--   is what most people do.
--
-- So the signup form said, truthfully, "this browser is holding a token",
-- the email match was skipped on that word, and the bind was left to a
-- claim that could not run. Every path was closed at once for the second
-- time in one day, by a different mechanism.
--
-- WHAT IS ADDED. The create-account button on her own result screen now
-- carries a reference to the arrival she just finished, and the signup
-- SERVER redeems it while it is creating her account. The bind therefore
-- happens in the same request that makes the account, before any email is
-- confirmed and before any browser is signed in anywhere.
--
-- THE RULE THIS SUPERSEDES, AND WHY IT IS SAFE TO SUPERSEDE IT HERE.
-- The standing rule was that a browser may never name an arrival at signup,
-- because anything a browser can name, a browser can invent. That rule is
-- exactly right for the visitor token, which is minted by the browser, kept
-- forever, and reusable without limit. It is not the same object as this
-- one. This reference is:
--
--   SERVER MINTED. It is issued by the server, in response to the request
--   that finished the quiz, and the browser never chooses its value.
--   Thirty two bytes from the platform's own random source, so it cannot be
--   guessed and cannot be walked.
--
--   SINGLE USE. Redeeming it is one conditional UPDATE that only matches an
--   unused row, so two requests carrying the same reference cannot both
--   win. The second one matches nothing and binds nothing.
--
--   SESSION SPECIFIC. It names one finished arrival and can never name
--   another, so a redeemed reference cannot be pointed at a different
--   session than the one it was issued for.
--
--   EXPIRING. Twenty four hours. Long enough for somebody who taps the
--   button in the morning and finishes signing up that evening, short
--   enough that a link left in a browser history is dead by the next day.
--
--   POWERLESS ON ITS OWN. Redeeming it can only ever ADD a bind that does
--   not exist yet. member_public_entry_origin keeps member_id as its
--   primary key and session_id unique, so first bind still wins, and a
--   reference to an arrival somebody else already claimed loses, finally,
--   with nothing to retry.
--
--   NOT A SECRET ABOUT ANYBODY. It encodes no answer, no pattern, no email
--   and no member. It is an opaque handle and nothing else.
--
-- WHAT IT IS STILL NOT. It is not proof of identity and is not treated as
-- any. It says "the browser that finished this quiz is the browser that
-- started this signup", which is a statement about a device, and that is
-- exactly the statement bind_method now records it as.
-- ---------------------------------------------------------------------

-- Migration 207 added the check inline, so its name was chosen by Postgres
-- rather than by us. Found by its definition instead of trusted to be
-- spelled a particular way, because a guessed constraint name is a
-- migration that fails on the one database that matters.
do $$
declare
  existing text;
begin
  select conname into existing
  from pg_constraint
  where conrelid = 'member_public_entry_origin'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%bind_method%';
  if existing is not null then
    execute format('alter table member_public_entry_origin drop constraint %I', existing);
  end if;
end $$;

alter table member_public_entry_origin
  add constraint member_public_entry_origin_bind_method_check
    check (bind_method in ('browser_token', 'email_match', 'signup_link'));

comment on column member_public_entry_origin.bind_method is
  'How this member was joined to this arrival, recorded rather than inferred, because the three routes are three different strengths of statement. browser_token: her own browser handed over the visitor token it minted when she took the quiz, and was signed in when it did. signup_link: she tapped the create-account button on her own finished result and the signup server redeemed the one-time reference that button carried, in the same request that created her account. email_match: nothing was carried at all, and the address she left on a finished quiz is exactly the address she later signed up with. The first two are statements about a device; the third is a statement about a self-entered, unverified address, and is the weakest of the three.';

-- ---------------------------------------------------------------------
-- The references themselves
-- ---------------------------------------------------------------------

create table public_entry_signup_refs (
  id uuid primary key default gen_random_uuid(),

  -- THE HASH, NEVER THE REFERENCE. The value itself exists in exactly two
  -- places: the response that issued it, and the link in her browser. What
  -- is stored is its SHA-256, so a copy of this table is not a bag of
  -- working references, and reading the row cannot tell anybody what to
  -- send. Same reasoning a password digest is stored rather than a
  -- password, applied to a much smaller secret with a much shorter life.
  ref_hash text not null unique check (ref_hash ~ '^[0-9a-f]{64}$'),

  -- Exactly one finished arrival, for the whole life of the reference.
  session_id uuid not null references public_entry_sessions(id) on delete cascade,

  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,

  -- Redemption is a conditional UPDATE against `used_at is null`, which is
  -- what makes single use a property of the database rather than of the
  -- order two requests happened to arrive in.
  used_at timestamptz,
  used_by_member_id uuid references auth.users(id) on delete set null,

  -- What redeeming it actually resolved to. A redeemed reference whose
  -- session already belonged to somebody records that here, so a support
  -- question about a member with no arrival has an answer instead of a
  -- silence.
  outcome text check (outcome in ('bound', 'session_taken', 'member_already_bound', 'session_unfinished', 'failed')),

  constraint public_entry_signup_refs_used_together
    check ((used_at is null) = (used_by_member_id is null))
);

create index public_entry_signup_refs_session_idx on public_entry_signup_refs (session_id, issued_at desc);
create index public_entry_signup_refs_expiry_idx on public_entry_signup_refs (expires_at) where used_at is null;

comment on table public_entry_signup_refs is
  'One-time, server-minted, expiring references that let the create-account
   button on a finished public entry result carry that arrival into the
   signup request, so the bind no longer depends on which browser later
   confirms the email. Only the SHA-256 of each reference is stored. The
   only thing redeeming one can do is add a bind that does not exist yet:
   member_public_entry_origin keeps first bind wins on its own keys.';

-- ---------------------------------------------------------------------
-- RLS: service role only, like every other table in this feature
-- ---------------------------------------------------------------------
--
-- No policy for anybody. Not the member, not a coach, not an administrator.
-- There is nothing here a human screen needs to read, and a reference is
-- the one value in this feature that is worth something to whoever holds
-- it, so the smallest possible set of readers is nobody. The route handler
-- that issues them and the signup action that redeems them both run with
-- the service role, exactly as the rest of this feature's writes already
-- do (migration 197).

alter table public_entry_signup_refs enable row level security;
