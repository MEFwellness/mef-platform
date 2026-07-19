# 3. Database Schema Proposal

**This is a draft, not a migration.** It is intentionally kept out of `supabase/migrations/` so it
can't accidentally be picked up by migration tooling, and so it doesn't claim a migration number
that might collide with work happening in parallel. When implementation starts, whoever picks this
up should copy the relevant SQL into a new file at
`supabase/migrations/{next_available_number}_food_lens.sql` — check the current highest number in
that directory first (this blueprint was written against a tree where the most recent migrations
were `00000000000050` / `00000000000051`, extending the Body Assessment tables; the real next
number by the time this is implemented may be different).

## 3.1 Conventions followed (matching every existing migration)

- snake_case, feature-prefixed table names (`food_lens_*`).
- `id uuid primary key default gen_random_uuid()`, `member_id uuid not null references
auth.users(id) on delete cascade`, `created_at timestamptz not null default now()`.
- Enum-like fields are `text not null check (x in (...))`, extended additively in later migrations
  (drop + re-add constraint), never destructively renamed.
- **Append-only, supersede-not-mutate** for anything a correction can change
  (`food_lens_detected_items`) — a correction inserts a new row and points `supersedes_id` at the
  old one, exactly like `body_assessment_findings`.
- `confidence numeric not null check (confidence >= 0 and confidence <= 1)` on every AI-derived
  row, paired with a plain-language field for what's shown to the member — never raw model output.
- Deny-by-default RLS: `alter table ... enable row level security` plus explicit
  `member_read_own_*` / `member_insert_own_*` / `platform_admin_all_*` policies.
- Private storage bucket, per-member folder path enforced at the `storage.objects` RLS layer —
  same as `body-assessment-media`.

## 3.2 Deliberate departure from the Body Assessment precedent

Body Assessment has `body_assessment_coach_reviews` (an append-only practitioner audit trail) and
a `pending_review` → coach `confirm/dismiss/override` workflow before a member fully sees results.
**This proposal does not include an equivalent for Food Lens.** Reasoning: Body Assessment findings
are clinical-adjacent (posture measurements informing exercise programming) and warrant a
practitioner sign-off. Food Lens is member self-education — the member is the one confirming or
correcting detected items, in real time, for their own benefit, not for a coach's review queue.
Requiring a coach review before a member can see "this meal looks carb-heavy" would make the
feature useless (the value is immediate feedback while looking at the plate). Coaches still get
aggregate visibility for free via the Universal Registry adapter (§3.4) without per-scan overhead.
If MEF later wants a coach-facing nutrition trend view, doc 8 covers how that's additive, not a
schema change here.

## 3.3 Tables

