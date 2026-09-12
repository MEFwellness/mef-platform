-- The MEF Whole-Body Signal Assessment: nine sections, ninety six
-- questions, one branching section, and a practitioner reading a member
-- never sees.
--
-- IT IS A NEW INSTRUMENT. It is not the MEF Body Systems Survey
-- (migrations 220 to 224) and it is not the legacy Whole-Body Check-In in
-- the assessment registry. Nothing in this migration reads, writes,
-- renames or retires either of them. They keep their own tables, their own
-- content and their own bands, and a change to this instrument's cut offs
-- can never move theirs.
--
-- WHO GETS IT. A coach assignment, and nothing else. Same rule as every
-- coach assigned experience beside it (migrations 190, 211 through 220):
-- no tier lock, no visibility key, no grant column and no second flag.
-- assessment_assignments (migration 77) is the ledger, which is what gives
-- this the coach write RLS, the one pending row per member partial unique
-- index (migration 144), and the trigger that closes an assignment out.
--
-- EVERY WORD AND EVERY NUMBER IS A ROW. Sections, questions, the five
-- point scale with both of its point maps, the reverse score flag, the
-- routing question, the branch rules, the four bands and their cut offs,
-- the six Zones with their spinal segments and organ lists, the three
-- Signal Load weights, the cross section pattern rules, the whole coaching
-- question library, and every member facing and coach facing line. A coach
-- correcting any of it needs no deploy.
--
-- TWO LAYERS, AND THE SEPARATION IS PHYSICAL. The member layer speaks in
-- band language and plain themes. The coach layer holds Zones, chakra
-- lenses, organ and gland lists, colours, percentages, answer level
-- drivers and the coaching question library. They are different tables,
-- read by different modules, and the practitioner tables carry NO member
-- select policy at all, so a member session asking for a Zone row directly
-- gets none. That is the fence, in the database, rather than a convention
-- a screen has to remember.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/whole-body-signal/constants.ts exactly, so every
-- environment resolves this experience to the same definition. Same
-- convention as migrations 70, 190, 211 through 220.
insert into assessment_definitions (id, key, display_name, category)
values (
  '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36',
  'whole-body-signal',
  'MEF Whole-Body Signal Assessment',
  'whole_body_signal'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36', 1,
  'Initial version. Nine sections, ninety six questions, one branching section, all content stored as rows.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. The Zone reference map. COACH ONLY, permanently.
-- ---------------------------------------------------------------------

-- The six Zones, each with the spinal segments, the organ and gland list
-- and the chakra lens exactly as the practitioner approved them.
--
-- THIS TABLE HAS NO MEMBER POLICY AND NEVER MAY. A member never reads a
-- Zone, a spinal segment, an organ, a gland or a chakra, so the words are
-- not merely undrawn on her screens: her session cannot fetch the row.
--
-- NO EXERCISE, INSTRUCTION, MEDIA OR HINT LIVES HERE, and no column exists
-- for one. The app identifies Zone patterns and says nothing about what to
-- do with them, on either side.
create table whole_body_signal_zones (
  zone_key text primary key,
  position integer not null,
  display_name text not null,
  spinal_segments text not null,
  organ_gland_list text not null,
  chakra_lens text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index whole_body_signal_zones_position_idx
  on whole_body_signal_zones (position);

-- ---------------------------------------------------------------------
-- 3. The nine sections.
-- ---------------------------------------------------------------------

-- purpose_line is the practitioner's own description of what the section
-- covers, verbatim from the specification. member_transition_line is the
-- single calm line she reads on the section's transition screen. They are
-- two columns rather than one, because the first is a note to a coach and
-- the second is a sentence a member reads, and collapsing them is how a
-- coach's shorthand ends up on her screen.
--
-- motion_cue names the abstract motion its transition screen plays. A key,
-- never a colour and never a chakra, so a coach can move a section without
-- a designer and a renderer that does not know a key falls back to stillness.
create table whole_body_signal_sections (
  section_key text primary key,
  position integer not null,
  display_name text not null,
  purpose_line text not null,
  member_transition_line text not null,
  -- The section named in plain member words, for the one sentence her
  -- section card prints ("Your answers suggest ... patterns are showing up
  -- strongly right now"). A separate column from display_name because that
  -- sentence needs a phrase, not a title, and building one by lowercasing
  -- a title is how a screen ends up saying "your answers suggest hormone &
  -- pelvic rhythm patterns".
  member_area_phrase text not null,
  motion_cue text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index whole_body_signal_sections_position_idx
  on whole_body_signal_sections (position);

-- ---------------------------------------------------------------------
-- 4. The questions.
-- ---------------------------------------------------------------------

-- One question, with everything that decides what it scores and where it
-- contributes.
--
-- direction is 'direct' or 'reverse'. A reverse question converts Never to
-- four points and Almost Always to nought, and THE MEMBER NEVER SEES ANY
-- DIFFERENCE: the five options read identically on every screen.
--
-- primary_zone_key contributes at full weight and secondary_zone_key at
-- half, which is the Zone rollup's whole definition and is stored here
-- rather than repeated in code.
--
-- coach_topic and organ_gland are PRACTITIONER FIELDS. Neither is ever
-- sent to a member surface. member_theme is the plain language name for
-- the same thing, and it is NOT NULL on purpose: a nullable column with a
-- fallback to coach_topic would be a practitioner label one missing row
-- away from her screen.
--
-- feeds_section_key records the specification's "also feeds" column. It is
-- provenance a coach can read, and it changes no arithmetic: a question
-- scores in its own section and nowhere else, because a question counted
-- twice would make two sections lie about each other.
--
-- branch_group and is_universal are how Section 8 decides what to ask.
-- A universal question is asked of everybody who reaches the section
-- whatever they answered to the routing question; a branch_group question
-- is asked only when a branch rule names it.
create table whole_body_signal_questions (
  question_ref text primary key,
  section_key text not null references whole_body_signal_sections(section_key) on delete cascade,
  position integer not null,
  prompt text not null,
  direction text not null check (direction in ('direct', 'reverse')),
  primary_zone_key text not null references whole_body_signal_zones(zone_key),
  secondary_zone_key text references whole_body_signal_zones(zone_key),
  organ_gland text not null,
  coach_topic text not null,
  member_theme text not null,
  feeds_section_key text references whole_body_signal_sections(section_key) on delete set null,
  branch_group text,
  is_universal boolean not null default false,
  allows_pnta boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A Zone cannot be its own secondary. A question contributing to one
  -- Zone at 1.0 and again at 0.5 would inflate that Zone against every
  -- other one, silently.
  constraint whole_body_signal_questions_distinct_zones
    check (secondary_zone_key is null or secondary_zone_key <> primary_zone_key)
);

create index whole_body_signal_questions_section_idx
  on whole_body_signal_questions (section_key, position);

-- ---------------------------------------------------------------------
-- 5. The five option response scale, with BOTH point maps.
-- ---------------------------------------------------------------------

-- direct_points and reverse_points are two stored columns rather than one
-- column and a subtraction, so a coach who retunes the scale retunes both
-- halves explicitly and nothing in code has to know what the top of the
-- scale is in order to flip it.
create table whole_body_signal_scale_options (
  value_key text primary key,
  position integer not null,
  label text not null,
  direct_points integer not null,
  reverse_points integer not null,
  is_active boolean not null default true
);

create unique index whole_body_signal_scale_options_position_idx
  on whole_body_signal_scale_options (position);

-- ---------------------------------------------------------------------
-- 6. The bands. THIS INSTRUMENT'S OWN, and nobody else's.
-- ---------------------------------------------------------------------

-- min_percent is inclusive, max_percent is exclusive, and the loudest band
-- leaves max_percent null so it is open ended.
--
-- member_label and member_line are the only band words a member ever
-- reads. coach_color is the coach's colour and has no member policy path
-- to a member screen: the member payload has no field to carry it.
--
-- member_intensity_word is the plain word the vertical signal landscape
-- labels a bar with. It exists so her results can show relative loudness
-- without a percentage anywhere in the payload.
--
-- NO GLOBAL THRESHOLD SET IS CREATED OR TOUCHED HERE. body_systems_bands
-- is a different table for a different instrument and is left exactly as
-- it is.
create table whole_body_signal_bands (
  band_key text primary key,
  position integer not null,
  min_percent numeric not null,
  max_percent numeric,
  member_label text not null,
  member_line text not null,
  member_intensity_word text not null,
  coach_color text not null check (coach_color in ('green', 'yellow', 'orange', 'red'))
);

create unique index whole_body_signal_bands_position_idx
  on whole_body_signal_bands (position);

-- ---------------------------------------------------------------------
-- 7. Section 8's routing question and its branch rules.
-- ---------------------------------------------------------------------

-- The six options of the routing question. NOT SCORED: there is no points
-- column and there never may be, because "which of these describes you"
-- is not a signal about anything.
create table whole_body_signal_routing_options (
  option_key text primary key,
  position integer not null,
  label text not null,
  /** The Prefer not to answer option. Carries no branch rule of its own. */
  is_pnta boolean not null default false,
  is_active boolean not null default true
);

create unique index whole_body_signal_routing_options_position_idx
  on whole_body_signal_routing_options (position);

-- Which conditional questions one routing answer opens.
--
-- THE UNIVERSAL SET IS NOT LISTED HERE. It is marked on the questions
-- themselves (is_universal), so an option with no rule row still asks the
-- universal four rather than asking nothing. That is the difference
-- between "this branch adds nothing" and "this branch is broken".
create table whole_body_signal_branch_rules (
  option_key text primary key references whole_body_signal_routing_options(option_key) on delete cascade,
  question_refs text[] not null default '{}'::text[]
);

-- ---------------------------------------------------------------------
-- 8. Cross section patterns. COACH ONLY.
-- ---------------------------------------------------------------------

-- `rule` is a small closed vocabulary evaluated by
-- lib/whole-body-signal/patterns.ts, so a coach can retune what fires an
-- entry without a deploy:
--
--   {"type":"sections_at_or_above","sections":[...],"minPercent":50}
--   {"type":"sections_count_at_or_above","minPercent":50,"minCount":5}
--
-- coach_text is stored as the practitioner approved it, whole sentences
-- and all. Nothing in the app composes a sentence around it.
create table whole_body_signal_patterns (
  pattern_key text primary key,
  position integer not null,
  title text not null,
  rule jsonb not null,
  coach_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 9. The coaching question library. COACH ONLY.
-- ---------------------------------------------------------------------

-- Four trigger types, and the type is a column rather than something
-- inferred from the shape of the trigger, because the ORDER a session
-- surfaces them in is decided by that type: combination first, then answer
-- level, then Zone level, then section level.
--
-- `trigger` shapes, evaluated by lib/whole-body-signal/coachingQuestions.ts:
--
--   {"type":"section","section":"fuel_quality","minPercent":50}
--   {"type":"answer","questions":["FQ5"],"minSignal":3}
--   {"type":"primary_zone","zone":"zone_1"}
--   {"type":"sections_at_or_above","sections":[...],"minPercent":50}
create table whole_body_signal_coaching_questions (
  question_key text primary key,
  position integer not null,
  trigger_type text not null check (trigger_type in ('combination', 'answer', 'zone', 'section')),
  trigger jsonb not null,
  question text not null,
  topic text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whole_body_signal_coaching_questions_type_idx
  on whole_body_signal_coaching_questions (trigger_type, position);

-- ---------------------------------------------------------------------
-- 10. Every other line of copy, keyed, plus the editable numbers.
-- ---------------------------------------------------------------------

-- THE KEY PREFIX IS THE FENCE. A key beginning 'member.' may render on a
-- member screen. A key beginning 'coach.' may not, ever.
-- lib/whole-body-signal/copyKeys.ts refuses to hand a coach key to a
-- member surface, and the database policy below refuses to send a coach
-- row to a member session at all.
create table whole_body_signal_copy (
  copy_key text primary key,
  value text not null,
  audience text not null check (audience in ('member', 'coach')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The numbers that are not band cut offs: the three Signal Load weights,
-- what counts as an elevated section, how many sections the third
-- component averages, the secondary Zone display thresholds, and how many
-- coaching questions a session may surface.
create table whole_body_signal_settings (
  setting_key text primary key,
  numeric_value numeric not null,
  note text
);

-- ---------------------------------------------------------------------
-- 11. One revision trail for every content table above.
-- ---------------------------------------------------------------------

-- Same shape and same reasoning as body_systems_content_revisions
-- (migration 220) and driver_probe_question_revisions (migration 110): one
-- row per change, storing the whole before and after, so "was this
-- reworded partway through" is a queryable answer rather than a guess when
-- a pattern six months from now looks strange.
create table whole_body_signal_content_revisions (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in (
    'whole_body_signal_zones', 'whole_body_signal_sections', 'whole_body_signal_questions',
    'whole_body_signal_scale_options', 'whole_body_signal_bands',
    'whole_body_signal_routing_options', 'whole_body_signal_branch_rules',
    'whole_body_signal_patterns', 'whole_body_signal_coaching_questions',
    'whole_body_signal_copy', 'whole_body_signal_settings'
  )),
  row_key text not null,
  change_type text not null check (change_type in ('created', 'updated', 'retired', 'restored')),
  before jsonb,
  after jsonb,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index whole_body_signal_content_revisions_row_idx
  on whole_body_signal_content_revisions (table_name, row_key, changed_at desc);

-- ---------------------------------------------------------------------
-- 12. Row level security on the content.
-- ---------------------------------------------------------------------

alter table whole_body_signal_zones enable row level security;
alter table whole_body_signal_sections enable row level security;
alter table whole_body_signal_questions enable row level security;
alter table whole_body_signal_scale_options enable row level security;
alter table whole_body_signal_bands enable row level security;
alter table whole_body_signal_routing_options enable row level security;
alter table whole_body_signal_branch_rules enable row level security;
alter table whole_body_signal_patterns enable row level security;
alter table whole_body_signal_coaching_questions enable row level security;
alter table whole_body_signal_copy enable row level security;
alter table whole_body_signal_settings enable row level security;
alter table whole_body_signal_content_revisions enable row level security;

-- The tables a member's own screens have to read: the sections she is
-- walked through, the questions she answers, the scale she taps, the
-- routing question and its branch rules, the bands her results are drawn
-- in, the member copy and the settings.
--
-- SHE READS THE QUESTION TABLE, and that is correct: the prompt is the
-- question she is being asked. The practitioner COLUMNS on that row never
-- reach her, and that is enforced where it can be enforced honestly, in
-- the member content loader, which selects only the member columns and is
-- guarded by tests/whole-body-signal-member-payload.test.ts.
create policy authenticated_read_wbs_sections on whole_body_signal_sections
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_wbs_questions on whole_body_signal_questions
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_wbs_scale_options on whole_body_signal_scale_options
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_wbs_bands on whole_body_signal_bands
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_wbs_routing_options on whole_body_signal_routing_options
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_wbs_branch_rules on whole_body_signal_branch_rules
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_wbs_settings on whole_body_signal_settings
  for select using (auth.role() = 'authenticated');

create policy member_read_member_wbs_copy on whole_body_signal_copy
  for select using (auth.role() = 'authenticated' and audience = 'member');

create policy staff_read_coach_wbs_copy on whole_body_signal_copy
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );

-- THE THREE PRACTITIONER TABLES ARE NOT READABLE BY A MEMBER. No member
-- select policy exists on the Zone map, the cross section patterns or the
-- coaching question library, and there never may be one.
create policy staff_read_wbs_zones on whole_body_signal_zones
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );
create policy staff_read_wbs_patterns on whole_body_signal_patterns
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );
create policy staff_read_wbs_coaching_questions on whole_body_signal_coaching_questions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );

-- Coaches edit the content. Retiring is is_active = false, never a delete,
-- exactly as every content bank in this app does it.
create policy coach_write_wbs_zones on whole_body_signal_zones
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_sections on whole_body_signal_sections
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_questions on whole_body_signal_questions
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_scale_options on whole_body_signal_scale_options
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_bands on whole_body_signal_bands
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_routing_options on whole_body_signal_routing_options
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_branch_rules on whole_body_signal_branch_rules
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_patterns on whole_body_signal_patterns
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_coaching_questions on whole_body_signal_coaching_questions
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_copy on whole_body_signal_copy
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_wbs_settings on whole_body_signal_settings
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_wbs_zones on whole_body_signal_zones
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_sections on whole_body_signal_sections
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_questions on whole_body_signal_questions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_scale_options on whole_body_signal_scale_options
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_bands on whole_body_signal_bands
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_routing_options on whole_body_signal_routing_options
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_branch_rules on whole_body_signal_branch_rules
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_patterns on whole_body_signal_patterns
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_coaching_questions on whole_body_signal_coaching_questions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_copy on whole_body_signal_copy
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_wbs_settings on whole_body_signal_settings
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy staff_read_wbs_content_revisions on whole_body_signal_content_revisions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );
create policy coach_insert_wbs_content_revisions on whole_body_signal_content_revisions
  for insert with check (
    public.has_active_role(auth.uid(), 'coach') and changed_by = auth.uid()
  );
create policy platform_admin_all_wbs_content_revisions on whole_body_signal_content_revisions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 13. Her sitting.
-- ---------------------------------------------------------------------

-- ONE ROW PER ASSIGNMENT, CREATED BY A TAP AND NEVER BY A RENDER.
--
-- This assessment is resumable, so a row exists while she is partway
-- through. It is still never written by a page render: the only thing that
-- creates or updates it is the save behind her own answer and her own
-- Continue (app/actions/wholeBodySignal.ts). A render may read; it may not
-- insert, claim, upsert or schedule.
--
-- COMPLETION IS WRITE ONCE. The update policy below only matches a row
-- whose completed_at is still null, so a finished sitting can never be
-- edited, re-answered or re-scored. A retake is a new assignment and a new
-- row.
create table member_whole_body_signal_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  assignment_id uuid references assessment_assignments(id) on delete set null,

  content_version integer not null default 1,

  -- Her answer to Section 8's routing question, which decides which of
  -- that section's questions she is asked and therefore what its maximum
  -- is. Null until she reaches it, which is the honest state for a member
  -- on section three.
  routing_option_key text,

  -- Her answers, keyed by question_ref. Values are a scale value_key or
  -- the literal 'pnta' for a Prefer not to answer tap.
  answers jsonb not null default '{}'::jsonb,

  -- The reading, as NUMBERS AND SLUGS, never as sentences. Section points,
  -- possible, percent and band key; Zone points, possible and percent; the
  -- Signal Load and its three components. Every word is rendered from
  -- these at read time from the stored copy rows, so a wording fix reaches
  -- every past sitting at once and a member and her coach can never read
  -- two different readings of one sitting.
  results jsonb not null default '{}'::jsonb,

  -- How far she got, so reopening puts her back where she was.
  progress jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index member_wbs_sessions_one_per_assignment
  on member_whole_body_signal_sessions (assignment_id)
  where assignment_id is not null;

create index member_wbs_sessions_member_idx
  on member_whole_body_signal_sessions (member_id, completed_at desc);

alter table member_whole_body_signal_sessions enable row level security;

create policy member_read_own_wbs_sessions on member_whole_body_signal_sessions
  for select using (member_id = auth.uid());

-- THE ASSIGNMENT IS THE GATE, IN THE DATABASE TOO.
create policy member_insert_own_wbs_sessions on member_whole_body_signal_sessions
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.assessment_assignments a
      where a.id = assignment_id
        and a.member_id = auth.uid()
        and a.assessment_definition_id = '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36'
        and a.status = 'pending'
    )
  );

create policy member_update_own_unfinished_wbs_sessions on member_whole_body_signal_sessions
  for update
  using (member_id = auth.uid() and completed_at is null)
  with check (member_id = auth.uid());

-- Same narrow test account escape hatch migrations 151, 189, 190 and 220
-- give their own tables, and for the same reason: a verification pass has
-- to be able to see the experience arrive more than once, and has to be
-- able to leave production clean afterwards.
create policy test_member_delete_own_wbs_sessions on member_whole_body_signal_sessions
  for delete using (
    member_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_test = true)
  );

