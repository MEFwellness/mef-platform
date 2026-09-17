-- ---------------------------------------------------------------------
-- The Rooted Reset Health Appraisal Questionnaire: THE TEN PARTS, BY NAME.
--
-- A Part had a numeral and nothing else, so a member read "Part III" above
-- "Thyroid" and was never told what Part III was about. These are the names
-- she reads instead: on every question screen, and at a Part boundary
-- ("Gastrointestinal complete", then "Next: Liver / Gallbladder").
--
-- THE NUMERAL IS KEPT, AND NOTHING PRINTS IT. part_label still holds
-- "Part III" for anything that needs the instrument's own printed heading.
-- The only numbering a member now sees is "Part X of 10" over the thin line.
--
-- NOTHING OF THE INSTRUMENT MOVES. No question wording, no question id, no
-- response type, no cutoff, no hidden value and no section title changes
-- here. haq_sections keeps every column it had; this migration only adds a
-- table beside it and a foreign key from it.
--
-- READABLE BY ANY SIGNED IN USER, exactly like haq_sections and
-- haq_questions: a Part name is content, not a score. The tables that hold
-- numbers (haq_response_scale, haq_section_cutoffs, haq_question_responses,
-- haq_section_results) are untouched and still have no member policy.
--
-- GENERATED FROM ONE AUTHORED SOURCE. The VALUES block below is printed by
-- `npx tsx apps/consumer-web-app/scripts/print-haq-sql.mjs` from
-- lib/haq/questionBank.ts, and tests/haq-content.test.ts regenerates it and
-- asserts this file still contains it character for character.
-- ---------------------------------------------------------------------

create table haq_parts (
  part_id text primary key,
  haq_version text not null default 'haq_v1',
  -- The instrument's own printed heading, "Part III".
  part_label text not null,
  -- What the Part is about, which is what a member reads.
  part_name text not null check (length(btrim(part_name)) > 0),
  display_order int not null unique,
  created_at timestamptz not null default now(),
  unique (part_label)
);

insert into haq_parts (part_id, part_label, part_name, display_order) values
    ('haq_p1', 'Part I', 'Gastrointestinal', 1),
    ('haq_p2', 'Part II', 'Liver / Gallbladder', 2),
    ('haq_p3', 'Part III', 'Endocrine', 3),
    ('haq_p4', 'Part IV', 'Glucose Regulation', 4),
    ('haq_p5', 'Part V', 'Cardiovascular', 5),
    ('haq_p6', 'Part VI', 'Mood', 6),
    ('haq_p7', 'Part VII', 'Eyes, Ears, Nose, Throat & Lungs', 7),
    ('haq_p8', 'Part VIII', 'Kidney & Bladder', 8),
    ('haq_p9', 'Part IX', 'Musculoskeletal', 9),
    ('haq_p10', 'Part X', 'CNS & Brain', 10);

alter table haq_parts enable row level security;

create policy authenticated_read_haq_parts on haq_parts
  for select using (auth.role() = 'authenticated');

-- A section's part_id was free text until now. It is a real reference from
-- here on, so a section can never name a Part that does not exist.
alter table haq_sections
  add constraint haq_sections_part_fk foreign key (part_id) references haq_parts(part_id);

-- Every one of the 21 sections must sit in one of the ten Parts, and every
-- Part must own at least one section. A seed that satisfied neither would be
-- a Part name nobody ever reads, or a section with no Part.
do $$
declare
  v_orphan_sections int;
  v_empty_parts int;
begin
  select count(*) into v_orphan_sections
  from haq_sections s
  where not exists (select 1 from haq_parts p where p.part_id = s.part_id);

  select count(*) into v_empty_parts
  from haq_parts p
  where not exists (select 1 from haq_sections s where s.part_id = p.part_id);

  if v_orphan_sections > 0 or v_empty_parts > 0 then
    raise exception 'HAQ parts seed is wrong: % sections with no part, % parts with no section',
      v_orphan_sections, v_empty_parts;
  end if;
end $$;