```sql
-- ============================================================================
-- food_lens_scans
-- One row per capture session (a single meal photo, barcode scan, or label
-- scan). Mirrors body_assessments' lifecycle/provider-status columns.
-- ============================================================================
create table food_lens_scans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  scan_type text not null default 'meal_photo'
    check (scan_type in ('meal_photo', 'barcode', 'nutrition_label')),

  status text not null default 'pending'
    check (status in (
      'pending',        -- capture recorded, analysis not yet requested
      'analyzing',      -- provider call in flight
      'analyzed',       -- items + macro estimate + comparison written
      'not_configured', -- no vision provider configured; never fabricated
      'failed',         -- provider call errored; provider_error set
      'member_reviewed' -- member has confirmed/corrected at least once
    )),

  provider_name text,   -- e.g. 'anthropic_vision' -- null until analysis attempted
  provider_status text, -- raw provider-reported status, for debugging
  provider_error text,  -- human-readable error, set only when status = 'failed'

  -- snapshot of which Primal Pattern target was active when this scan ran,
  -- so a later change to the member's target doesn't retroactively change
  -- what an old scan's comparison meant. See doc 5.
  primal_pattern_profile_id uuid references primal_pattern_profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index food_lens_scans_member_idx on food_lens_scans(member_id, created_at desc);

alter table food_lens_scans enable row level security;

create policy member_read_own_food_lens_scans on food_lens_scans
  for select using (member_id = auth.uid());
create policy member_insert_own_food_lens_scans on food_lens_scans
  for insert with check (member_id = auth.uid());
create policy member_update_own_food_lens_scans on food_lens_scans
  for update using (member_id = auth.uid());
create policy platform_admin_all_food_lens_scans on food_lens_scans
  for all using (has_active_role(auth.uid(), 'platform_admin'));


-- ============================================================================
-- food_lens_captures
-- Storage path only, never image bytes. Mirrors body_assessment_captures.
-- ============================================================================
create table food_lens_captures (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,

  storage_path text not null,   -- '{member_id}/{scan_id}/{capture_id}.{ext}'
  capture_type text not null default 'photo'
    check (capture_type in ('photo', 'barcode_image', 'label_image')),

  device_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index food_lens_captures_scan_idx on food_lens_captures(scan_id);

alter table food_lens_captures enable row level security;

create policy member_read_own_food_lens_captures on food_lens_captures
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_insert_own_food_lens_captures on food_lens_captures
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_captures on food_lens_captures
  for all using (has_active_role(auth.uid(), 'platform_admin'));


-- ============================================================================
-- food_lens_detected_items
-- AI-identified (or member-added) foods on the plate. Append-only,
-- supersede-not-mutate on correction -- mirrors body_assessment_findings.
-- ============================================================================
create table food_lens_detected_items (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,

  label text not null,               -- e.g. 'grilled chicken breast'
  category text not null default 'unknown'
    check (category in ('protein', 'carb', 'fat', 'vegetable', 'mixed', 'unknown')),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),

  source text not null
    check (source in ('ai_detected', 'member_added', 'member_corrected')),
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'rejected', 'superseded')),

  supersedes_id uuid references food_lens_detected_items(id),

  created_at timestamptz not null default now()
);

create index food_lens_detected_items_scan_idx on food_lens_detected_items(scan_id);

alter table food_lens_detected_items enable row level security;

create policy member_read_own_food_lens_detected_items on food_lens_detected_items
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_write_own_food_lens_detected_items on food_lens_detected_items
  for insert with check (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy member_update_own_food_lens_detected_items on food_lens_detected_items
  for update using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_detected_items on food_lens_detected_items
  for all using (has_active_role(auth.uid(), 'platform_admin'));


-- ============================================================================
-- food_lens_macro_estimates
-- Plate-level protein/carb/fat *levels* (never grams/percentages framed as
-- fact) for one scan. Versioned: a recompute after a correction inserts a
-- new row rather than mutating, so scan history stays auditable.
-- ============================================================================
create table food_lens_macro_estimates (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,

  protein_level text not null check (protein_level in ('low', 'moderate', 'high')),
  carb_level    text not null check (carb_level    in ('low', 'moderate', 'high')),
  fat_level     text not null check (fat_level     in ('low', 'moderate', 'high')),

  protein_confidence numeric not null check (protein_confidence >= 0 and protein_confidence <= 1),
  carb_confidence    numeric not null check (carb_confidence    >= 0 and carb_confidence    <= 1),
  fat_confidence     numeric not null check (fat_confidence     >= 0 and fat_confidence     <= 1),

  -- never higher than the lowest of the three dimension confidences, or the
  -- underlying item-detection confidences that fed it -- enforced in
  -- application code (see lib/food-lens/comparison.ts in doc 1), not by a
  -- DB constraint, since the rule spans multiple tables.
  overall_confidence numeric not null check (overall_confidence >= 0 and overall_confidence <= 1),

  basis text not null default 'ai_estimated'
    check (basis in ('ai_estimated', 'member_adjusted')),

  created_at timestamptz not null default now()
);

create index food_lens_macro_estimates_scan_idx on food_lens_macro_estimates(scan_id, created_at desc);

alter table food_lens_macro_estimates enable row level security;

create policy member_read_own_food_lens_macro_estimates on food_lens_macro_estimates
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_macro_estimates on food_lens_macro_estimates
  for all using (has_active_role(auth.uid(), 'platform_admin'));
-- writes happen via the analyze/recompute server action using the service
-- role, same as body_landmark_sets -- no direct member insert policy needed.


-- ============================================================================
-- food_lens_pattern_comparisons
-- The coaching verdict: this scan's macro estimate vs. the member's active
-- Primal Pattern target. Mirrors body_assessment_comparisons.
-- ============================================================================
create table food_lens_pattern_comparisons (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references food_lens_scans(id) on delete cascade,
  macro_estimate_id uuid not null references food_lens_macro_estimates(id),
  primal_pattern_profile_id uuid not null references primal_pattern_profiles(id),

  -- structured per-dimension signal, e.g.
  -- [{"dimension":"carb","direction":"heavy"},{"dimension":"protein","direction":"match"}]
  -- drives deterministic template selection -- see doc 5.
  signals jsonb not null default '[]'::jsonb,

  -- the resolved coaching copy shown to the member. Selected from a reviewed
  -- template library by application code from `signals`, never raw model
  -- output -- see doc 1 §1.5.
  narrative text not null,

  confidence numeric not null check (confidence >= 0 and confidence <= 1),

  created_at timestamptz not null default now()
);

create index food_lens_pattern_comparisons_scan_idx on food_lens_pattern_comparisons(scan_id, created_at desc);

alter table food_lens_pattern_comparisons enable row level security;

create policy member_read_own_food_lens_pattern_comparisons on food_lens_pattern_comparisons
  for select using (
    exists (select 1 from food_lens_scans s
            where s.id = scan_id and s.member_id = auth.uid())
  );
create policy platform_admin_all_food_lens_pattern_comparisons on food_lens_pattern_comparisons
  for all using (has_active_role(auth.uid(), 'platform_admin'));


-- ============================================================================
-- food_lens_corrections
-- Append-only log of every member correction. Source of truth for the
-- "learn from corrections" loop -- see doc 6.
-- ============================================================================
create table food_lens_corrections (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  detected_item_id uuid not null references food_lens_detected_items(id),

  correction_type text not null
    check (correction_type in ('label_fixed', 'category_fixed', 'item_removed', 'item_added')),

  original_value jsonb not null,
  corrected_value jsonb not null,

  created_at timestamptz not null default now()
);

create index food_lens_corrections_member_idx on food_lens_corrections(member_id, created_at desc);

alter table food_lens_corrections enable row level security;

create policy member_read_own_food_lens_corrections on food_lens_corrections
  for select using (member_id = auth.uid());
create policy member_insert_own_food_lens_corrections on food_lens_corrections
  for insert with check (member_id = auth.uid());
create policy platform_admin_all_food_lens_corrections on food_lens_corrections
  for all using (has_active_role(auth.uid(), 'platform_admin'));
```

