-- The MEF Body Systems Survey: eleven sections, one hundred and three
-- tap-only questions on Branch A (one hundred and one on Branch B), plus
-- six red flag questions that are asked of everybody every time.
--
-- WHO GETS IT. A coach assignment, and nothing else. Same rule as every
-- coach assigned experience beside it (migrations 190, 211 through 219):
-- no tier lock, no visibility key, no grant column and no second flag.
-- assessment_assignments (migration 77) is the ledger, which is what gives
-- this the coach write RLS, the one pending row per member partial unique
-- index (migration 144), and the trigger that closes an assignment out.
--
-- WHAT IS GENUINELY NEW HERE, and why it is not code.
--
-- Every word this survey can show, and every number it decides with, is a
-- database row. Sections, questions, the five point scale and its weights,
-- the three loudness bands and their cut offs, the six red flags and their
-- safety levels, the safety responses themselves, every line of member
-- facing result copy, and the entire coach association library with its
-- trigger definitions. The same discipline driver_probe_questions
-- (migrations 106, 109 and 110) already holds for the daily check in
-- question bank, for the same reason: this content belongs to a coach, it
-- will be corrected as real client patterns teach him, and a correction
-- must not need a deploy.
--
-- TWO INTERPRETATION LAYERS, AND THE SEPARATION IS STRUCTURAL. The member
-- layer speaks only in signal loudness (Quiet, Showing up, Speaking
-- loudly). The coach layer holds every pattern reading and every possible
-- association. They are two different tables, read by two different
-- modules, and the association tables are not readable by a member at all:
-- body_systems_associations carries a coach and platform administrator
-- select policy and no member policy, so a member session asking for a
-- row gets none. That is the fence, in the database, rather than a
-- convention a screen has to remember.
--
-- RED FLAGS NEVER TOUCH SCORING. They live in their own tables, their
-- answers live in their own column, and no scoring path reads that
-- column. A Yes changes no percentage, no colour and no order, in either
-- direction. lib/body-systems/scoring.ts never receives them, and
-- tests/body-systems-red-flags.test.ts proves a full Yes sheet and a full
-- No sheet produce identical section results.

-- ---------------------------------------------------------------------
-- 1. The catalog row, so the existing assignment machinery can address it.
-- ---------------------------------------------------------------------

-- Fixed id, matching lib/body-systems/constants.ts exactly, so every
-- environment resolves this experience to the same definition. Same
-- convention as migrations 70, 190 and 211 through 219.
insert into assessment_definitions (id, key, display_name, category)
values (
  'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4',
  'body-systems-survey',
  'MEF Body Systems Survey',
  'body_systems'
)
on conflict (id) do nothing;

insert into assessment_definition_versions (assessment_definition_id, version, notes)
select 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4', 1,
  'Initial version, eleven sections plus six red flag questions, all content stored as rows.'
where not exists (
  select 1 from assessment_definition_versions
  where assessment_definition_id = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4' and version = 1
);

-- ---------------------------------------------------------------------
-- 2. The content. Every row here is editable by a coach.
-- ---------------------------------------------------------------------

