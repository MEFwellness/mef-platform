-- Architecture v2.1, Section B.1.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id),
  display_name text,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on column profiles.timezone is
  'IANA zone name, e.g. America/New_York. This is the profile default only —
   every check-in and submission stores its own timezone captured at the
   moment of submission, per Architecture v2.1 time semantics.';