create policy coach_read_assigned_wbs_sessions on member_whole_body_signal_sessions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_wbs_sessions on member_whole_body_signal_sessions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 14. The coach's chosen coaching focus.
-- ---------------------------------------------------------------------

-- THE COACH'S CHOICE SITS BESIDE THE RECOMMENDATION, NEVER INSTEAD OF IT.
-- This table holds only what the coach picked. What the assessment
-- recommended is recomputed from the stored results every time it is read,
-- so the screen can always show both and a later content fix moves the
-- recommendation without rewriting what a coach once decided.
--
-- ONE ROW PER SITTING. A coach changing his mind replaces his own row
-- rather than stacking a second one, which is what lets the reassessment
-- view print "the priority chosen last time" without having to guess which
-- of several rows was meant.
create table member_whole_body_signal_focus (
  session_id uuid primary key references member_whole_body_signal_sessions(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  section_key text not null references whole_body_signal_sections(section_key),
  chosen_by uuid not null references auth.users(id),
  chosen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_wbs_focus_member_idx
  on member_whole_body_signal_focus (member_id, chosen_at desc);

alter table member_whole_body_signal_focus enable row level security;

create policy coach_read_wbs_focus on member_whole_body_signal_focus
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_write_wbs_focus on member_whole_body_signal_focus
  for all
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  )
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and chosen_by = auth.uid()
  );

