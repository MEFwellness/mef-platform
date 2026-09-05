-- ---------------------------------------------------------------------
-- THE QUIZ BINDING GETS A SECOND JOIN, AND SAYS WHICH ONE IT USED.
--
-- WHAT WENT WRONG, AND IT WAS FOUND ON A REAL PHONE (2026-09-05).
-- A visitor finished "Where Your Energy Goes", tapped the create-account
-- button on her own result screen, and finished the real signup form. Her
-- account came out with NO bound arrival at all, so nothing downstream that
-- reads member_public_entry_origin (the welcome, the trial arc's fatigue
-- callback, day 6's recap card, day 7's close) had anything to say about
-- the quiz she had just taken.
--
-- The cause was that the bind had exactly ONE join, and it went through the
-- browser: the visitor token in localStorage. Three shapes break it, and
-- all three are ordinary rather than exotic.
--
--   1. The token names a session that already belongs to somebody else.
--      This is what actually happened: the phone still held the token from
--      an earlier scan of the same QR card, so it resumed that session, and
--      that session had already been claimed by another account. First bind
--      wins is correct and must stay, but the losing member was left with
--      nothing and her browser retried forever.
--   2. The quiz is taken on a phone and the account is created on a laptop.
--      The token never travels, so nothing is ever carried.
--   3. The browser clears storage between the quiz and the signup.
--
-- THE SECOND JOIN IS HER EMAIL ADDRESS, and it is the same join the
-- acquisition build already added for attribution in migration 200. That
-- one deliberately stopped short of writing this table. It is being taken
-- the rest of the way here, on purpose and with the reasoning stated,
-- because "she finished the quiz on her phone and signed up on her laptop"
-- turned out to describe the ordinary case rather than an edge one.
--
-- WHY THAT IS SAFE ENOUGH TO DO, stated as the four conditions the code
-- enforces (lib/public-entry/data.ts, bindOriginFromEmailMatch):
--
--   a. The session must be COMPLETE. An abandoned quiz binds to nobody.
--   b. The session must be UNBOUND. session_id is unique below, so first
--      bind still wins and no existing bind can be re-pointed.
--   c. The member must have no origin row already. member_id is the primary
--      key, so the same is true from her side.
--   d. The addresses must match exactly (case normalised), and the account
--      must have been created after the arrival and inside a bounded window
--      of the address being left. A quiz answered a year ago does not
--      attach itself to somebody signing up today.
--
-- WHAT IS STILL TRUE AFTERWARDS. The lead email on a public entry session
-- is self-entered and unverified, so an email match is a weaker statement
-- than a browser carrying its own token. It is therefore RECORDED as a
-- weaker statement rather than laundered into the same fact.
--
-- bind_method is that record. It is not a default a later update could
-- quietly flip: this table already refuses UPDATE to every role but the
-- service role, and 'browser_token' is what every existing row genuinely
-- was, since the browser claim is the only writer that has ever existed.
-- ---------------------------------------------------------------------

alter table member_public_entry_origin
  add column bind_method text not null default 'browser_token'
    check (bind_method in ('browser_token', 'email_match'));

comment on column member_public_entry_origin.bind_method is
  'How this member was joined to this arrival. browser_token: her own browser handed over the visitor token it minted when she took the quiz. email_match: the address she left on the finished quiz is exactly the address she later created her account with, matched server side because no browser carried anything. The second is a weaker statement than the first and is stored as one rather than being folded into it.';

-- Every row that exists today was written by the browser claim, which was
-- the only writer there has ever been. Stated rather than assumed.
update member_public_entry_origin set bind_method = 'browser_token' where bind_method is distinct from 'browser_token';

-- The email match's own lookup: find a finished, unbound arrival by the
-- address left on it. Partial and lower-cased, because that is exactly the
-- comparison the code makes and an index on the raw column would not serve
-- it.
create index if not exists public_entry_sessions_lead_email_idx
  on public_entry_sessions (lower(lead_email))
  where lead_email is not null;
