-- The two Section 11 branch option labels, in the coach's own words.
--
-- Migration 221 seeded these two rows with placeholders, marked as such in
-- their own `note` column because the survey specification named the branch
-- question but never its two answers. They were approved on 2026-09-11.
--
-- Migration 221 now carries the approved wording, which is what a brand new
-- environment gets. Its insert is `on conflict do nothing`, so an
-- environment that already ran 221 still holds the placeholder. This
-- migration is how those environments catch up.
--
-- Scoped to exactly those two keys, matched on the placeholder text as well
-- as the key, so a later hand edit made in the SQL editor is never silently
-- overwritten by a re-run.

update body_systems_copy
set value = 'Cycles, hot flashes, and monthly changes',
    note = 'The specification named the branch question but not the two option labels. These words were approved by the coach on 2026-09-11 and are no longer a placeholder.',
    updated_at = now()
where copy_key = 'member.branch_option_a'
  and value = 'The set about cycles, hot flashes and monthly changes';

update body_systems_copy
set value = 'Energy, drive, muscle, and recovery',
    note = 'The specification named the branch question but not the two option labels. These words were approved by the coach on 2026-09-11 and are no longer a placeholder.',
    updated_at = now()
where copy_key = 'member.branch_option_b'
  and value = 'The set about energy, drive, muscle and recovery';