-- The eleven sections, in the fixed order a member always sees them in.
--
-- registry_domain and registry_code are how a completion reaches the Root
-- Map. They are stored beside the section rather than mapped in code so a
-- section added later arrives with its own destination already named.
create table body_systems_sections (
  section_key text primary key,
  position integer not null,
  display_name text not null,
  member_intro_line text not null,
  -- The one personalised line the loudest section prints on her results
  -- screen. Only the loudest section ever prints it.
  top_attention_line text not null,
  registry_domain text not null,
  registry_code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index body_systems_sections_position_idx on body_systems_sections (position);

-- One question. `branch` is 'all' for the ten sections everybody answers,
-- and 'a' or 'b' inside Hormonal Health.
--
-- allows_dna and dna_label together are what rule five of the survey
-- specification asks for: a Does not apply to me option exists only where
-- a question can genuinely not apply, it scores nothing, and it leaves
-- that section's denominator, so nobody is penalised or falsely greened.
create table body_systems_questions (
  question_ref text primary key,
  section_key text not null references body_systems_sections(section_key) on delete cascade,
  position integer not null,
  prompt text not null,
  branch text not null default 'all' check (branch in ('all', 'a', 'b')),
  allows_dna boolean not null default false,
  dna_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_systems_questions_dna_label_present
    check (allows_dna = false or dna_label is not null)
);

create index body_systems_questions_section_idx
  on body_systems_questions (section_key, position);

-- The one answer scale the entire survey uses, with its weights.
--
-- is_elevated is the definition the association library's own trigger
-- vocabulary rests on: "elevated" means Often or Almost always, said once
-- here rather than as a number repeated in every trigger.
create table body_systems_scale_options (
  value_key text primary key,
  position integer not null,
  label text not null,
  points integer not null,
  is_elevated boolean not null default false,
  is_active boolean not null default true
);

-- The three loudness bands, their cut offs and the exact words a member
-- reads. min_percent is inclusive, max_percent is exclusive, and the last
-- band leaves max_percent null so it is open ended.
create table body_systems_bands (
  band_key text primary key,
  position integer not null,
  min_percent numeric not null,
  max_percent numeric,
  color_key text not null check (color_key in ('green', 'yellow', 'red')),
  member_label text not null,
  member_status_line text not null
);


-- The two safety levels and the exact response a member reads the instant
-- she answers Yes.
--
-- THERE IS NO COACH APPROVAL STEP, deliberately. The specification is
-- explicit: the member sees the matching guidance immediately and
-- automatically. A safety message that waits for a human is a safety
-- message that can be late.
create table body_systems_safety_levels (
  level integer primary key check (level in (1, 2)),
  label text not null,
  member_response text not null
);

-- The six red flag questions. Asked of everybody, every time, on their own
-- screens at the end, answered Yes or No.
--
-- NOTHING HERE IS SCORED. No points column exists, on purpose: a column
-- that could weight a red flag is a column somebody could one day read
-- into a percentage.
create table body_systems_red_flags (
  flag_key text primary key,
  position integer not null,
  prompt text not null,
  level integer not null references body_systems_safety_levels(level),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index body_systems_red_flags_position_idx on body_systems_red_flags (position);

-- Every other line of copy this survey can print, keyed.
--
-- THE KEY PREFIX IS THE FENCE. A key beginning 'member.' may render on a
-- member screen. A key beginning 'coach.' may not, ever.
-- lib/body-systems/content.ts refuses to hand a coach key to a member
-- surface, and tests/body-systems-member-language.test.ts asserts every
-- member key is clean of medical conclusion language.
create table body_systems_copy (
  copy_key text primary key,
  value text not null,
  audience text not null check (audience in ('member', 'coach')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Editable numbers that are not band cut offs.
--
-- One row today: how many whole percentage points a section has to move
-- between two sittings before it is called quieter or louder rather than
-- unchanged.
create table body_systems_settings (
  setting_key text primary key,
  numeric_value numeric not null,
  note text
);

-- ---------------------------------------------------------------------
-- 3. The coach association library. Coach only, permanently.
-- ---------------------------------------------------------------------

-- One row per entry in the approved library.
--
-- `trigger` is a small, closed vocabulary evaluated by
-- lib/body-systems/associations.ts, so a coach can retune which answers
-- fire an entry without a deploy and without anybody writing new medical
-- reasoning into code. The shapes it accepts:
--
--   {"type":"cluster","questions":[...],"min":2}   n or more elevated in the set
--   {"type":"min_elevated","questions":[...],"min":3}   same rule, named for readability
--   {"type":"all_elevated","questions":[...]}      every one of them elevated
--   {"type":"any_elevated","questions":[...]}      at least one of them elevated
--   {"type":"all_of","conditions":[...]}           every nested condition holds
--   {"type":"any_of","conditions":[...]}           at least one nested condition holds
--   {"type":"sections_at_band","sections":[...],"band":"showing_up"}
--                                                  each named section at that band or louder
--   {"type":"sections_count_at_band","band":"speaking_loudly","min":3}
--                                                  at least n sections at that band or louder
--
-- association_text and next_step are stored as the coach approved them,
-- whole sentences and all, including their cautious frame. Nothing in the
-- app composes a sentence around them: the words a coach reads are the
-- words in this row, which is why the banned conclusion vocabulary can be
-- enforced by reading these two columns.
create table body_systems_associations (
  entry_code text primary key,
  position integer not null,
  -- The section this entry belongs under, or null for a cross system
  -- meta pattern that belongs to no single section.
  section_key text references body_systems_sections(section_key) on delete set null,
  -- 'all', 'a' or 'b'. The two Hormonal Health families only apply to
  -- their own branch.
  branch text not null default 'all' check (branch in ('all', 'a', 'b')),
  title text not null,
  trigger jsonb not null,
  association_text text not null,
  next_step text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index body_systems_associations_section_idx
  on body_systems_associations (section_key, position);

-- ---------------------------------------------------------------------
-- 4. One revision trail for every content table above.
-- ---------------------------------------------------------------------

-- Same shape and same reasoning as driver_probe_question_revisions
-- (migration 110): one row per change, storing the whole before and after,
-- so "was this reworded partway through" is a queryable answer rather than
-- a guess when a pattern six months from now looks strange.
--
-- Written under the acting coach's own RLS scoped session, never a service
-- role client, so changed_by is always a real auth.uid().
create table body_systems_content_revisions (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in (
    'body_systems_sections', 'body_systems_questions', 'body_systems_scale_options',
    'body_systems_bands', 'body_systems_red_flags', 'body_systems_safety_levels',
    'body_systems_copy', 'body_systems_settings', 'body_systems_associations'
  )),
  row_key text not null,
  change_type text not null check (change_type in ('created', 'updated', 'retired', 'restored')),
  before jsonb,
  after jsonb,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index body_systems_content_revisions_row_idx
  on body_systems_content_revisions (table_name, row_key, changed_at desc);

-- ---------------------------------------------------------------------
-- 5. Row level security on the content.
-- ---------------------------------------------------------------------

alter table body_systems_sections enable row level security;
alter table body_systems_questions enable row level security;
alter table body_systems_scale_options enable row level security;
alter table body_systems_bands enable row level security;
alter table body_systems_safety_levels enable row level security;
alter table body_systems_red_flags enable row level security;
alter table body_systems_copy enable row level security;
alter table body_systems_settings enable row level security;
alter table body_systems_associations enable row level security;
alter table body_systems_content_revisions enable row level security;

-- The eight tables a member's own screens have to read. She reads the
-- questions she is answering, the scale she is tapping, the bands her
-- results are drawn in and the copy around them. A 'coach' audience copy
-- row is filtered out here in the database as well as in the app, so a
-- member session cannot fetch one even by asking for it directly.
create policy authenticated_read_body_systems_sections on body_systems_sections
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_body_systems_questions on body_systems_questions
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_body_systems_scale_options on body_systems_scale_options
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_body_systems_bands on body_systems_bands
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_body_systems_safety_levels on body_systems_safety_levels
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_body_systems_red_flags on body_systems_red_flags
  for select using (auth.role() = 'authenticated');
create policy authenticated_read_body_systems_settings on body_systems_settings
  for select using (auth.role() = 'authenticated');

create policy member_read_member_body_systems_copy on body_systems_copy
  for select using (auth.role() = 'authenticated' and audience = 'member');

create policy staff_read_coach_body_systems_copy on body_systems_copy
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );

-- THE ASSOCIATION LIBRARY IS NOT READABLE BY A MEMBER. There is no member
-- select policy on this table and there never may be. This is the same
-- fence the app draws in lib/body-systems/associations.ts, drawn again
-- where a hand made request has to obey it too.
create policy staff_read_body_systems_associations on body_systems_associations
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );

-- Coaches edit the content. Retiring is is_active = false, never a delete,
-- exactly as the driver question bank does it.
create policy coach_write_body_systems_sections on body_systems_sections
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_body_systems_questions on body_systems_questions
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_body_systems_scale_options on body_systems_scale_options
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_body_systems_bands on body_systems_bands
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_body_systems_safety_levels on body_systems_safety_levels
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_body_systems_red_flags on body_systems_red_flags
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_body_systems_copy on body_systems_copy
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_body_systems_settings on body_systems_settings
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));
create policy coach_write_body_systems_associations on body_systems_associations
  for all using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy platform_admin_all_body_systems_sections on body_systems_sections
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_body_systems_questions on body_systems_questions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_body_systems_scale_options on body_systems_scale_options
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_body_systems_bands on body_systems_bands
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_body_systems_safety_levels on body_systems_safety_levels
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_body_systems_red_flags on body_systems_red_flags
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_body_systems_copy on body_systems_copy
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_body_systems_settings on body_systems_settings
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
create policy platform_admin_all_body_systems_associations on body_systems_associations
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy staff_read_body_systems_content_revisions on body_systems_content_revisions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    or public.has_active_role(auth.uid(), 'platform_administrator')
  );
