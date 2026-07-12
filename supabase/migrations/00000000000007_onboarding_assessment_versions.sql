-- Architecture v2.1, Section B.2.
create table onboarding_assessment_versions (
  id uuid primary key default gen_random_uuid(),
  assessment_version int unique not null,
  released_at timestamptz not null default now(),
  retired_at timestamptz
);
