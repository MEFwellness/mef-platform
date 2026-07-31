-- Protein Phase 1a — profile, safety screen, target calculation, coach
-- approval. No food entry/barcode/ledger/photo estimates yet (later
-- phases); this only computes and stores a single daily protein-gram
-- target.
--
-- Three pieces:
--
-- 1. Extends migration 65's member_nutrition_safety_flags (the existing
--    "Nutrition Safety Overrides" table, already used by the Primal
--    Pattern assessment) with the 4 additional conditions this feature's
--    safety screen asks about that aren't already covered there: kidney
--    disease, significant liver disease, an active/recovering eating
--    disorder, and a clinician instruction to limit protein.
--    is_pregnant already exists on that table and is reused as-is — same
--    condition, same meaning, no reason to ask twice or store twice.
--    Deliberately reusing this table rather than creating a parallel one:
--    it's already exactly "member-reported medical safety flags that gate
--    automated nutrition guidance," which is exactly what this screen is.
--    A dedicated protein-only gate helper (application code, see
--    lib/health-safety/types.ts) reads only the 5 fields relevant to
--    protein safety — it deliberately does not reuse the table's existing
--    general hasActiveOverride() check, which also considers diabetes/
--    insulin fields that have no bearing on whether a protein target is
--    safe to auto-calculate.
--
-- 2. member_protein_profile — one row per member (upserted in place, not
--    append-only, since this is just "the member's current inputs," not a
--    history), body weight in lb + a chosen activity-level key. The
--    activity level's multiplier (1.0/1.2/1.4/1.6) is intentionally NOT a
--    column here — it's resolved from the key in application code
--    (lib/protein/calculation.ts), same "config in code, not the
--    database" convention already used for correlation-engine weights and
--    membership-tier ranks, so the multiplier mapping can be tuned without
--    a migration.
--
-- 3. member_protein_targets — append-only (one row per calculation
--    request, not upserted) so a later profile change/recompute never
--    silently overwrites a coach's prior review of an earlier number.
--    track is derived server-side from the member's real
--    profiles.membership_tier at submission time ('holistic_reset' -> the
--    24-week structured program -> 'structured_program'; every other tier
--    -> 'self_guided'), never trusted from client input. The core
--    guarantee this task requires — a structured-program member never
--    sees an active target before a coach approves it — is enforced two
--    ways, not just by application code:
--      a. RLS SELECT only ever returns a member's own row when
--         status = 'active'. A pending_coach_review row is not merely
--         hidden by the UI — the member's own authenticated client
--         literally cannot read it back, at all, until it flips to
--         active. (Whether a member has a request outstanding is instead
--         inferred at the application layer from "a profile exists but no
--         active target row is visible yet" — no separate status column
--         needs to leak the pending number to make that inference.)
--      b. The member INSERT policy's WITH CHECK cross-references the
--         member's own real membership_tier (via a subquery against
--         profiles, which the member can already read under its own
--         existing RLS policy) so a structured-program member cannot
--         self-insert a row with status = 'active' even by calling the
--         API directly — only a genuinely self-guided member's own client
--         is allowed to insert an already-active row, and only with
--         active_grams equal to the computed number (no self-editing).
--    Only a coach (scoped to their own assigned members via
--    is_active_coach_for, same as every other coach-write policy in this
--    schema) or platform_administrator can move a row from
--    pending_coach_review to active, or set an edited active_grams value.

-- ============================================================
-- 1. Extend member_nutrition_safety_flags (migration 65)
-- ============================================================
alter table member_nutrition_safety_flags
  add column has_kidney_disease boolean not null default false,
  add column has_significant_liver_disease boolean not null default false,
  add column has_eating_disorder boolean not null default false,
  add column has_medical_protein_limit boolean not null default false;

comment on column member_nutrition_safety_flags.has_eating_disorder is
  'An active OR recovering eating disorder — one combined yes/no flag, matching how the protein safety screen asks the question rather than splitting into two.';
comment on column member_nutrition_safety_flags.has_medical_protein_limit is
  'Member has been medically instructed (by a clinician) to limit their protein intake — distinct from has_clinician_nutrition_plan, which is about following a full nutrition plan, not specifically a protein limit.';