create policy coach_insert_body_systems_content_revisions on body_systems_content_revisions
  for insert with check (
    public.has_active_role(auth.uid(), 'coach') and changed_by = auth.uid()
  );
create policy platform_admin_all_body_systems_content_revisions on body_systems_content_revisions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 6. Her sitting.
-- ---------------------------------------------------------------------

-- ONE ROW PER ASSIGNMENT, CREATED BY A TAP AND NEVER BY A RENDER.
--
-- This survey is resumable, which the Stress & Load Deep-Dive is not, so
-- unlike migration 190 a row does exist before she finishes. It is still
-- never written by a page render: the only thing that creates or updates
-- it is the server action behind her Continue button at the end of a
-- section (app/actions/bodySystems.ts). A render may read; it may not
-- insert, claim, upsert or schedule.
--
-- COMPLETION IS WRITE ONCE. The update policy below only matches a row
-- whose completed_at is still null, so a finished sitting can never be
-- edited, re-answered or re-scored. A retake is a new assignment and a new
-- row.
create table member_body_systems_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The assignment this sitting answers. Nullable only so her history
  -- survives an assignment row being removed; in practice never inserted
  -- without one, because the insert policy requires a pending assignment.
  assignment_id uuid references assessment_assignments(id) on delete set null,

  -- Which generation of the stored content these answers belong to, so a
  -- later edit to a question leaves old answers readable as answers to the
  -- question actually asked.
  content_version integer not null default 1,

  -- Which Hormonal Health branch she is answering. Remembered on her
  -- profile as well, so a retake never re-asks it.
  --
  -- NULL UNTIL SHE HAS ACTUALLY CHOSEN, and that is the point rather than
  -- laxity. The branch question is the first thing on section eleven, so a
  -- member partway through sections one to ten has not answered it yet.
  -- Ten of the eleven sections ask everybody the identical questions, so
  -- her progress through them is perfectly storable with no branch, and
  -- defaulting the column to 'a' would write a decision she has not made
  -- into a row her profile then remembers. A completion always carries
  -- one: she cannot reach the end without answering it.
  branch text check (branch in ('a', 'b')),

  -- Her answers, keyed by question_ref. Values are a scale value_key, or
  -- the literal 'dna' for a Does not apply to me tap.
  answers jsonb not null default '{}'::jsonb,

  -- Her six Yes or No answers, keyed by flag_key. A SEPARATE COLUMN from
  -- answers, on purpose: nothing that computes a score is ever handed this
  -- object.
  red_flag_answers jsonb not null default '{}'::jsonb,

  -- The section results, as NUMBERS AND SLUGS, never as sentences. Points
  -- earned, points possible, the rounded percentage and the band key per
  -- section. The words are rendered from these at read time by
  -- lib/body-systems/memberView.ts and coachView.ts from the stored copy
  -- rows, so a wording fix reaches every past sitting at once and a member
  -- and her coach can never read two different readings of one sitting.
  results jsonb not null default '{}'::jsonb,

  -- How far she got, so reopening puts her back where she was. One number
  -- and nothing else: {"stepIndex": 4}.
  progress jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index member_body_systems_sessions_one_per_assignment
  on member_body_systems_sessions (assignment_id)
  where assignment_id is not null;

