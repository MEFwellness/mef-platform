-- Daily Coaching Feed.
--
-- Three tables:
--
--   mef_content_items    the curated MEF Knowledge Library — reviewed,
--                        versioned lesson/action/reflection bundles.
--                        Nothing here is generated per-request; the feed
--                        selector (lib/feed/selector.ts) picks from this
--                        library and personalizes only the introduction
--                        ("Today's Focus" / "Why You're Seeing This"),
--                        never the educational core.
--   daily_feed_items      one row per member per local_date — the actual
--                        delivered feed, linking a member to the content
--                        item selected for them that day, plus their
--                        engagement state (completed/saved/dismissed/
--                        reflected). Historical rows are never deleted,
--                        so a member can always revisit a past day.
--   daily_feed_events     append-only analytics/learning signals
--                        (impression, opened, completed, helpful, ...) —
--                        structured now so a future outcome-learning
--                        engine (Milestone 4) has real data to work from,
--                        without building that engine yet.
--
-- RLS follows the same established pattern: a member reads/updates their
-- own feed; an assigned coach may preview, pin, replace, and annotate;
-- the content library itself is admin-authored, readable by any
-- authenticated user once published.

create table mef_content_items (
  id uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  title text not null,
  summary text not null,
  body text not null,
  estimated_reading_minutes int not null check (estimated_reading_minutes >= 1),
  four_doctors_category text not null check (four_doctors_category in (
    'doctor_diet', 'doctor_quiet', 'doctor_movement', 'doctor_happiness'
  )),
  topics jsonb not null default '[]'::jsonb,
  symptoms_or_concerns jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  -- The classification this content is safe to be delivered at without
  -- further review — deliberately excludes coach_review_required /
  -- safety_response_only: content needing that level of caution doesn't
  -- belong in an auto-delivered library at all. See lib/feed/eligibility.ts.
  safety_classification text not null default 'standard_coaching' check (safety_classification in (
    'standard_coaching', 'coaching_with_caution', 'medical_evaluation_recommended'
  )),
  -- Topic tags that, if currently restricted for a member (Milestone 1),
  -- exclude this item from their feed — e.g. a movement-intensity lesson
  -- tagged 'pain_severity' won't be selected while that topic is restricted.
  contraindication_tags jsonb not null default '[]'::jsonb,
  -- Array of { title, url } — never framed as endorsing an individualized
  -- recommendation, just where the general education came from.
  evidence_sources jsonb not null default '[]'::jsonb,
  author text not null default 'MEF Wellness Team',
  reviewer text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  version int not null default 1,
  publication_date date,
  last_reviewed_date date,
  content_format text not null default 'lesson' check (content_format in (
    'lesson', 'tip', 'reflection_prompt', 'practice'
  )),
  difficulty_level text not null default 'beginner' check (difficulty_level in (
    'beginner', 'intermediate', 'advanced'
  )),
  -- e.g. { "priorityMetric": "stress" } — matched against a member's
  -- current lowest-scoring wellness metric by lib/feed/eligibility.ts.
  eligibility_rules jsonb not null default '{}'::jsonb,
  -- Today's Action / Today's Reflection — bundled with the lesson as one
  -- reviewed unit rather than three separately-assembled pieces.
  suggested_action text not null,
  reflection_prompt text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mef_content_items_published_idx on mef_content_items (four_doctors_category) where status = 'published';

alter table mef_content_items enable row level security;

create policy authenticated_read_published_content on mef_content_items
  for select
  using (
    auth.role() = 'authenticated'
    and (status = 'published' or public.has_active_role(auth.uid(), 'platform_administrator'))
  );

create policy platform_admin_all_content on mef_content_items
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- daily_feed_items
-- ============================================================
create table daily_feed_items (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  content_item_id uuid not null references mef_content_items(id),
  focus_text text not null,
  why_text text not null,
  selection_reasons jsonb not null default '{}'::jsonb,
  safety_classification_id uuid references safety_classifications(id) on delete set null,
  coach_assigned_by uuid references auth.users(id) on delete set null,
  coach_note text,
  replaced_content_item_id uuid references mef_content_items(id) on delete set null,
  completed_at timestamptz,
  saved_at timestamptz,
  dismissed_at timestamptz,
  reflection_response text,
  reflection_submitted_at timestamptz,
  -- Tri-state: null = not rated, true = helpful, false = not helpful.
  helpful boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, local_date)
);

create index daily_feed_items_member_idx on daily_feed_items (member_id, local_date desc);

alter table daily_feed_items enable row level security;

create policy member_insert_own_feed_items on daily_feed_items
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_feed_items on daily_feed_items
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_read_own_feed_items on daily_feed_items
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_feed_items on daily_feed_items
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- A member updates their own engagement state (completed/saved/dismissed/
-- reflection/helpful) — column-level restriction isn't expressible in
-- RLS, enforced in application code (lib/feed/), same trust boundary as
-- every other update policy in this schema that works this way.
create policy member_update_own_feed_items on daily_feed_items
  for update
  using (member_id = auth.uid());

-- A coach pins/replaces/assigns/annotates a client's feed.
create policy coach_update_assigned_feed_items on daily_feed_items
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_feed_items on daily_feed_items
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- daily_feed_events (analytics/learning signals — structured for a
-- future Milestone 4 outcome-learning engine, not built yet)
-- ============================================================
create table daily_feed_events (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null references daily_feed_items(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'impression', 'opened', 'completed', 'saved', 'dismissed', 'action_completed',
    'reflection_submitted', 'helpful', 'not_helpful', 'content_repeated', 'coach_replacement'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index daily_feed_events_feed_item_idx on daily_feed_events (feed_item_id, created_at desc);
create index daily_feed_events_member_idx on daily_feed_events (member_id, created_at desc);

alter table daily_feed_events enable row level security;

create policy member_insert_own_feed_events on daily_feed_events
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_feed_events on daily_feed_events
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_read_own_feed_events on daily_feed_events
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_feed_events on daily_feed_events
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_feed_events on daily_feed_events
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- get_member_restricted_topics — the feed selector (lib/feed/eligibility.ts)
-- needs to know which topics are currently restricted for a member
-- (Milestone 1) so it can exclude contraindicated content. But
-- safety_review_queue (migration 28) deliberately has no member SELECT
-- policy — it's coach-internal working data (coach_notes, resolution).
-- Rather than exposing that whole table to members, this mirrors the
-- has_active_role/is_active_coach_for pattern: a narrow SECURITY DEFINER
-- function that returns only the topic list for still-open cases, nothing
-- else about the case. Callable by the member themselves, their assigned
-- coach, or a platform administrator.
-- ============================================================
create or replace function public.get_member_restricted_topics(p_member uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct topic), array[]::text[])
  from safety_review_queue,
       jsonb_array_elements_text(restrictions_applied -> 'restrictedTopics') as topic
  where member_id = p_member
    and status not in ('closed', 'approved_for_limited_coaching')
    and (
      p_member = auth.uid()
      or public.is_active_coach_for(auth.uid(), p_member)
      or public.has_active_role(auth.uid(), 'platform_administrator')
    );
$$;

revoke all on function public.get_member_restricted_topics(uuid) from public;
grant execute on function public.get_member_restricted_topics(uuid) to authenticated, service_role;
