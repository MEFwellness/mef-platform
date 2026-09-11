-- Three new lines for the MEF Body Systems Survey, added with the blind
-- sections change on 2026-09-11.
--
-- WHY A MIGRATION OF ITS OWN. Migration 221 is where this survey's words
-- live, and it now carries all three, which is what a brand new
-- environment gets. Its insert is `on conflict do nothing` and it has
-- already run everywhere else, so an existing environment would never see
-- a row added to it. This is how those catch up, and it is the same shape
-- migration 223 used for the two branch option labels.
--
-- WHAT THE THREE ARE FOR
--
--   member.section_heading is the heading on all eleven section screens.
--   While she is answering, no screen names the body system its questions
--   belong to: a member who can see that she is on the digestion questions
--   answers the digestion questions differently, and the whole point of
--   the survey is what she would say if nobody had told her what was being
--   measured. The heading therefore names the TASK, and the names are
--   revealed on her results screen beside the bars.
--
--   member.intro_line_4 tells her that, once, before she starts, so the
--   unnamed sections read as deliberate rather than as something missing.
--
--   member.legend_label is the accessible name of the legend that now
--   explains the three loudness bands once above her graph, in place of
--   the same three sentences repeated under all eleven bars.
--
-- It writes by KEY and reads back what it wrote, for the reason migration
-- 223's header sets out at length: a content migration that decides what
-- to do by comparing against a string somebody typed twice can match
-- nothing, report success, and change nothing.

insert into body_systems_copy (copy_key, value, audience, note)
values
  ('member.section_heading', 'How often has this been true?', 'member', 'The heading on all eleven section screens. It names the task, never the body system, because she answers blind.'),
  ('member.intro_line_4', 'You will not see which part of your body a section is about while you answer. That is on purpose, and every name is on your results at the end.', 'member', 'Added 2026-09-11 with the blind sections change. She is told once, up front, why the sections are unnamed.'),
  ('member.legend_label', 'What the three loudness bands mean', 'member', 'The accessible name of the legend above her graph. Read by a screen reader, not drawn on the screen.')
on conflict (copy_key) do update
set value = excluded.value,
    audience = excluded.audience,
    note = excluded.note,
    updated_at = now()
where body_systems_copy.value is distinct from excluded.value
   or body_systems_copy.note is distinct from excluded.note;

-- And it refuses to pass quietly.
do $$
declare
  missing text[];
begin
  select array_agg(key order by key)
    into missing
  from unnest(array[
    'member.section_heading',
    'member.intro_line_4',
    'member.legend_label'
  ]) as key
  where not exists (
    select 1 from body_systems_copy
    where copy_key = key and audience = 'member' and length(trim(value)) > 0
  );

  if missing is not null then
    raise exception 'body systems copy rows missing after this migration: %', array_to_string(missing, ', ');
  end if;
end $$;