create index member_body_systems_sessions_member_idx
  on member_body_systems_sessions (member_id, completed_at desc);

alter table member_body_systems_sessions enable row level security;

create policy member_read_own_body_systems_sessions on member_body_systems_sessions
  for select using (member_id = auth.uid());

-- THE ASSIGNMENT IS THE GATE, IN THE DATABASE TOO.
create policy member_insert_own_body_systems_sessions on member_body_systems_sessions
  for insert with check (
    member_id = auth.uid()
    and exists (
      select 1
      from public.assessment_assignments a
      where a.id = assignment_id
        and a.member_id = auth.uid()
        and a.assessment_definition_id = 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4'
        and a.status = 'pending'
    )
  );

-- Resume writes, and the one write that completes it. `using` matches only
-- an unfinished row, so completion is write once and a finished sitting is
-- immutable.
create policy member_update_own_unfinished_body_systems_sessions on member_body_systems_sessions
  for update
  using (member_id = auth.uid() and completed_at is null)
  with check (member_id = auth.uid());

-- Same narrow test account escape hatch migrations 151, 189 and 190 give
-- their own tables, and for the same reason: a verification pass has to be
-- able to see the experience arrive more than once.
create policy test_member_delete_own_body_systems_sessions on member_body_systems_sessions
  for delete using (
    member_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.is_test = true)
  );