create policy platform_admin_all_wbs_focus on member_whole_body_signal_focus
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- NO MEMBER POLICY. A coaching priority is a coach's working note about
-- her, decided in a conversation she has not had yet, so it is not
-- something her own session may read.

-- ---------------------------------------------------------------------
-- 15. What the coach did with each coaching question.
-- ---------------------------------------------------------------------

-- Marked as asked, hidden, or saved to session prep. Three timestamps
-- rather than one state column, because they are not exclusive: a coach
-- can save a question to prep and then mark it asked, and collapsing that
-- into one state would lose which of them happened.
create table member_whole_body_signal_question_actions (
  session_id uuid not null references member_whole_body_signal_sessions(id) on delete cascade,
  question_key text not null references whole_body_signal_coaching_questions(question_key) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  asked_at timestamptz,
  hidden_at timestamptz,
  saved_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (session_id, question_key)
);

create index member_wbs_question_actions_member_idx
  on member_whole_body_signal_question_actions (member_id, updated_at desc);

alter table member_whole_body_signal_question_actions enable row level security;

create policy coach_read_wbs_question_actions on member_whole_body_signal_question_actions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_write_wbs_question_actions on member_whole_body_signal_question_actions
  for all
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  )
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
    and updated_by = auth.uid()
  );

create policy platform_admin_all_wbs_question_actions on member_whole_body_signal_question_actions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 16. Joining the cross assessment attempt ledger.
-- ---------------------------------------------------------------------

