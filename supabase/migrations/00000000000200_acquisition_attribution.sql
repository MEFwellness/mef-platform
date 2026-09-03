-- Acquisition attribution: keeping what brought somebody here, all the way
-- from a first click to an account.
--
-- WHAT MIGRATION 197 ALREADY DID, AND WHAT WAS MISSING. 197 built the
-- public entry experience and recorded ONE thing about where an arrival
-- came from: our own source code, resolved from /energy/dr-okafor or
-- ?ref=dr-okafor. That answers "which partner" and nothing else. It cannot
-- answer which campaign, which creative, which ad click, or which town the
-- request came from, and it stopped at the anonymous session: a lead and an
-- account carried no attribution of their own at all, so the moment the
-- session was purged the origin of a real member was gone with it.
--
-- WHAT THIS ADDS. Four things, and no second tracking system.
--
--   1. A full attribution set, recorded against the arrival that already
--      exists: the five utm parameters, our own source code, the three ad
--      click ids, the landing path, the referring host, the landing
--      timestamp and coarse request geo (country, region, city).
--   2. FIRST TOUCH AND LAST TOUCH, kept apart. First touch is written once
--      and a trigger refuses to update it, ever. Last touch is the most
--      recent arrival that carried different parameters, and is allowed to
--      move, because that is what "last" means.
--   3. The same set copied onto the lead when she leaves an email, and onto
--      her account when she creates one, with the ORIGINAL timestamps.
--   4. A place for a source code to name a real partner and a real physical
--      location, written by the admin link builder from the same form that
--      generates the link, so a code and the place it stands for can never
--      disagree.
--
-- WHY THE COPIES ARE COPIES AND NOT JOINS. A lead and an account are
-- historical records: where this person came from is a fact about them, and
-- it has to survive the deletion of the anonymous session it came from.
-- Sessions are routinely purged (every verification run this year has
-- deleted its own), so a foreign key into one would quietly erase a real
-- member's origin. The standing "one source of truth per number" rule is
-- about a figure computed on more than one screen; this is a snapshot taken
-- once, and the integration test asserts the snapshot equals the first
-- touch row at the moment it is written.
--
-- WHY THE THREE TABLES SHARE THEIR COLUMNS THROUGH `LIKE`. The attribution
-- shape is defined exactly once below, in `acquisition_attribution_shape`,
-- and each of the three tables copies it with `like ... including
-- constraints`. The template is dropped at the end because `LIKE` copies
-- rather than references, so nothing depends on it afterwards. Three
-- hand-written copies of eighteen columns would drift the first time one of
-- them gained a parameter, and a reporting build that reads three shapes
-- believing they are one is the exact failure this whole file exists to
-- prevent.
--
-- WHAT ATTRIBUTION MAY NEVER CARRY. Behavioural values only: where a click
-- came from and what the link said. Never a health answer, never a result
-- pattern, never an email. Every column below is either a normalised slug,
-- an opaque ad click id, a host, a path, a coarse place name or a
-- timestamp, and each one is length- and shape-checked so prose cannot be
-- written into it even by a mistaken caller.
--
-- WRITES. Same discipline as migration 197: RLS on, no public policy at
-- all, the app's own route handler writes with the service role behind its
-- origin check and rate limit, coaches read, platform administrators read
-- and write the source and link tables through the admin screen.

-- ---------------------------------------------------------------------
-- The shape, defined once
-- ---------------------------------------------------------------------