create policy coach_read_assigned_body_systems_sessions on member_body_systems_sessions
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_body_systems_sessions on member_body_systems_sessions
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- 7. Her remembered branch.
-- ---------------------------------------------------------------------

-- Stored on the profile so a retake never re-asks it and so she can change
-- it herself from her own profile screen. Null until she answers the
-- branch question for the first time.
alter table profiles add column if not exists body_systems_branch text
  check (body_systems_branch in ('a', 'b'));

comment on column profiles.body_systems_branch is
  'Which Hormonal Health question set the MEF Body Systems Survey asks this
   member. Set by her own answer to the branch question, editable by her on
   /profile. Never inferred from anything else.';

-- ---------------------------------------------------------------------
-- 8. Joining the cross assessment attempt ledger.
-- ---------------------------------------------------------------------

alter table assessment_attempts drop constraint assessment_attempts_source_table_check;
alter table assessment_attempts add constraint assessment_attempts_source_table_check
  check (source_table in (
    'wellness_assessments', 'primal_pattern_assessments', 'onboarding_submissions',
    'body_assessments', 'unified_assessment_sessions', 'member_stress_load_sessions',
    'member_happiness_deep_dive_sessions', 'member_body_systems_sessions'
  ));

-- Writes the attempt row the moment a sitting is completed, which is what
-- migration 144's own trigger then reads to close the pending assignment
-- out. Same EXCEPTION guarded, never block the row it fires from
-- discipline as every trigger in migrations 79, 100 and 190.
create or replace function public.sync_assessment_attempt_from_body_systems_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_definition_id uuid := 'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4';
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
    'member_body_systems_sessions', new.id
  )
  on conflict (source_table, source_id) do nothing;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sync_assessment_attempt_after_body_systems_session on public.member_body_systems_sessions;
create trigger sync_assessment_attempt_after_body_systems_session
  after insert or update on public.member_body_systems_sessions
  for each row
  execute function public.sync_assessment_attempt_from_body_systems_session();

-- ---------------------------------------------------------------------
-- 9. The Root Map feed: one new registry producer, eleven dimensions.
-- ---------------------------------------------------------------------

-- Same additive drop and re-add pattern migrations 44, 55, 58, 84, 99 and
-- 190 already used.
alter table registry_entries drop constraint registry_entries_source_feature_check;
alter table registry_entries add constraint registry_entries_source_feature_check
  check (source_feature in (
    'body_assessment_finding', 'assessment_ai_observation', 'wearable_daily_metric',
    'food_lens_pattern_comparison', 'movement_session_completed', 'food_analysis_result',
    'questionnaire_category_finding', 'onboarding_baseline_finding', 'primal_pattern_classification',
    'unified_assessment_finding', 'stress_load_deep_dive_finding',
    'body_systems_survey_finding'
  ));

create policy member_insert_own_body_systems_registry_entries on registry_entries
  for insert
  with check (member_id = auth.uid() and source_feature = 'body_systems_survey_finding');

create policy member_update_own_body_systems_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and source_feature = 'body_systems_survey_finding')
  with check (member_id = auth.uid() and source_feature = 'body_systems_survey_finding');
