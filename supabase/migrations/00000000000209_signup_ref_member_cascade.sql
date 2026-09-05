-- ---------------------------------------------------------------------
-- A SPENT REFERENCE MADE ITS OWN MEMBER UNDELETABLE, AND THE CHECK
-- CONSTRAINT I WROTE IS WHY (found on production, 2026-09-05).
--
-- WHAT HAPPENED. The live verification run for migration 208 creates
-- temporary accounts, redeems references with them, and deletes them
-- afterwards. Two of the nine refused to delete, and they were exactly the
-- two that had SPENT a reference. GoTrue returned a 5xx with no readable
-- body, which is what it always returns when a delete trips something in
-- the public schema.
--
-- WHY. public_entry_signup_refs.used_by_member_id was declared
-- `on delete set null`, and the table also carries
--
--     check ((used_at is null) = (used_by_member_id is null))
--
-- which says a row either was redeemed by somebody or was not redeemed at
-- all. Deleting the account makes Postgres set used_by_member_id to null
-- while used_at stays where it is, which is precisely the half-and-half
-- state that check exists to forbid. So the referential action and the
-- constraint contradicted each other, and the loser was the delete.
--
-- THE FIX, AND WHY IT IS CASCADE RATHER THAN A LOOSER CHECK. The check is
-- the honest statement and stays. What changes is what happens to the row
-- when the account goes: it goes too. A record saying "this reference was
-- spent by that member" has nothing left to say once that member does not
-- exist, and keeping a dangling pointer to a deleted account is the wrong
-- answer on privacy as well as on forensics. It is also what
-- member_public_entry_origin has always done with the same column.
--
-- The reference rows for an arrival already cascade from the arrival
-- itself, so this closes the only other way one could outlive its subject.
-- ---------------------------------------------------------------------

alter table public_entry_signup_refs
  drop constraint public_entry_signup_refs_used_by_member_id_fkey;

alter table public_entry_signup_refs
  add constraint public_entry_signup_refs_used_by_member_id_fkey
    foreign key (used_by_member_id) references auth.users(id) on delete cascade;

comment on column public_entry_signup_refs.used_by_member_id is
  'The account that redeemed this reference, for forensics only: nothing reads it to make a decision. Cascades with that account, because a record of who spent a reference has nothing to say once that member no longer exists, and because set null would leave the row half redeemed, which its own check constraint forbids.';