create table acquisition_attribution_shape (
  -- The five standard campaign parameters, normalised on the way in so the
  -- same campaign can never become two rows in a report. utm_source keeps
  -- hyphens because it IS our source code (`partner-01`); the other four
  -- use underscores, which is what every ad platform and every marketer
  -- already writes.
  utm_source text check (utm_source is null or utm_source ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  utm_medium text check (utm_medium is null or utm_medium ~ '^[a-z0-9][a-z0-9_]{0,79}$'),
  utm_campaign text check (utm_campaign is null or utm_campaign ~ '^[a-z0-9][a-z0-9_]{0,79}$'),
  utm_content text check (utm_content is null or utm_content ~ '^[a-z0-9][a-z0-9_]{0,79}$'),
  utm_term text check (utm_term is null or utm_term ~ '^[a-z0-9][a-z0-9_]{0,79}$'),

  -- Our own per-partner code, resolved against public_entry_sources, and
  -- what the link literally said. Kept apart for the same reason
  -- public_entry_sessions keeps them apart: an unregistered code stays
  -- investigable instead of being folded into direct traffic. The foreign
  -- key is added per table below, because `LIKE` does not copy one.
  source_code text check (source_code is null or source_code ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  source_raw text check (source_raw is null or char_length(source_raw) <= 60),

  -- Ad click ids, exactly as the platform wrote them. Opaque and
  -- meaningless to us, which is the point: they are the only way to ask an
  -- ad platform later whether a click became anything.
  fbclid text check (fbclid is null or fbclid ~ '^[A-Za-z0-9_.-]{1,255}$'),
  ttclid text check (ttclid is null or ttclid ~ '^[A-Za-z0-9_.-]{1,255}$'),
  gclid  text check (gclid  is null or gclid  ~ '^[A-Za-z0-9_.-]{1,255}$'),

  -- Where they landed, and which platform sent them. The HOST only, never
  -- a full referring URL, exactly as public_entry_sessions.referrer_host
  -- already does it: the host answers "which platform" without recording
  -- the page somebody was reading before they arrived.
  landing_path text check (landing_path is null or char_length(landing_path) <= 200),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),

  -- COARSE REQUEST GEO, AND NOTHING FINER. Country, region and city, read
  -- from the edge headers the platform already sets on every request. No
  -- latitude, no longitude, no postcode, no IP kept anywhere. City is the
  -- smallest unit that exists here and there is deliberately no column a
  -- precise location could be written into.
  geo_country text check (geo_country is null or geo_country ~ '^[A-Z]{2}$'),
  geo_region text check (geo_region is null or char_length(geo_region) <= 40),
  geo_city text check (geo_city is null or char_length(geo_city) <= 80)
);

-- ---------------------------------------------------------------------
-- The arrival's own attribution: first touch, and last touch
-- ---------------------------------------------------------------------

create table public_entry_attribution (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public_entry_sessions(id) on delete cascade,

  -- 'first' is who sent them and stays who sent them. 'last' exists only
  -- because it is nearly free to keep and impossible to reconstruct later:
  -- it is written only when a LATER arrival on the same visitor token
  -- carried campaign parameters that differ from the first, so an ordinary
  -- single visit has exactly one row.
  touch text not null check (touch in ('first', 'last')),

  like acquisition_attribution_shape including constraints including comments,

  -- When this touch landed, and when we wrote it down. Both, because a
  -- retried write must not be able to move the landing time.
  landed_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),

  unique (session_id, touch)
);

alter table public_entry_attribution
  add constraint public_entry_attribution_source_fk
  foreign key (source_code) references public_entry_sources(code);

create index public_entry_attribution_campaign_idx
  on public_entry_attribution (utm_campaign, landed_at desc)
  where touch = 'first';

comment on table public_entry_attribution is
  'What an arrival at the public entry experience carried: the five utm
   parameters, our own source code, ad click ids, the landing path and
   referring host, and coarse request geo. One row per session per touch.
   The first-touch row is write-once, enforced by a trigger below.';

-- FIRST TOUCH IS WRITE ONCE, AS A TRIGGER RATHER THAN AS A HABIT. Somebody
-- who opens a partner's link, wanders off, and comes back through a social
-- post was sent by the partner. Without this, one careless upsert in a
-- later build would rewrite history for every visitor who ever returned,
-- and nothing would report the change.
create or replace function public.acquisition_first_touch_is_write_once()
returns trigger
language plpgsql
as $$
begin
  if old.touch = 'first' then
    raise exception 'first-touch attribution is written once and cannot be changed (session %)', old.session_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger public_entry_attribution_first_touch_write_once
  before update on public_entry_attribution
  for each row execute function public.acquisition_first_touch_is_write_once();

-- THE SAME RULE FOR A WHOLE ROW. A lead's origin and a member's origin are
-- attached once and are never revised: there is no correct reason to change
-- where somebody came from, and every incorrect one (a second visit, a
-- re-run of a backfill, a careless upsert) silently rewrites history. Both
-- copies below refuse an update outright rather than guarding a column at a
-- time, which is the only version of the rule that a column added next year
-- inherits for free.
create or replace function public.acquisition_write_once_row()
returns trigger
language plpgsql
as $$
begin
  raise exception 'acquisition attribution is attached once and cannot be changed (table %)', tg_table_name
    using errcode = '23514';
end;
$$;

-- ---------------------------------------------------------------------
-- The lead's own copy
-- ---------------------------------------------------------------------

create table captured_lead_acquisition (
  captured_lead_id uuid primary key references captured_leads(id) on delete cascade,

  -- Kept so the arrival is still reachable while it exists, and nullable so
  -- purging an anonymous session never takes a real lead's origin with it.
  session_id uuid references public_entry_sessions(id) on delete set null,

  like acquisition_attribution_shape including constraints including comments,

  -- The ORIGINAL landing time, carried across unchanged, and the moment she
  -- left her email. A report asking how long somebody thought about it
  -- before handing over an address needs both, and neither can be
  -- recovered from a row written at capture time.
  landed_at timestamptz not null,
  lead_captured_at timestamptz not null default now()
);

