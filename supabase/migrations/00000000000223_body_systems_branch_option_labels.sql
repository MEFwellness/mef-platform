-- The two Section 11 branch option labels, in the coach's own words.
--
-- Migration 221 seeded these two rows with placeholders, marked as such in
-- their own `note` column because the survey specification named the branch
-- question but never its two answers. They were approved on 2026-09-11:
--
--   A: Cycles, hot flashes, and monthly changes
--   B: Energy, drive, muscle, and recovery
--
-- Migration 221 now carries the approved wording, which is what a brand new
-- environment gets. Its insert is `on conflict do nothing`, so an
-- environment that already ran 221 still holds the placeholder no matter
-- how many times 221 re-runs. This migration is how those catch up.
--
-- ---------------------------------------------------------------------
-- WHY THIS MATCHES ON THE KEY AND NOTHING ELSE
-- ---------------------------------------------------------------------
--
-- The first version of this migration also matched on the placeholder
-- text, so that a hand edit made in the SQL editor could never be silently
-- overwritten by a re-run. Run against production it matched NOTHING,
-- reported success, and changed neither row. The stored value was not byte
-- identical to the text seeded from this repository, and because the rows
-- have since been corrected by hand there is no way left to see what it
-- actually held.
--
-- The lesson is not that the guard was mistyped. It is that a content
-- migration must not decide whether to write by comparing against a string
-- somebody typed twice, because the two copies can differ by a space
-- nobody can see, and the failure is silent. The key is the identity of
-- the row. The value is what this migration is for.
--
-- This does mean that a hand edit made directly in the database is
-- replaced by the wording below the next time migrations are pushed. That
-- is the intended direction: this file is the source of truth for these
-- two sentences, and a change to them belongs here.
--
-- `is distinct from` keeps it idempotent, so a re-run against a row that
-- already says the right thing leaves `updated_at` alone.

update body_systems_copy
set value = 'Cycles, hot flashes, and monthly changes',
    note = 'The specification named the branch question but not the two option labels. These words were approved by the coach on 2026-09-11 and are no longer a placeholder.',
    updated_at = now()
where copy_key = 'member.branch_option_a'
  and (
    value is distinct from 'Cycles, hot flashes, and monthly changes'
    or note is distinct from 'The specification named the branch question but not the two option labels. These words were approved by the coach on 2026-09-11 and are no longer a placeholder.'
  );

update body_systems_copy
set value = 'Energy, drive, muscle, and recovery',
    note = 'The specification named the branch question but not the two option labels. These words were approved by the coach on 2026-09-11 and are no longer a placeholder.',
    updated_at = now()
where copy_key = 'member.branch_option_b'
  and (
    value is distinct from 'Energy, drive, muscle, and recovery'
    or note is distinct from 'The specification named the branch question but not the two option labels. These words were approved by the coach on 2026-09-11 and are no longer a placeholder.'
  );

-- ---------------------------------------------------------------------
-- AND IT REFUSES TO PASS QUIETLY
-- ---------------------------------------------------------------------
--
-- An update that matches no row reports success. That is exactly how the
-- first version of this migration got through a production run without
-- doing anything, so this one reads back what it wrote and fails loudly if
-- the words on the row are not the approved ones, whether the cause is a
-- missing row, a key that was renamed or a write that never landed.

do $$
declare
  option_a text;
  option_b text;
begin
  select value into option_a from body_systems_copy where copy_key = 'member.branch_option_a';
  select value into option_b from body_systems_copy where copy_key = 'member.branch_option_b';

  if option_a is null then
    raise exception 'member.branch_option_a is missing. Migration 221 has to have run first.';
  end if;
  if option_b is null then
    raise exception 'member.branch_option_b is missing. Migration 221 has to have run first.';
  end if;
  if option_a <> 'Cycles, hot flashes, and monthly changes' then
    raise exception 'member.branch_option_a still reads %, not the approved wording.', option_a;
  end if;
  if option_b <> 'Energy, drive, muscle, and recovery' then
    raise exception 'member.branch_option_b still reads %, not the approved wording.', option_b;
  end if;
end $$;