-- Fast "does this member have any protein-relevant safety flag" lookup,
-- separate from the existing general active_idx (migration 65) since the
-- fields that matter for protein safety are a different subset (kidney,
-- liver, pregnancy, eating disorder, medical protein limit — not
-- diabetes/insulin, which don't gate protein calculation).
create index member_nutrition_safety_flags_protein_active_idx on member_nutrition_safety_flags (member_id)
  where has_kidney_disease or has_significant_liver_disease or is_pregnant
     or has_eating_disorder or has_medical_protein_limit;

-- ============================================================
-- 2. member_protein_profile
-- ============================================================
create table member_protein_profile (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references auth.users(id) on delete cascade,

  body_weight_lb numeric(6,2) not null check (body_weight_lb > 0 and body_weight_lb < 1000),
  activity_level text not null check (
    activity_level in (
      'general_wellness',
      'regular_movement',
      'resistance_training_or_fat_loss',
      'muscle_building_emphasis'
    )
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_protein_profile_member_idx on member_protein_profile (member_id);

alter table member_protein_profile enable row level security;

create policy member_read_own_protein_profile on member_protein_profile
  for select
  using (member_id = auth.uid());

create policy member_insert_own_protein_profile on member_protein_profile
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_protein_profile on member_protein_profile
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy coach_read_assigned_protein_profile on member_protein_profile
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_protein_profile on member_protein_profile
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- 3. member_protein_targets
-- ============================================================
create table member_protein_targets (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  track text not null check (track in ('structured_program', 'self_guided')),

  -- Snapshot of the inputs used for this specific calculation, so a coach
  -- reviewing the queue (or looking back later) sees exactly what produced
  -- computed_grams even if the member's profile changes afterward.
  body_weight_lb numeric(6,2) not null check (body_weight_lb > 0 and body_weight_lb < 1000),
  activity_level text not null check (
    activity_level in (
      'general_wellness',
      'regular_movement',
      'resistance_training_or_fat_loss',
      'muscle_building_emphasis'
    )
  ),
  computed_grams int not null check (computed_grams > 0 and computed_grams % 5 = 0),

  status text not null check (status in ('pending_coach_review', 'active')),
  active_grams int check (active_grams is null or active_grams > 0),
  is_coach_edited boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint member_protein_targets_status_consistency check (
    (status = 'pending_coach_review' and active_grams is null and approved_by is null and approved_at is null)
    or
    (status = 'active' and active_grams is not null)
  )
);

create index member_protein_targets_member_idx on member_protein_targets (member_id, created_at desc);
create index member_protein_targets_pending_idx on member_protein_targets (created_at)
  where status = 'pending_coach_review';

alter table member_protein_targets enable row level security;

-- A member can only ever read their own row once it is active — a
-- pending_coach_review row is invisible to the member it belongs to, not
-- just unlabeled as active. This is the hard guarantee behind "a
-- structured-program member never sees an active target before coach
-- approval."
create policy member_read_own_active_protein_target on member_protein_targets
  for select
  using (member_id = auth.uid() and status = 'active');

-- A member may create their own calculation request. A self-guided
-- member's own client is allowed to insert an already-active row (no
-- coach review needed for that track), but only with active_grams equal
-- to the number it just computed (no self-editing) and never with
-- approved_by set (that column is coach/admin-only). A structured-program
-- member's client can only ever insert a pending_coach_review row — the
-- membership_tier check below reads the member's own real, existing
-- profiles row, so this can't be spoofed by simply passing a different
-- track/status in the request body.
create policy member_insert_own_protein_target on member_protein_targets
  for insert
  with check (
    member_id = auth.uid()
    and approved_by is null
    and approved_at is null
    and is_coach_edited = false
    and (
      status = 'pending_coach_review'
      or (
        status = 'active'
        and active_grams = computed_grams
        and track = 'self_guided'
        and coalesce(
          (select p.membership_tier from profiles p where p.id = auth.uid()),
          'membership'
        ) <> 'holistic_reset'
      )
    )
  );

-- No member update policy: a target row is immutable once created. A
-- member who wants to recompute (new weight/activity level) creates a new
-- row rather than editing an old one, so a coach's approval of an earlier
-- number is never silently changed out from under them.

create policy coach_read_assigned_protein_targets on member_protein_targets
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_protein_targets on member_protein_targets
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  )
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_protein_targets on member_protein_targets
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