alter table assessment_attempts drop constraint assessment_attempts_source_table_check;
alter table assessment_attempts add constraint assessment_attempts_source_table_check
  check (source_table in (
    'wellness_assessments', 'primal_pattern_assessments', 'onboarding_submissions',
    'body_assessments', 'unified_assessment_sessions', 'member_stress_load_sessions',
    'member_happiness_deep_dive_sessions', 'member_body_systems_sessions',
    'member_whole_body_signal_sessions'
  ));

-- Writes the attempt row the moment a sitting is completed, which is what
-- migration 144's own trigger then reads to close the pending assignment
-- out. Same EXCEPTION guarded, never block the row it fires from
-- discipline as every trigger in migrations 79, 100, 190 and 220.
create or replace function public.sync_assessment_attempt_from_wbs_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid := '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36';
  v_is_first boolean;
begin
  if new.completed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.completed_at is not null then
    return new;
  end if;

  select not exists (
    select 1 from public.assessment_attempts
    where member_id = new.member_id and assessment_definition_id = v_definition_id
  ) into v_is_first;

  insert into public.assessment_attempts (
    member_id, assessment_definition_id, assessment_version,
    attempt_type, status, started_at, completed_at,
    source_table, source_id
  ) values (
    new.member_id, v_definition_id, new.content_version,
    case when v_is_first then 'standard' else 'retake' end,
    'completed', new.started_at, new.completed_at,
    'member_whole_body_signal_sessions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_wbs_session on public.member_whole_body_signal_sessions;
create trigger sync_assessment_attempt_after_wbs_session
  after insert or update on public.member_whole_body_signal_sessions
  for each row
  execute function public.sync_assessment_attempt_from_wbs_session();