## 3.4 Storage bucket

```sql
-- Private bucket, same per-member-folder RLS pattern as body-assessment-media.
insert into storage.buckets (id, name, public)
values ('food-lens-media', 'food-lens-media', false);

create policy member_manage_own_food_lens_media on storage.objects
  for all using (
    bucket_id = 'food-lens-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

## 3.5 Universal Registry adapter (no new table)

No new table needed for coach/Intelligence Engine visibility. `lib/registry/adapters/foodLens.ts`
(proposed, not built) reshapes `food_lens_pattern_comparisons` rows into `registry_entries` with
`domain: 'nutrition'` — the slot the `RegistryDomain` enum has already reserved. This is the
existing extension point migration 40's docblock calls out by name; no changes to
`registry_entries`' schema, the Intelligence Engine, or the Conversation Coach are needed for
Food Lens findings to start flowing through those systems. See doc 8.

## 3.6 `primal_pattern_profiles`

This table is the **output contract** Food Lens needs from the (separate, not-yet-built) Primal
Pattern Diet questionnaire logic. It is proposed here as a reasonable default shape so Food Lens
has something concrete to build against, but the actual scoring rules that populate it are
explicitly out of scope for this blueprint — see doc 5 for the full discussion of that boundary.

```sql
create table primal_pattern_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  pattern_label text not null,   -- human-readable, owned by the proprietary engine,
                                  -- e.g. 'Protein-Forward Primal'
  protein_emphasis text not null check (protein_emphasis in ('low', 'moderate', 'high')),
  carb_emphasis    text not null check (carb_emphasis    in ('low', 'moderate', 'high')),
  fat_emphasis     text not null check (fat_emphasis     in ('low', 'moderate', 'high')),

  source text not null default 'primal_pattern_questionnaire_v1',
  is_active boolean not null default true,
  supersedes_id uuid references primal_pattern_profiles(id),

  created_at timestamptz not null default now()
);

create unique index primal_pattern_profiles_one_active_per_member
  on primal_pattern_profiles(member_id) where is_active;

alter table primal_pattern_profiles enable row level security;

create policy member_read_own_primal_pattern_profiles on primal_pattern_profiles
  for select using (member_id = auth.uid());
create policy platform_admin_all_primal_pattern_profiles on primal_pattern_profiles
  for all using (has_active_role(auth.uid(), 'platform_admin'));
-- no member insert/update policy: this table is written by the questionnaire
-- scoring logic (service role), not directly by the member.
```