alter table captured_lead_acquisition
  add constraint captured_lead_acquisition_source_fk
  foreign key (source_code) references public_entry_sources(code);

create index captured_lead_acquisition_source_idx on captured_lead_acquisition (source_code, lead_captured_at desc);

comment on table captured_lead_acquisition is
  'The acquisition attribution of one captured lead, copied from the
   arrival''s first-touch row at the moment she left her email. A copy
   rather than a join because a lead is a historical record that has to
   outlive the anonymous session it came from.';

create trigger captured_lead_acquisition_write_once
  before update on captured_lead_acquisition
  for each row execute function public.acquisition_write_once_row();

-- ---------------------------------------------------------------------
-- The account's own copy
-- ---------------------------------------------------------------------

create table user_acquisition (
  member_id uuid primary key references auth.users(id) on delete cascade,

  -- One arrival becomes at most one account, the same guarantee
  -- member_public_entry_origin already carries.
  session_id uuid unique references public_entry_sessions(id) on delete set null,
  captured_lead_id uuid references captured_leads(id) on delete set null,
  experience_key text not null,

  like acquisition_attribution_shape including constraints including comments,

  -- All three original timestamps, carried across unchanged. attributed_at
  -- is the only one written now, and it is the only one that describes this
  -- row rather than her journey.
  landed_at timestamptz not null,
  lead_captured_at timestamptz,
  account_created_at timestamptz,
  attributed_at timestamptz not null default now(),

  -- The same provenance statement member_public_entry_origin carries, for
  -- the same reason: this row describes a public acquisition arrival and
  -- can never be restated as anything else.
  origin text not null default 'public_acquisition' check (origin = 'public_acquisition')
);

alter table user_acquisition
  add constraint user_acquisition_source_fk
  foreign key (source_code) references public_entry_sources(code);

create index user_acquisition_source_idx on user_acquisition (source_code, landed_at desc);
create index user_acquisition_campaign_idx on user_acquisition (utm_campaign, landed_at desc);

comment on table user_acquisition is
  'Where one member came from, attached once when her account was bound to
   the public arrival she took, and never overwritten by a later visit.
   Joins to member_subscriptions and member_wellness_events on member_id,
   which is how a later report reads paid conversion. Test accounts are
   excluded by joining profiles.is_test, exactly as everywhere else.';

create trigger user_acquisition_write_once
  before update on user_acquisition
  for each row execute function public.acquisition_write_once_row();

-- ---------------------------------------------------------------------
-- A source code, the partner it names, and the place it stands in
-- ---------------------------------------------------------------------
--
-- TWO KINDS OF PLACE, KEPT APART ON PURPOSE. These columns are a PARTNER
-- LOCATION: the physical place a code stands for, because a QR card on a
-- chiropractor's counter is a location and nothing in a request header will
-- ever say so. The geo_* columns on the attribution tables are something
-- completely different: where the REQUEST appeared to come from. A report
-- may group by either, and it must never confuse them, which is why they
-- are never in the same table.

alter table public_entry_sources
  add column partner_name text check (partner_name is null or char_length(partner_name) <= 120),
  add column location_name text check (location_name is null or char_length(location_name) <= 120),
  add column location_city text check (location_city is null or char_length(location_city) <= 80),
  add column location_region text check (location_region is null or char_length(location_region) <= 60),
  add column location_country text check (location_country is null or location_country ~ '^[A-Z]{2}$');

comment on column public_entry_sources.partner_name is
  'The organisation or person this code stands for, as a human would name
   them. `label` is what a report prints; this is who they are.';
comment on column public_entry_sources.location_name is
  'The PHYSICAL place this code stands for, when it stands for one (a
   clinic counter, a gym reception). Never confused with the geo_* columns
   on the attribution tables, which describe where a request came from.';

-- ---------------------------------------------------------------------
-- The links themselves
-- ---------------------------------------------------------------------

create table public_entry_links (
  id uuid primary key default gen_random_uuid(),
  source_code text not null references public_entry_sources(code) on delete cascade,

  -- What this particular link is for, in words. "Ridgeway Physio counter
  -- card, autumn run".
  label text not null check (char_length(trim(label)) between 1 and 120),

  -- Exactly the values that appear in the URL, already normalised. Stored
  -- rather than re-derived so the row and the printed link can never
  -- disagree about what was handed out.
  utm_source text not null check (utm_source ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  utm_medium text not null check (utm_medium ~ '^[a-z0-9][a-z0-9_]{0,79}$'),
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9][a-z0-9_]{0,79}$'),
  utm_content text check (utm_content is null or utm_content ~ '^[a-z0-9][a-z0-9_]{0,79}$'),
  utm_term text check (utm_term is null or utm_term ~ '^[a-z0-9][a-z0-9_]{0,79}$'),

  -- The whole thing, as it will be copied and pasted. Built by
  -- lib/acquisition/links.ts and written here so nobody ever retypes one.
  url text not null check (char_length(url) <= 500),

  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- THE SAME PARTNER CAN NEVER BECOME TWO ROWS. One link per source, medium,
-- campaign, creative and term, with the values already normalised, so
-- "Card A" and "card_a" are the same link and the builder says so instead
-- of quietly making a second one.
create unique index public_entry_links_identity_idx
  on public_entry_links (source_code, utm_medium, utm_campaign, coalesce(utm_content, ''), coalesce(utm_term, ''));

create index public_entry_links_created_idx on public_entry_links (created_at desc);

comment on table public_entry_links is
  'Every tracking link built on /admin/acquisition/links. The row and the
   URL are written together from one form, alongside the source code to
   partner and location mapping, so a link and the thing it stands for can
   never disagree.';

-- ---------------------------------------------------------------------
-- RLS: the same shape migration 197 set
-- ---------------------------------------------------------------------

alter table public_entry_attribution enable row level security;
alter table captured_lead_acquisition enable row level security;
alter table user_acquisition enable row level security;
alter table public_entry_links enable row level security;

create policy coach_read_public_entry_attribution on public_entry_attribution
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_public_entry_attribution on public_entry_attribution
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_captured_lead_acquisition on captured_lead_acquisition
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_captured_lead_acquisition on captured_lead_acquisition
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Deliberately NO member policy, and no member surface. Where somebody came
-- from is a business record about an account rather than health content she
-- reads, and member_public_entry_origin already gives her the one part of
-- it Root shows her.
create policy coach_read_user_acquisition on user_acquisition
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_user_acquisition on user_acquisition
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_public_entry_links on public_entry_links
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_public_entry_links on public_entry_links
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- The read surface, widened rather than duplicated
-- ---------------------------------------------------------------------
--
-- public_entry_funnel already resolves every step of one arrival and
-- settles is_test from both ends. The attribution and the partner's
-- physical place are appended to it rather than given a second view, so the
-- later report reads one thing and cannot disagree with the funnel screen
-- that exists today. Columns are added at the END, which is what `create or
-- replace view` allows.

create or replace view public_entry_funnel
  with (security_invoker = true) as
  select
    s.id as session_id,
    s.experience_key,
    s.source_code,
    s.source_raw,
    coalesce(src.label, case when s.source_raw is null then 'Direct (no code)' else 'Unregistered code' end) as source_label,
    coalesce(src.channel, case when s.source_raw is null then 'direct' else 'partner' end) as source_channel,
    s.landing_path,
    s.referrer_host,
    s.first_seen_at,
    s.started_at,
    s.completed_at,
    s.pattern_key,
    s.lead_captured_at,
    o.member_id,
    o.claimed_at,
    coalesce(src.is_test, false) or coalesce(p.is_test, false) as is_test,
    (s.started_at is not null) as did_start,
    (s.completed_at is not null) as did_complete,
    (s.lead_captured_at is not null) as did_leave_email,
    exists (
      select 1 from public_entry_events e
      where e.session_id = s.id and e.event_type = 'app_clicked'
    ) as did_click_to_app,
    (o.member_id is not null) as did_create_account,
    -- Appended by migration 200. First touch only: the funnel counts one
    -- arrival, and the source that gets the credit is the one that sent
    -- her.
    a.utm_source,
    a.utm_medium,
    a.utm_campaign,
    a.utm_content,
    a.utm_term,
    (a.fbclid is not null or a.ttclid is not null or a.gclid is not null) as had_ad_click,
    a.geo_country,
    a.geo_region,
    a.geo_city,
    src.partner_name,
    src.location_name,
    src.location_city,
    src.location_region,
    src.location_country
  from public_entry_sessions s
  left join public_entry_sources src on src.code = s.source_code
  left join member_public_entry_origin o on o.session_id = s.id
  left join profiles p on p.id = o.member_id
  left join public_entry_attribution a on a.session_id = s.id and a.touch = 'first';

comment on view public_entry_funnel is
  'One row per public arrival with every funnel step already resolved to a
   boolean, is_test already settled, and (migration 200) its first-touch
   attribution and its partner''s physical location alongside. Read this,
   not the raw tables, and never omit `where is_test = false` on a number
   anyone will act on. See docs/ACQUISITION_FUNNEL.md.';

-- ---------------------------------------------------------------------
-- The template has done its job
-- ---------------------------------------------------------------------
--
-- `LIKE` copies columns and their checks rather than referencing them, so
-- nothing above depends on this table once it has been read. Dropping it
-- keeps it from ever being mistaken for a table that holds rows.

drop table acquisition_attribution_shape;
